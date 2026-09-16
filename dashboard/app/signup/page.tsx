"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";
import AuthShell from "../components/AuthShell";
import GoogleAuthButton from "../components/GoogleAuthButton";
import PasswordInput from "../components/PasswordInput";

const REF_STORAGE_KEY = "nurxai_referral_code";

function authError(data: any) {
  if (data?.error === "EMAIL_TAKEN") return data?.message || "An account with this email already exists. Sign in instead.";
  if (data?.error === "BAD_EMAIL") return "Enter a valid email address.";
  if (data?.error === "WEAK_PASSWORD") return "Use 8 or more characters and keep the password under 72 UTF-8 bytes.";
  if (data?.error === "INVALID_OTP") return "That code is invalid, expired, or has already been used.";
  if (data?.error === "RATE_LIMITED") return data.message || "Too many attempts. Try again later.";
  if (data?.error === "TERMS_REQUIRED") return data.message || "Please accept the Terms of Service and Privacy Policy.";
  if (data?.error === "EMAIL_UNAVAILABLE") return "Email codes are temporarily unavailable. Please use Continue with Google above, or contact support@nurxai.xyz.";
  return data?.message || "Could not complete signup. Please try again.";
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}${"*".repeat(Math.min(4, Math.max(1, name.length - 1)))}@${domain}`;
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [otp, setOtp] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [phase, setPhase] = useState<"details" | "code">("details");
  const [countdown, setCountdown] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const fromUrl = (params.get("ref") || params.get("r") || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    const saved = localStorage.getItem(REF_STORAGE_KEY) || "";
    const code = fromUrl || saved;
    if (code) {
      setReferralCode(code);
      try { localStorage.setItem(REF_STORAGE_KEY, code); } catch {}
    }
  }, [params]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const finishAuth = useCallback((token: string, user: any) => {
    try {
      localStorage.setItem("nurxai_jwt", token);
      localStorage.setItem("nurxai_user", JSON.stringify(user));
      localStorage.removeItem(REF_STORAGE_KEY);
    } catch {}
    router.replace("/dashboard");
  }, [router]);

  async function requestCode() {
    setErr("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "signup" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setErr(authError(data));
      setPhase("code");
      setCountdown(Number(data.resendAfter) || 60);
    } catch {
      setErr("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function completeSignup(event: React.FormEvent) {
    event.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, referralCode, otp, acceptedTerms: accepted })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setErr(authError(data));
      finishAuth(data.token, data.user);
    } catch {
      setErr("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell mode="signup">
      <div className="w-full">
        <div className="flex items-center justify-between gap-4"><span className="nb-tag">3-DAY TRIAL</span><span className="text-xs font-black opacity-50">STEP {phase === "details" ? "1" : "2"} / 2</span></div>
        <h1 className="mt-3 font-display text-3xl font-black tracking-tight">Build your edge.</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed opacity-70">Verify your email, then your reply workspace is ready.</p>

        {phase === "details" ? <>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--ring,transparent)] p-2 text-[12.5px]" style={{ background: "color-mix(in srgb, var(--ink) 4%, transparent)" }}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[#0052ff]"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span className="leading-relaxed opacity-80">
              I agree to the{" "}
              <Link href="/terms" className="font-semibold underline" target="_blank">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" className="font-semibold underline" target="_blank">Privacy Policy</Link>.
            </span>
          </label>
          <GoogleAuthButton
            label="Continue with Google"
            referralCode={referralCode}
            accepted={accepted}
            onBlocked={() => setErr("Please accept the Terms of Service and Privacy Policy first.")}
          />
          <div className="my-3 flex items-center gap-3 text-[11px] font-black tracking-[.14em] opacity-50"><div className="h-px flex-1 bg-ink/40 dark:bg-nightInk/40" /><span>OR VERIFIED EMAIL</span><div className="h-px flex-1 bg-ink/40 dark:bg-nightInk/40" /></div>
          <form onSubmit={submitDetails} className="space-y-2.5">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0"><label className="text-[12px] font-semibold">Name</label><input className="nb-input mt-1 w-full min-w-0" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="min-w-0"><label className="text-[12px] font-semibold">Email</label><input type="email" required autoComplete="email" className="nb-input mt-1 w-full min-w-0" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0"><label className="text-[12px] font-semibold">Password</label><PasswordInput value={password} onChange={setPassword} required minLength={8} maxLength={128} autoComplete="new-password" /><p className="mt-1 text-[11px] opacity-55">Minimum 8 characters.</p></div>
              <div className="min-w-0"><label className="text-[12px] font-semibold">Referral code <span className="opacity-50">(optional)</span></label><input className="nb-input mt-1 w-full min-w-0 uppercase" value={referralCode} onChange={(e) => setReferralCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} placeholder="FRIENDCODE" /></div>
            </div>
            {err && <p role="alert" className="rounded-lg border-2 border-[#b00020] bg-red-50 p-3 text-sm font-semibold text-[#b00020] dark:bg-transparent">{err}</p>}
            <button className="nb-btn nb-btn-primary min-h-[48px] w-full" disabled={busy || !accepted}>{busy ? "Sending secure code..." : accepted ? "Verify email" : "Accept terms to continue"}</button>
          </form>
        </> : <form onSubmit={completeSignup} className="mt-5 space-y-4">
          <div className="rounded-xl border-2 border-ink bg-[var(--accent3)] p-4 text-sm text-ink"><strong>Code sent if eligible</strong><p className="mt-1 opacity-75">Check {maskEmail(email)}. The code expires in 10 minutes.</p></div>
          <div><label className="text-sm font-bold">6-digit code</label><input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className="nb-input mt-1 text-center font-mono text-2xl font-black tracking-[.35em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          {err && <p role="alert" className="rounded-lg border-2 border-[#b00020] bg-red-50 p-3 text-sm font-semibold text-[#b00020] dark:bg-transparent">{err}</p>}
          <button className="nb-btn nb-btn-success min-h-[48px] w-full" disabled={busy || otp.length !== 6}>{busy ? "Verifying..." : "Verify and create account"}</button>
          <div className="flex items-center justify-between gap-3 text-sm"><button type="button" className="font-bold underline" onClick={() => { setPhase("details"); setOtp(""); setErr(""); }}>Edit details</button><button type="button" className="font-bold underline disabled:opacity-40" disabled={busy || countdown > 0} onClick={requestCode}>{countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}</button></div>
        </form>}

        <p className="mt-3 border-t border-ink/10 pt-2.5 text-[13px] dark:border-nightInk/10">Already operating? <Link href="/login" className="font-black underline">Sign in</Link></p>
      </div>
    </AuthShell>
  );
}

export default function Signup() {
  return <><Navbar /><Suspense fallback={<main className="grid min-h-[70vh] place-items-center font-black">Preparing secure signup...</main>}><SignupForm /></Suspense></>;
}
