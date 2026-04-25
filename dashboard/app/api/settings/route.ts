import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { REPLY_STYLES } from "@/lib/plans";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { replyStyle: true, customStyleNote: true }
  });
  return NextResponse.json({ settings: user });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { replyStyle, customStyleNote } = await req.json();
  const data: any = {};
  if (replyStyle && Object.keys(REPLY_STYLES).includes(replyStyle)) data.replyStyle = replyStyle;
  if (typeof customStyleNote === "string") data.customStyleNote = customStyleNote.slice(0, 500);

  const user = await prisma.user.update({
    where: { id: session.sub },
    data,
    select: { replyStyle: true, customStyleNote: true }
  });
  return NextResponse.json({ settings: user });
}
