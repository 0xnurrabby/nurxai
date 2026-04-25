"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

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
        setErr(d.error || "Invalid credentials");
        return;
      }
      try {
        localStorage.setItem("nurxai_jwt", d.token);
        localStorage.setItem("nurxai_user", JSON.stringify(d.user));
      } catch {}
      router.push(next);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nb-card p-7">
      <h1 className="font-display font-black text-3xl">Sign in</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
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
        {err && (
          <p className="text-sm font-semibold" style={{ color: "#b00020" }}>
            {err}
          </p>
        )}
        <button className="nb-btn nb-btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        New here?{" "}
        <Link href="/signup" className="font-bold underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function Login() {
  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-5 py-12">
        <Suspense fallback={<div className="nb-card p-7">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
