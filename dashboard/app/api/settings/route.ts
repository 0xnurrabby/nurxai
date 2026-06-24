import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey, REPLY_STYLES } from "@/lib/plans";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

function cleanName(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 60) || null;
}

function cleanAvatarUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.length > 120_000) return undefined;
  if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    return url.toString().slice(0, 2000);
  } catch {
    return undefined;
  }
}

async function getActivePlan(userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "active", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" }
  });
  if (!sub) return null;
  return PLANS[sub.plan as PlanKey] || null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { replyStyle: true, customStyleNote: true, name: true, avatarUrl: true }
  });
  // Also return the user's plan flags so the settings UI can lock features it
  // doesn't have access to (instead of letting the user submit and 403).
  const plan = await getActivePlan(session.sub);
  return NextResponse.json({
    settings: user,
    plan: plan
      ? {
          key: plan.key,
          name: plan.name,
          allowStyles: plan.allowStyles,
          allowProjects: plan.allowProjects,
          vision: plan.vision,
          qualityTier: plan.qualityTier
        }
      : null
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const { replyStyle, customStyleNote, name, avatarUrl } = await req.json().catch(() => ({}));
  const data: any = {};
  const wantsStyleChange = replyStyle !== undefined || customStyleNote !== undefined;
  const plan = wantsStyleChange ? await getActivePlan(session.sub) : null;
  if (wantsStyleChange && !plan) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 402 });

  if (name !== undefined) {
    data.name = cleanName(name);
  }

  if (avatarUrl !== undefined) {
    const cleanAvatar = cleanAvatarUrl(avatarUrl);
    if (cleanAvatar === undefined) {
      return NextResponse.json(
        { error: "BAD_AVATAR", message: "Use a valid image URL or a small PNG/JPG/WebP upload." },
        { status: 400 }
      );
    }
    data.avatarUrl = cleanAvatar;
  }

  // PLAN GATE: only allowStyles plans can change style or set custom note.
  if (replyStyle && Object.keys(REPLY_STYLES).includes(replyStyle)) {
    if (!plan?.allowStyles && replyStyle !== "default") {
      return NextResponse.json(
        {
          error: "PLAN_LOCKED",
          feature: "styles",
          message:
            "Reply styles are available on Starter and above. Upgrade to unlock."
        },
        { status: 403 }
      );
    }
    data.replyStyle = replyStyle;
  }

  if (typeof customStyleNote === "string") {
    if (!plan?.allowStyles && customStyleNote.trim() !== "") {
      return NextResponse.json(
        {
          error: "PLAN_LOCKED",
          feature: "styles",
          message:
            "Custom style note is available on Starter and above."
        },
        { status: 403 }
      );
    }
    data.customStyleNote = customStyleNote.slice(0, 500);
  }

  if (Object.keys(data).length === 0) {
    const cur = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { replyStyle: true, customStyleNote: true, name: true, avatarUrl: true }
    });
    return NextResponse.json({ settings: cur });
  }

  const user = await prisma.user.update({
    where: { id: session.sub },
    data,
    select: { replyStyle: true, customStyleNote: true, name: true, avatarUrl: true }
  });
  return NextResponse.json({ settings: user });
}
