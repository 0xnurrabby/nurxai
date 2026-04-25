"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name })
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Could not sign up"); return; }
      try { localStorage.setItem("nurxai_jwt", d.token); localStorage.setItem("nurxai_user", JSON.stringify(d.user)); } catch {}
      router.push("/dashboard");
    } catch {
      setErr("Network error.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-5 py-12">
        <div className="nb-card p-7">
          <h1 className="font-display font-black text-3xl">Create account</h1>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="font-semibold text-sm">Name</label>
              <input className="nb-input mt-1" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-sm">Email</label>
              <input type="email" required className="nb-input mt-1" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="font-semibold text-sm">Password (min 8 chars)</label>
              <input type="password" required minLength={8} className="nb-input mt-1"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            {err && <p className="text-sm font-semibold" style={{ color: "#b00020" }}>{err}</p>}
            <button className="nb-btn nb-btn-primary w-full" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
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
