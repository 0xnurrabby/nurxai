"use client";
import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";
import AuthShell from "../components/AuthShell";
import GoogleAuthButton from "../components/GoogleAuthButton";
import PasswordInput from "../components/PasswordInput";

function loginError(data: any) {
  if (data?.error === "USE_GOOGLE_LOGIN") return "This account uses Google sign-in.";
  if (data?.error === "INVALID") return "Invalid email or password.";
  if (data?.error === "RATE_LIMITED") return data.message || "Too many attempts. Wait a moment and try again.";
  return data?.message || "Could not sign in. Please try again.";
}

function redirectErrorText(code: string | null) {
  if (!code || code === "GOOGLE_CANCELLED") return "";
  if (code === "TERMS_REQUIRED") return "Please accept the Terms of Service and Privacy Policy first.";
  if (code === "GOOGLE_ACCOUNT_MISMATCH") return "This email is already linked to a different Google account.";
  if (code === "GOOGLE_EMAIL_NOT_VERIFIED") return "Google could not verify that email address.";
  if (code === "GOOGLE_NOT_CONFIGURED") return "Google sign-in is not configured. Please use email instead.";
  return "Google sign-in did not complete. Please try again or use email.";
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return "/dashboard";
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\")) return "/dashboard";
  } catch {
    return "/dashboard";
  }
  return value;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const redirectError = redirectErrorText(params.get("error"));

  const finishAuth = useCallback((token: string, user: any) => {
    try {
      localStorage.setItem("nurxai_jwt", token);
      localStorage.setItem("nurxai_user", JSON.stringify(user));
    } catch {}
    router.replace(next);
  }, [next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setErr(loginError(data));
      finishAuth(data.token, data.user);
    } catch {
      setErr("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell mode="login">
      <div className="w-full">
        <span className="nb-tag">SECURE ACCESS</span>
        <h1 className="mt-3 font-display text-3xl font-black tracking-tight">Welcome back.</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed opacity-70">Open your reply workspace, billing, and extension controls.</p>

        <div className="mt-3">
          <GoogleAuthButton label="Continue with Google" />
        </div>
        <p className="mt-2 text-center text-[11px] leading-relaxed opacity-55">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline" target="_blank">Terms of Service</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline" target="_blank">Privacy Policy</Link>.
        </p>
        <div className="my-3 flex items-center gap-3 text-[11px] font-black tracking-[.14em] opacity-50">
          <div className="h-px flex-1 bg-ink/40 dark:bg-nightInk/40" /><span>OR EMAIL</span><div className="h-px flex-1 bg-ink/40 dark:bg-nightInk/40" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div><label className="text-[12px] font-semibold">Email</label><input type="email" required autoComplete="email" className="nb-input mt-1 w-full min-w-0" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><div className="flex items-center justify-between"><label className="text-[12px] font-semibold">Password</label><Link href="/forgot-password" className="text-xs font-bold underline">Reset it</Link></div><PasswordInput value={password} onChange={setPassword} required autoComplete="current-password" /></div>
          {(err || redirectError) && <p role="alert" className="rounded-lg border border-[#b00020]/40 bg-red-50 p-3 text-sm font-semibold text-[#b00020] dark:bg-transparent">{err || redirectError}</p>}
          <button className="nb-btn nb-btn-primary min-h-[48px] w-full" disabled={busy}>{busy ? "Signing in..." : "Enter workspace"}</button>
        </form>

        <p className="mt-3 border-t border-ink/10 pt-2.5 text-[13px] dark:border-nightInk/10">New here? <Link href="/signup" className="font-black underline">Create your account</Link></p>
      </div>
    </AuthShell>
  );
}

export default function Login() {
  return <><Navbar /><Suspense fallback={<main className="grid min-h-[70vh] place-items-center font-black">Loading secure access...</main>}><LoginForm /></Suspense></>;
}
