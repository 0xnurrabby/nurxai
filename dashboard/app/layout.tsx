import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { organizationSchema, websiteSchema } from "@/lib/seo";
import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const serifFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap"
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nurxai.xyz"),
  title: {
    default: "NurAi · AI reply drafts for X that sound like you",
    template: "%s | NurAi"
  },
  description:
    "NurAi reads the X post you are replying to and drafts four thoughtful replies in your voice. You review, edit, and publish. Free 3-day trial with optional USDC pay-per-use on Base.",
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
    url: "https://nurxai.xyz",
    siteName: "NurAi",
    type: "website",
    locale: "en_US"
  },
  twitter: {
    card: "summary_large_image",
    title: "NurAi: AI reply drafts for X that sound like you",
    description:
      "Four context-aware reply drafts for any X post, in your voice. You review, edit, and publish. Free 3-day trial, then pay per use."
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodyFont.variable} ${displayFont.variable} ${serifFont.variable} ${monoFont.variable}`}
    >
      <head>
        <meta name="base:app_id" content="6a842b93abf0a9eb2b3c722a" />
        <noscript>
          <style>{".reveal{opacity:1 !important;transform:none !important}"}</style>
        </noscript>
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
      <body className="min-h-screen font-sans antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema()) }} />
        {children}
      </body>
    </html>
  );
}
