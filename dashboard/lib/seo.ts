export const SITE_URL = "https://nurxai.xyz";
export const SITE_NAME = "NurAi";
export const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb";
export const SUPPORT_EMAIL = "support@nurxai.xyz";

export function absoluteUrl(path: string) {
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type Json = Record<string, unknown>;

export function organizationSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: ["NurXAI", "NurXai"],
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/icon.png`,
      width: 512,
      height: 512
    },
    sameAs: [CHROME_STORE_URL, "https://t.me/Nur_Xai"],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SUPPORT_EMAIL,
        availableLanguage: ["en"]
      }
    ]
  };
}

export function websiteSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: "NurXai",
    url: SITE_URL,
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}/#organization` }
  };
}

export function softwareApplicationSchema(features: string[], premiumPriceUsd: number): Json {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    alternateName: "NurXai",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Social media writing assistant",
    operatingSystem: "Chrome, Edge, Brave, Opera",
    url: SITE_URL,
    description:
      "NurAi is a human-in-the-loop writing copilot for X and Twitter. It reads the post you are replying to and drafts four thoughtful replies in your voice. You review, edit, and publish yourself.",
    featureList: features,
    offers: [
      {
        "@type": "Offer",
        name: "Free trial",
        price: "0",
        priceCurrency: "USD",
        description: "3-day trial with a daily generation limit, no card required."
      },
      {
        "@type": "Offer",
        name: "Pay as you go",
        price: String(premiumPriceUsd),
        priceCurrency: "USD",
        description:
          "Per-generation pricing settled in USDC on Base. No daily limit and no subscription required."
      }
    ],
    sameAs: [CHROME_STORE_URL]
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };
}

export function faqSchema(items: Array<{ q: string; a: string }>): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
}

export function articleSchema(input: {
  slug: string;
  title: string;
  description: string;
  published: string;
  updated: string;
  section?: string;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    datePublished: input.published,
    dateModified: input.updated,
    inLanguage: "en",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(`/guides/${input.slug}`)
    },
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    articleSection: input.section || "Guides",
    image: absoluteUrl("/opengraph-image")
  };
}

export function howToSchema(input: {
  name: string;
  description: string;
  steps: Array<{ name: string; text: string }>;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.name,
    description: input.description,
    totalTime: "PT1M",
    step: input.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text
    }))
  };
}
