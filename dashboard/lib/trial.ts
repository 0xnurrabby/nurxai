import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/plans";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialState = "created" | "active" | "used";

export function getTrialEndsAt(startsAt = new Date()) {
  return new Date(startsAt.getTime() + PLANS.trial.days * DAY_MS);
}

export async function createTrialSubscription(
  tx: Prisma.TransactionClient,
  userId: string,
  startsAt = new Date()
) {
  const endsAt = getTrialEndsAt(startsAt);
  const subscription = await tx.subscription.create({
    data: {
      userId,
      plan: "trial",
      status: "active",
      dailyLimit: PLANS.trial.dailyLimit,
      startsAt,
      endsAt
    }
  });

  await tx.auditLog.create({
    data: {
      userId,
      event: "trial_started",
      meta: {
        plan: "trial",
        days: PLANS.trial.days,
        dailyLimit: PLANS.trial.dailyLimit,
        endsAt: endsAt.toISOString()
      } as any
    }
  });

  return subscription;
}

export async function ensureTrialSubscription(userId: string): Promise<{
  state: TrialState;
  subscription: Awaited<ReturnType<typeof prisma.subscription.findFirst>>;
}> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const active = await tx.subscription.findFirst({
      where: { userId, status: "active", endsAt: { gt: now } },
      orderBy: { endsAt: "desc" }
    });
    if (active) return { state: "active", subscription: active };

    const usedTrial = await tx.subscription.findFirst({
      where: { userId, plan: "trial" },
      orderBy: { startsAt: "asc" }
    });
    if (usedTrial) return { state: "used", subscription: null };

    const subscription = await createTrialSubscription(tx, userId, now);
    return { state: "created", subscription };
  });
}
