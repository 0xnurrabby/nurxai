import type { Metadata } from "next";
import Navbar from "../components/Navbar";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a secure reset code and get back into your NurAi workspace.",
  alternates: { canonical: "/forgot-password" },
  robots: { index: false, follow: true }
};

export default function ForgotPassword() {
  return (
    <>
      <Navbar />
      <ForgotPasswordForm />
    </>
  );
}
