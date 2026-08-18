import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nurxai.xyz"),
  title: {
    default: "NurAi - Human-in-the-Loop X Copilot on Base",
    template: "%s | NurAi"
  },
  description:
    "NurAi is a human-in-the-loop communication copilot for X with context-aware drafting and x402 USDC pay-per-use access on Base.",
  applicationName: "NurAi",
  authors: [{ name: "NurAi" }],
  creator: "NurAi",
  publisher: "NurAi",
  category: "Communication software",
  keywords: [
    "NurAi",
    "NurXAI",
    "human-in-the-loop AI",
    "X communication copilot",
    "context-aware drafting",
    "professional communication assistant",
    "Base x402 application",
    "x402 payments",
    "USDC micropayments",
    "Base Account",
    "onchain AI payments",
    "pay per use AI",
    "self-custodial app account",
    "Chrome copilot for X"
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png"
  },
  openGraph: {
    title: "NurAi - Human-in-the-Loop X Copilot on Base",
    description:
      "Context-aware communication assistance with human approval and x402 USDC access on Base.",
    url: "https://nurxai.xyz",
    siteName: "NurAi",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/product/reply-panel-context.webp",
        width: 1280,
        height: 709,
        alt: "NurAi human-in-the-loop communication copilot working beside X"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "NurAi - Human-in-the-Loop X Copilot on Base",
    description:
      "Human-approved drafting with Base-native x402 USDC access.",
    images: ["/product/reply-panel-context.webp"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="base:app_id" content="6a842b93abf0a9eb2b3c722a" />
        <script
          // Set theme before paint (no flash). Inline is allowed by default Next CSP for /_next/.
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('nurxai_theme');
                if (t === 'dark') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
              } catch (e) {}
            `
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
