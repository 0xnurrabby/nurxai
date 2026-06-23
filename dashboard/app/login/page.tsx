"use client";
import { useState, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";
import GoogleSignInButton from "../components/GoogleSignInButton";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const finishAuth = useCallback((token: string, user: any) => {
    try {
      localStorage.setItem("nurxai_jwt", token);
      localStorage.setItem("nurxai_user", JSON.stringify(user));
    } catch {}
    router.push(next);
  }, [next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error === "USE_GOOGLE_LOGIN" ? "This account uses Google sign-in." : d.error || "Invalid credentials");
        return;
      }
      finishAuth(d.token, d.user);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nb-card p-7">
      <h1 className="font-display font-black text-3xl">Welcome back</h1>
      <p className="mt-2 text-sm opacity-70">
        Sign in to manage your NurAi account, billing and extension.
      </p>

      <div className="mt-6">
        <GoogleSignInButton
          label="signin_with"
          onSuccess={finishAuth}
          onError={setErr}
        />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs font-bold opacity-60">
        <div className="h-px flex-1 bg-ink/30 dark:bg-nightInk/30" />
        <span>OR EMAIL</span>
        <div className="h-px flex-1 bg-ink/30 dark:bg-nightInk/30" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="font-semibold text-sm">Email</label>
          <input
            type="email"
            required
            className="nb-input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="font-semibold text-sm">Password</label>
          <input
            type="password"
            required
            className="nb-input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && <p className="text-sm font-semibold" style={{ color: "#b00020" }}>{err}</p>}
        <button className="nb-btn nb-btn-primary w-full" disabled={busy}>
          {busy ? "Signing in..." : "Sign in with email"}
        </button>
      </form>

      <div className="mt-4 flex justify-between items-center text-sm">
        <Link href="/forgot-password" className="opacity-70 hover:opacity-100 underline">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-bold underline">
          Create account
        </Link>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-5 py-12">
        <Suspense fallback={<div className="nb-card p-7">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
