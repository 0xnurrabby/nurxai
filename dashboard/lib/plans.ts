// Quality tier drives the system prompt strength + temperature + max_tokens
// in the generate route. allowStyles / allowProjects / vision are hard gates
// that the API enforces (refuses non-default style writes, refuses project
// creation, ignores image URLs) so a trial user can never accidentally
// access a higher-tier feature.
export const PLANS = {
  trial: {
    key: "trial",
    name: "Trial",
    priceUSD: 2,
    days: 10,
    dailyLimit: 30,
    model: "gpt-4o-mini",
    vision: false,
    allowStyles: false,
    allowProjects: false,
    qualityTier: "standard",
    perks: [
      "30 comments / day",
      "10 days full access",
      "Standard model (text only)",
      "Try before you commit"
    ]
  },
  starter: {
    key: "starter",
    name: "Starter",
    priceUSD: 5,
    days: 30,
    dailyLimit: 60,
    model: "gpt-4o-mini",
    vision: false,
    allowStyles: true,
    allowProjects: false,
    qualityTier: "high",
    perks: [
      "60 comments / day",
      "Standard model (text only)",
      "All personalization styles",
      "Custom style note",
      "Email support"
    ]
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceUSD: 10,
    days: 30,
    dailyLimit: 150,
    model: "gpt-4o-mini",
    vision: true,
    allowStyles: true,
    allowProjects: true,
    qualityTier: "high",
    perks: [
      "150 comments / day",
      "Standard model + IMAGE understanding",
      "All personalization styles",
      "Project contexts",
      "Priority queue"
    ]
  },
  premium: {
    key: "premium",
    name: "Premium",
    priceUSD: 30,
    days: 30,
    dailyLimit: 500,
    model: "gpt-4o",
    vision: true,
    allowStyles: true,
    allowProjects: true,
    qualityTier: "masterpiece",
    perks: [
      "500 comments / day (3.3x Pro)",
      "GPT-4o premium model, masterpiece replies",
      "Full image + post understanding",
      "Unlimited project contexts",
      "All personalization styles",
      "Priority support"
    ],
    featured: true
  }
} as const;

export type PlanKey = keyof typeof PLANS;

// Reply style presets
export const REPLY_STYLES = {
  default: {
    name: "Default",
    description: "Balanced, friendly, human"
  },
  funny: {
    name: "Funny",
    description: "Witty, playful, light humor"
  },
  short: {
    name: "Short & punchy",
    description: "Brief, max 60 chars"
  },
  productive: {
    name: "Productive",
    description: "Adds value, asks insightful questions"
  },
  professional: {
    name: "Professional",
    description: "Polished, work-appropriate"
  },
  supportive: {
    name: "Supportive",
    description: "Empathetic, encouraging"
  },
  contrarian: {
    name: "Contrarian",
    description: "Politely challenges, brings new angle"
  }
} as const;

export type ReplyStyle = keyof typeof REPLY_STYLES;
