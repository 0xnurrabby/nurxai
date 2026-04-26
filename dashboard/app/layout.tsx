import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Title is tuned for Chrome Web Store + Google search keywords:
  // "twitter comment", "x comment", "ai reply", "auto reply", "comment generator".
  title: "NurAi - AI Comment & Reply Generator for X (Twitter)",
  description:
    "NurAi writes smart, human-sounding replies and comments on X / Twitter in one click. AI auto-reply generator with personalization, image understanding, and multiple writing styles. Built for creators, growth accounts, and crypto KOLs.",
  keywords: [
    "ai reply for x",
    "x comment generator",
    "twitter comment ai",
    "ai twitter reply",
    "auto reply twitter",
    "ai comment generator",
    "x.com reply ai",
    "twitter auto comment",
    "ai reply extension",
    "chrome extension twitter ai",
    "nurai",
    "nurxai"
  ],
  openGraph: {
    title: "NurAi - AI Comment & Reply Generator for X (Twitter)",
    description:
      "One-click human-sounding replies on X / Twitter. AI comment generator built for creators and crypto KOLs.",
    url: "https://www.nurxai.xyz",
    siteName: "NurAi",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "NurAi - AI Comment & Reply Generator for X",
    description:
      "AI auto-reply generator for X / Twitter. Human-sounding comments in one click."
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
                if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                if (t === 'dark') document.documentElement.classList.add('dark');
              } catch (e) {}
            `
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
