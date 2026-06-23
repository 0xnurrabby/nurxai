"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";
import GoogleSignInButton from "../components/GoogleSignInButton";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const finishAuth = useCallback((token: string, user: any) => {
    try {
      localStorage.setItem("nurxai_jwt", token);
      localStorage.setItem("nurxai_user", JSON.stringify(user));
    } catch {}
    router.push("/dashboard");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name })
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Could not sign up");
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
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-5 py-12">
        <div className="nb-card p-7">
          <h1 className="font-display font-black text-3xl">Create account</h1>
          <p className="mt-2 text-sm opacity-70">
            Start with Google for the fastest, cleaner login experience.
          </p>

          <div className="mt-6">
            <GoogleSignInButton
              label="signup_with"
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
              <label className="font-semibold text-sm">Name</label>
              <input className="nb-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-sm">Email</label>
              <input type="email" required className="nb-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-sm">Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                className="nb-input mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {err && <p className="text-sm font-semibold" style={{ color: "#b00020" }}>{err}</p>}
            <button className="nb-btn nb-btn-primary w-full" disabled={busy}>
              {busy ? "Creating..." : "Create with email"}
            </button>
          </form>

          <p className="mt-4 text-sm">
            Already have one? <Link href="/login" className="font-bold underline">Sign in</Link>
          </p>
        </div>
      </main>
    </>
  );
}
