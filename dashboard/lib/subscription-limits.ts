import { PLANS, PlanKey } from "@/lib/plans";

export const LEGACY_DAILY_LIMITS: Record<PlanKey, number> = {
  trial: 10,
  starter: 60,
  pro: 150,
  premium: 500
};

export function getSubscriptionDailyLimit(sub: { plan: string; dailyLimit?: number | null }) {
  if (Number.isFinite(sub.dailyLimit) && Number(sub.dailyLimit) > 0) {
    return Math.floor(Number(sub.dailyLimit));
  }

  const planKey = sub.plan as PlanKey;
  return LEGACY_DAILY_LIMITS[planKey] ?? PLANS[planKey]?.dailyLimit ?? 0;
}
