import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to NurAi with your email or Google account to continue drafting context-aware replies for X.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
  openGraph: {
    url: "/login",
    title: "Sign in to NurAi",
    description: "Sign in to continue drafting context-aware replies for X."
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign in to NurAi",
    description: "Sign in to continue drafting context-aware replies for X."
  }
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
