import { prisma } from "@/lib/db";
import { PLANS, PlanKey } from "@/lib/plans";

const DAY_MS = 24 * 60 * 60 * 1000;

export const PAID_PLAN_ORDER: Record<Exclude<PlanKey, "trial">, number> = {
  starter: 1,
  pro: 2,
  premium: 3
};

export type ActiveSubscription = Awaited<ReturnType<typeof getCurrentSubscription>>;

export function isPaidPlanKey(plan: string): plan is Exclude<PlanKey, "trial"> {
  return plan === "starter" || plan === "pro" || plan === "premium";
}

export async function getCurrentSubscription(userId: string) {
  return getCurrentSubscriptionForUser(userId);
}

export async function getCurrentSubscriptionForUser(
  userId: string,
  tx: any = prisma,
  now = new Date()
) {
  const current = await tx.subscription.findFirst({
    where: {
      userId,
      status: "active",
      startsAt: { lte: now },
      endsAt: { gt: now }
    },
    orderBy: { endsAt: "desc" }
  });
  if (!current || current.plan !== "trial") return current;

  const queuedPaid = await tx.subscription.findFirst({
    where: {
      userId,
      status: "active",
      startsAt: { gt: now },
      endsAt: { gt: now },
      plan: { in: ["starter", "pro", "premium"] }
    },
    orderBy: { startsAt: "asc" }
  });
  if (!queuedPaid) return current;

  const queuedPlan = PLANS[queuedPaid.plan as PlanKey];
  if (!queuedPlan || queuedPlan.priceUSD <= 0) return current;

  await tx.subscription.update({
    where: { id: current.id },
    data: { status: "replaced", endsAt: now }
  });

  return tx.subscription.update({
    where: { id: queuedPaid.id },
    data: {
      startsAt: now,
      endsAt: new Date(now.getTime() + queuedPlan.days * DAY_MS),
      dailyLimit: queuedPlan.dailyLimit,
      status: "active"
    }
  });
}

export function getUpgradeQuote(plan: PlanKey, current: ActiveSubscription) {
  const targetPlan = PLANS[plan];
  if (!targetPlan || targetPlan.priceUSD <= 0) {
    return {
      kind: "free" as const,
      amountUSD: 0,
      currentPlan: current?.plan || null,
      targetPlan: plan,
      startsAt: null,
      endsAt: null
    };
  }

  const currentPlanKey = current?.plan as PlanKey | undefined;
  const currentPlan =
    currentPlanKey && isPaidPlanKey(currentPlanKey) ? PLANS[currentPlanKey] : null;
  const isUpgrade =
    Boolean(current && currentPlan && isPaidPlanKey(plan)) &&
    PAID_PLAN_ORDER[plan as Exclude<PlanKey, "trial">] > PAID_PLAN_ORDER[currentPlanKey as Exclude<PlanKey, "trial">];

  if (isUpgrade && current && currentPlan) {
    const amountUSD = Math.max(0, targetPlan.priceUSD - currentPlan.priceUSD);
    return {
      kind: "upgrade" as const,
      amountUSD,
      currentPlan: current.plan,
      targetPlan: plan,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      currentSubscriptionId: current.id
    };
  }

  const now = new Date();
  const startsAt = current?.plan === "trial" ? now : current ? current.endsAt : now;
  const endsAt = new Date(startsAt.getTime() + targetPlan.days * 24 * 60 * 60 * 1000);
  return {
    kind: current && current.plan !== "trial" ? "renewal" as const : "new" as const,
    amountUSD: targetPlan.priceUSD,
    currentPlan: current?.plan || null,
    targetPlan: plan,
    startsAt,
    endsAt
  };
}

export function paymentRawWithQuote(raw: unknown, quote: ReturnType<typeof getUpgradeQuote>) {
  const existing =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    ...existing,
    quote: {
      kind: quote.kind,
      amountUSD: quote.amountUSD,
      currentPlan: quote.currentPlan,
      targetPlan: quote.targetPlan,
      startsAt: quote.startsAt instanceof Date ? quote.startsAt.toISOString() : quote.startsAt,
      endsAt: quote.endsAt instanceof Date ? quote.endsAt.toISOString() : quote.endsAt,
      currentSubscriptionId: "currentSubscriptionId" in quote ? quote.currentSubscriptionId : undefined
    }
  };
}

