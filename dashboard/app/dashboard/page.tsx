"use client";

// ... existing code

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";

type Me = {
  user: { id: string; email: string; name: string | null };
  subscription: { plan: string; endsAt: string; dailyLimit: number } | null;
  usageToday: number;
};

export default function Dashboard() {
  const [data, setData] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("nurxai_jwt");
      if (!token) { router.push("/login"); return; }
      try {
        const r = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 401) { localStorage.removeItem("nurxai_jwt"); router.push("/login"); return; }
        const d = await r.json();
        setData(d);
      } finally { setLoading(false); }
    })();
  }, [router]);

  function logout() {
    localStorage.removeItem("nurxai_jwt");
    localStorage.removeItem("nurxai_user");
    router.push("/");
  }

  if (loading) return (<><Navbar /><main className="p-10 text-center">Loading…</main></>);
  if (!data) return null;

  const sub = data.subscription;
  const pct = sub ? Math.min(100, Math.round((data.usageToday / sub.dailyLimit) * 100)) : 0;

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-5 py-10">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h1 className="font-display font-black text-4xl">Hey, {data.user.name || data.user.email.split("@")[0]} 👋</h1>
            <p className="opacity-70 mt-1">{data.user.email}</p>
          </div>
          <button className="nb-btn" onClick={logout}>Sign out</button>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mt-8">
          <div className="nb-card p-6">
            <h3 className="font-display font-black text-xl">Subscription</h3>
            {sub ? (
              <>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="nb-tag" style={{ background: "var(--accent2)" }}>
                    {sub.plan.toUpperCase()}
                  </span>
                  <span className="text-sm opacity-70">expires {new Date(sub.endsAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-4">
                  <div className="text-sm font-semibold">Today: {data.usageToday} / {sub.dailyLimit} comments</div>
                  <div className="mt-2 w-full h-3 border-2 border-ink dark:border-nightInk rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${pct}%`, background: "var(--accent2)" }} />
                  </div>
                </div>
                <Link href="/pricing" className="nb-btn nb-btn-warn mt-5 inline-block">Upgrade</Link>
              </>
            ) : (
              <>
                <p className="mt-3">You don't have an active plan yet.</p>
                <Link href="/pricing" className="nb-btn nb-btn-primary mt-4 inline-block">Pick a plan</Link>
              </>
            )}
          </div>

          <div className="nb-card p-6">
            <h3 className="font-display font-black text-xl">Extension setup</h3>
            <ol className="mt-3 space-y-2 list-decimal pl-5">
              <li>Install the NurAi Chrome extension.</li>
              <li>Click the icon — it'll auto-link to this account.</li>
              <li>Open a reply on X — suggestions appear automatically.</li>
            </ol>
            <Link href="/auth/extension" className="nb-btn nb-btn-primary mt-5 inline-block">Re-link extension</Link>
          </div>
        </div>
      </main>
    </>
  );
}
