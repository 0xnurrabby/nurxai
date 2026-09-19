import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a NurAi account and start drafting four context-aware replies for any X post. Free 3-day trial, no card required.",
  alternates: { canonical: "/signup" },
  openGraph: {
    url: "/signup",
    title: "Create your NurAi account",
    description: "Start drafting context-aware X replies in your voice. Free 3-day trial, no card required."
  },
  twitter: {
    card: "summary_large_image",
    title: "Create your NurAi account",
    description: "Start drafting context-aware X replies in your voice. Free 3-day trial, no card required."
  }
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
