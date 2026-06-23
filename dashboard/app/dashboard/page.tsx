"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";

type Me = {
  user: { id: string; email: string; name: string | null; isAdmin?: boolean };
  subscription: {
    plan: string;
    endsAt: string;
    dailyLimit: number;
    startsAt?: string;
  } | null;
  usageToday: number;
  usageHistory?: Array<{ day: string; count: number }>;
  totalUsage?: number;
};

const PLAN_RANK: Record<string, number> = {
  trial: 1,
  starter: 2,
  pro: 3,
  premium: 4
};

export default function Dashboard() {
  const [data, setData] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("nurxai_jwt");
      if (!token) {
        router.push("/login");
        return;
      }
      try {
        const r = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.status === 401) {
          localStorage.removeItem("nurxai_jwt");
          router.push("/login");
          return;
        }
        const d = await r.json();
        setData(d);

        fetch("/api/me?details=usage", {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((usageRes) => (usageRes.ok ? usageRes.json() : null))
          .then((usageData) => {
            if (usageData?.usageHistory) {
              setData((current) => current ? { ...current, ...usageData } : usageData);
            }
          })
          .catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function logout() {
    localStorage.removeItem("nurxai_jwt");
    localStorage.removeItem("nurxai_user");
    router.push("/");
  }

  if (loading)
    return (
      <>
        <Navbar />
        <main className="p-10 text-center">Loading…</main>
      </>
    );
  if (!data) return null;

  const sub = data.subscription;
  const limit = sub?.dailyLimit || 0;
  const usedToday = data.usageToday;
  const remaining = Math.max(0, limit - usedToday);
  const pct = limit > 0 ? Math.min(100, Math.round((usedToday / limit) * 100)) : 0;

  let daysLeft = 0;
  if (sub) {
    const end = new Date(sub.endsAt).getTime();
    daysLeft = Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  // Smart CTA logic
  let ctaText = "Pick a plan";
  let ctaStyle = "nb-btn-primary";
  let showCta = true;
  if (sub) {
    const isPremium = sub.plan === "premium";
    const expiringSoon = daysLeft <= 7;
    if (isPremium && !expiringSoon) {
      showCta = false;
    } else if (isPremium && expiringSoon) {
      ctaText = `Renew Premium (${daysLeft}d left)`;
      ctaStyle = "nb-btn-warn";
    } else if (expiringSoon) {
      ctaText = `Renew or Upgrade (${daysLeft}d left)`;
      ctaStyle = "nb-btn-warn";
    } else {
      ctaText = "Upgrade plan";
      ctaStyle = "nb-btn-primary";
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-5 py-10">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h1 className="font-display font-black text-4xl">
              Hey, {data.user.name || data.user.email.split("@")[0]}
            </h1>
            <p className="opacity-70 mt-1">{data.user.email}</p>
          </div>
          <div className="flex gap-2">
            {data.user.isAdmin && (
              <Link href="/admin" className="nb-btn nb-btn-warn">
                🛠 Admin
              </Link>
            )}
            <button className="nb-btn" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-5 mt-8">
          <div className="nb-card p-6">
            <div className="text-sm font-bold opacity-70">Today's usage</div>
            <div className="mt-2 font-display font-black text-4xl">{usedToday}</div>
            <div className="mt-1 text-sm opacity-70">
              of {limit > 0 ? `${limit} daily limit` : "no plan"}
            </div>
            {limit > 0 && (
              <div className="mt-3 w-full h-3 border-2 border-ink dark:border-nightInk rounded-full overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct > 90
                        ? "#ffd1dc"
                        : pct > 70
                        ? "var(--accent3)"
                        : "var(--accent2)"
                  }}
                />
              </div>
            )}
          </div>

          <div className="nb-card p-6" style={{ background: "var(--accent3)" }}>
            <div className="text-sm font-bold opacity-70">Comments left today</div>
            <div className="mt-2 font-display font-black text-4xl">{remaining}</div>
            <div className="mt-1 text-sm opacity-70">resets at 00:00 UTC</div>
          </div>

          <div className="nb-card p-6" style={{ background: "var(--accent2)" }}>
            <div className="text-sm font-bold opacity-70">Plan expires in</div>
            <div className="mt-2 font-display font-black text-4xl">
              {sub ? `${daysLeft}d` : "—"}
            </div>
            <div className="mt-1 text-sm opacity-70">
              {sub ? new Date(sub.endsAt).toLocaleDateString() : "no active plan"}
            </div>
          </div>
        </div>

        {/* Subscription details */}
        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <div className="nb-card p-6">
            <h3 className="font-display font-black text-xl">Subscription</h3>
            {sub ? (
              <>
                <div className="mt-3 flex flex-wrap items-baseline gap-2">
                  <span className="nb-tag" style={{ background: "var(--accent2)" }}>
                    {sub.plan.toUpperCase()}
                  </span>
                  <span className="text-sm opacity-70">
                    Active until {new Date(sub.endsAt).toLocaleDateString()}
                  </span>
                </div>
                <ul className="mt-4 space-y-1 text-sm">
                  <li>✓ {limit} comments per day</li>
                  <li>✓ Resets daily at 00:00 UTC</li>
                  <li>✓ {daysLeft} days remaining</li>
                  {sub.plan === "premium" && <li>✓ Premium Gateway generation</li>}
                </ul>
                {showCta && (
                  <Link href="/pricing" className={`nb-btn ${ctaStyle} mt-5 inline-block`}>
                    {ctaText}
                  </Link>
                )}
                {!showCta && (
                  <div className="mt-5 text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    🎉 You're on the highest plan with plenty of time left.
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mt-3">You don't have an active plan yet.</p>
                <p className="text-sm opacity-70 mt-2">
                  Without a plan, NurAi extension won't generate suggestions.
                </p>
                <Link href="/pricing" className="nb-btn nb-btn-primary mt-4 inline-block">
                  {ctaText}
                </Link>
              </>
            )}
          </div>

          <div className="nb-card p-6">
            <h3 className="font-display font-black text-xl">Extension setup</h3>
            <ol className="mt-3 space-y-2 list-decimal pl-5 text-sm">
              <li>
                Install from{" "}
                <a
                  href="https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold"
                >
                  Chrome Web Store
                </a>
                .
              </li>
              <li>Click the NurAi icon in your toolbar.</li>
              <li>It auto-links to this account.</li>
              <li>Open a tweet reply on X — suggestions appear automatically.</li>
            </ol>
            <Link
              href="/auth/extension"
              className="nb-btn nb-btn-primary mt-5 inline-block"
            >
              Re-link extension
            </Link>
          </div>
        </div>

        {/* Usage history */}
        {data.usageHistory && data.usageHistory.length > 0 && (
          <div className="nb-card p-6 mt-5">
            <h3 className="font-display font-black text-xl">Last 14 days</h3>
            <div className="mt-4 grid grid-cols-7 md:grid-cols-14 gap-2">
              {data.usageHistory
                .slice(0, 14)
                .reverse()
                .map((d) => {
                  const intensity = limit > 0 ? Math.min(1, d.count / limit) : 0;
                  return (
                    <div
                      key={d.day}
                      className="aspect-square border-2 border-ink dark:border-nightInk rounded text-xs grid place-items-center"
                      title={`${d.day}: ${d.count} comments`}
                      style={{
                        background:
                          intensity > 0
                            ? `rgba(196,240,194,${0.3 + intensity * 0.7})`
                            : "transparent"
                      }}
                    >
                      {d.count}
                    </div>
                  );
                })}
            </div>
            <p className="mt-3 text-xs opacity-70">
              Total comments generated:{" "}
              <strong>
                {data.totalUsage ||
                  data.usageHistory.reduce((a, b) => a + b.count, 0)}
              </strong>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
