export const PLANS = {
  trial: {
    key: "trial",
    name: "Trial",
    priceUSD: 2,
    days: 10,
    dailyLimit: 50,
    model: "gpt-4o-mini",
    perks: [
      "50 comments / day",
      "10 days full access",
      "Try before you commit"
    ]
  },
  starter: {
    key: "starter",
    name: "Starter",
    priceUSD: 5,
    days: 30,
    dailyLimit: 100,
    model: "gpt-4o-mini",
    perks: [
      "100 comments / day",
      "Standard model",
      "Email support"
    ]
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceUSD: 10,
    days: 30,
    dailyLimit: 250,
    model: "gpt-4o-mini",
    perks: [
      "250 comments / day",
      "Standard model",
      "Priority queue"
    ]
  },
  premium: {
    key: "premium",
    name: "Premium",
    priceUSD: 30,
    days: 30,
    dailyLimit: 1500,
    model: "gpt-4o",
    perks: [
      "1,500 comments / day  (6× Pro)",
      "GPT-4o premium model",
      "Custom prompt templates",
      "Multiple X accounts",
      "Priority support"
    ],
    featured: true
  }
} as const;

export type PlanKey = keyof typeof PLANS;