function readQuote(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const quote = (raw as Record<string, unknown>).quote;
  return quote && typeof quote === "object" && !Array.isArray(quote)
    ? quote as Record<string, unknown>
    : null;
}

function safeDate(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function activatePaidSubscription(
  tx: any,
  payment: {
    id: string;
    userId: string;
    plan: string;
    raw: unknown;
    providerId: string;
  },
  now = new Date()
) {
  const plan = PLANS[payment.plan as PlanKey];
  if (!plan || plan.priceUSD <= 0) return null;
  const paymentPlanKey = payment.plan;

  const quote = readQuote(payment.raw);
  const quoteKind = typeof quote?.kind === "string" ? quote.kind : "";
  const quoteSubscriptionId =
    typeof quote?.currentSubscriptionId === "string" ? quote.currentSubscriptionId : "";

  const currentActive = await tx.subscription.findFirst({
    where: {
      userId: payment.userId,
      status: "active",
      startsAt: { lte: now },
      endsAt: { gt: now }
    },
    orderBy: { endsAt: "desc" }
  });

  if (quoteKind === "upgrade" && isPaidPlanKey(paymentPlanKey)) {
    const current = quoteSubscriptionId
      ? await tx.subscription.findFirst({
          where: {
            id: quoteSubscriptionId,
            userId: payment.userId,
            status: "active",
            startsAt: { lte: now },
            endsAt: { gt: now }
          }
        })
      : currentActive;

    const currentPlanKey = current?.plan;
    const targetRank = PAID_PLAN_ORDER[paymentPlanKey];
    const currentRank = isPaidPlanKey(String(currentPlanKey))
      ? PAID_PLAN_ORDER[currentPlanKey as Exclude<PlanKey, "trial">]
      : 0;

    if (current && currentRank > 0 && targetRank > currentRank) {
      const updated = await tx.subscription.update({
        where: { id: current.id },
        data: {
          plan: payment.plan,
          dailyLimit: plan.dailyLimit
        }
      });
      return {
        kind: "upgrade" as const,
        subscription: updated,
        startsAt: updated.startsAt,
        endsAt: updated.endsAt
      };
    }
  }

  if (currentActive?.plan === "trial") {
    await tx.subscription.update({
      where: { id: currentActive.id },
      data: { status: "replaced", endsAt: now }
    });
    await tx.subscription.updateMany({
      where: {
        userId: payment.userId,
        status: "active",
        startsAt: { gt: now },
        plan: payment.plan
      },
      data: { status: "replaced" }
    });

    const endsAt = new Date(now.getTime() + plan.days * DAY_MS);
    const subscription = await tx.subscription.create({
      data: {
        userId: payment.userId,
        plan: payment.plan,
        status: "active",
        startsAt: now,
        dailyLimit: plan.dailyLimit,
        endsAt
      }
    });
    return {
      kind: "new" as const,
      subscription,
      startsAt: now,
      endsAt
    };
  }

  const quoteStartsAt = safeDate(quote?.startsAt);
  const futureBase = await tx.subscription.findFirst({
    where: {
      userId: payment.userId,
      status: "active",
      endsAt: { gt: now }
    },
    orderBy: { endsAt: "desc" }
  });
  const startsAt = [quoteStartsAt, futureBase?.endsAt, now]
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const endsAt = new Date(startsAt.getTime() + plan.days * DAY_MS);

  const subscription = await tx.subscription.create({
    data: {
      userId: payment.userId,
      plan: payment.plan,
      status: "active",
      startsAt,
      dailyLimit: plan.dailyLimit,
      endsAt
    }
  });
  return {
    kind: futureBase ? "renewal" as const : "new" as const,
    subscription,
    startsAt,
    endsAt
  };
}
