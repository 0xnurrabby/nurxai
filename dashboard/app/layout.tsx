import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NurAi — AI Reply for X",
  description: "Smart, human-like reply suggestions for X/Twitter."
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
