import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nurxai.xyz"),
  title: {
    default: "NurAi - AI Reply Generator for X and Twitter",
    template: "%s | NurAi"
  },
  description:
    "NurAi is a Chrome extension that writes human-sounding AI replies and comments for X / Twitter in one click. Built for creators, crypto builders, founders, marketers, and growth teams.",
  applicationName: "NurAi",
  authors: [{ name: "NurAi" }],
  creator: "NurAi",
  publisher: "NurAi",
  category: "AI browser extension",
  keywords: [
    "NurAi",
    "NurXAI",
    "AI reply generator",
    "X reply generator",
    "Twitter reply generator",
    "AI Twitter reply generator",
    "AI reply generator for X",
    "Twitter comment generator",
    "X comment generator",
    "AI comment generator",
    "AI comments for Twitter",
    "AI comments for X",
    "human AI replies",
    "X engagement tool",
    "Twitter engagement tool",
    "Chrome extension for X replies",
    "Chrome extension Twitter AI",
    "AI tweet reply",
    "AI social media reply",
    "crypto Twitter reply tool",
    "Web3 Twitter growth tool",
    "ai reply for x",
    "x.com reply ai",
    "twitter reply ai"
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
    title: "NurAi - AI Reply Generator for X and Twitter",
    description:
      "Write human-sounding X and Twitter replies in one click. NurAi reads the post, understands context, and helps creators reply faster.",
    url: "https://nurxai.xyz",
    siteName: "NurAi",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/product/reply-panel-context.webp",
        width: 1280,
        height: 709,
        alt: "NurAi AI reply generator working inside X"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "NurAi - AI Reply Generator for X",
    description:
      "Human-sounding AI comments for X / Twitter in one click.",
    images: ["/product/reply-panel-context.webp"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
