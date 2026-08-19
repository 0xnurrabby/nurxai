"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthShell from "../components/AuthShell";

function resetError(data: any) {
  if (data?.error === "BAD_EMAIL") return "Enter a valid email address.";
  if (data?.error === "WEAK_PASSWORD") return "Use 8 or more characters and keep the password under 72 UTF-8 bytes.";
  if (data?.error === "INVALID_OTP") return "That code is invalid, expired, or has already been used.";
  if (data?.error === "RATE_LIMITED") return data.message || "Too many attempts. Try again later.";
  return data?.message || "Could not complete the reset. Please try again.";
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}${"*".repeat(Math.min(4, Math.max(1, name.length - 1)))}@${domain}`;
}

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [phase, setPhase] = useState<"email" | "reset" | "success">("email");
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  async function requestCode() {
    setBusy(true);
    setErr("");
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "password_reset" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setErr(resetError(data));
      setPhase("reset");
      setCountdown(Number(data.resendAfter) || 60);
    } catch {
      setErr("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setErr(resetError(data));
      setPhase("success");
      setOtp("");
      setNewPassword("");
    } catch {
      setErr("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell mode="reset">
      <div className="nb-card border-0 p-1 sm:p-3">
        <span className="nb-tag">SESSION LOCKDOWN</span>
        <h1 className="mt-5 font-display text-4xl font-black tracking-tight">Reset access.</h1>
        <p className="mt-2 text-sm leading-relaxed opacity-70">Verify your inbox. A successful reset signs out every old browser and extension session.</p>

        {phase === "email" && <form onSubmit={submitEmail} className="mt-7 space-y-4">
          <div><label className="text-sm font-bold">Account email</label><input type="email" required autoComplete="email" className="nb-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {err && <p role="alert" className="rounded-lg border-2 border-[#b00020] bg-red-50 p-3 text-sm font-semibold text-[#b00020] dark:bg-transparent">{err}</p>}
          <button className="nb-btn nb-btn-primary min-h-[48px] w-full" disabled={busy}>{busy ? "Sending secure code..." : "Send reset code"}</button>
        </form>}

        {phase === "reset" && <form onSubmit={resetPassword} className="mt-7 space-y-4">
          <div className="rounded-xl border-2 border-ink bg-[var(--accent3)] p-4 text-sm text-ink"><strong>Check your inbox</strong><p className="mt-1 opacity-75">If eligible, a code was sent to {maskEmail(email)}.</p></div>
          <div><label className="text-sm font-bold">6-digit code</label><input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className="nb-input mt-1 text-center font-mono text-2xl font-black tracking-[.35em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <div><label className="text-sm font-bold">New password</label><input type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="nb-input mt-1" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          {err && <p role="alert" className="rounded-lg border-2 border-[#b00020] bg-red-50 p-3 text-sm font-semibold text-[#b00020] dark:bg-transparent">{err}</p>}
          <button className="nb-btn nb-btn-success min-h-[48px] w-full" disabled={busy || otp.length !== 6}>{busy ? "Resetting and locking sessions..." : "Set new password"}</button>
          <div className="flex items-center justify-between text-sm"><button type="button" className="font-bold underline" onClick={() => { setPhase("email"); setErr(""); }}>Change email</button><button type="button" className="font-bold underline disabled:opacity-40" disabled={busy || countdown > 0} onClick={requestCode}>{countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}</button></div>
        </form>}

        {phase === "success" && <div className="mt-7">
          <div className="rounded-xl border-2 border-ink bg-[var(--accent2)] p-5 text-ink"><strong className="text-lg">Password reset complete.</strong><p className="mt-2 text-sm">Every previously issued NurAi session is now invalid. Sign in again with your new password.</p></div>
          <Link href="/login" className="nb-btn nb-btn-primary mt-5 min-h-[48px] w-full">Return to sign in</Link>
        </div>}

        {phase !== "success" && <p className="mt-6 border-t-2 border-ink/10 pt-5 text-sm dark:border-nightInk/10">Remembered it? <Link href="/login" className="font-black underline">Back to sign in</Link></p>}
      </div>
    </AuthShell>
  );
}
