"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";
import DashboardLiveWidgets from "../components/DashboardLiveWidgets";
import PaygWalletCard from "../components/PaygWalletCard";
import UsageChart from "../components/UsageChart";
import ExtensionGate from "../components/ExtensionGate";
import { clearBrowserSession, restoreBrowserSession } from "@/lib/client-session";

type Me = {
  user: { id: string; email: string; name: string | null; avatarUrl?: string | null; isAdmin?: boolean };
  subscription: {
    plan: string;
    endsAt: string;
    dailyLimit: number;
    startsAt?: string;
  } | null;
  scheduledSubscription?: {
    plan: string;
    startsAt: string;
    endsAt: string;
    dailyLimit: number;
  } | null;
  usageToday: number;
  usageHistory?: Array<{ day: string; count: number }>;
  totalUsage?: number;
  referral?: {
    code?: string | null;
    link?: string | null;
    referredBy?: { email: string; name?: string | null; referralCode?: string | null } | null;
    totalReferrals: number;
    bonusRate: number;
  };
  wallet?: {
    balanceUSD: number;
    earnedUSD: number;
    spentUSD: number;
    withdrawnUSD: number;
    pendingWithdrawUSD: number;
  };
  withdrawalNotices?: Array<{
    id: string;
    amountUSD: number;
    status: string;
    adminNote?: string | null;
    txHash?: string | null;
    paidAt?: string | null;
    rejectedAt?: string | null;
    createdAt: string;
  }>;
  subscriptionGifts?: Array<{
    id: string;
    days: number;
    note?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

const PLAN_RANK: Record<string, number> = {
  trial: 1,
  starter: 2,
  pro: 3,
  premium: 4
};
const DASHBOARD_CACHE_KEY = "nurxai_dashboard_cache_v1";

export default function Dashboard() {
  const [data, setData] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      let token = localStorage.getItem("nurxai_jwt");
      if (!token) {
        token = (await restoreBrowserSession())?.token || null;
        if (!token) {
          router.push("/login");
          return;
        }
      }
      try {
        const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || "null");
        if (cached?.user?.email) {
          setData(cached);
          setLoading(false);
        }
      } catch {}
      try {
        let r = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.status === 401) {
          localStorage.removeItem("nurxai_jwt");
          const restored = await restoreBrowserSession();
          if (!restored) {
            router.push("/login");
            return;
          }
          token = restored.token;
          r = await fetch("/api/me", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store"
          });
          if (!r.ok) {
            router.push("/login");
            return;
          }
        }
        const d = await r.json();
        setData(d);
        try { localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(d)); } catch {}

        fetch("/api/me?details=usage", {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((usageRes) => (usageRes.ok ? usageRes.json() : null))
          .then((usageData) => {
            if (usageData?.usageHistory) {
              setData((current) => {
                const next = current ? { ...current, ...usageData } : usageData;
                try { localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next)); } catch {}
                return next;
              });
            }
          })
          .catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    if (params.get("paid") !== "1" || !orderId) return;

    let cancelled = false;

    (async () => {
      const token = localStorage.getItem("nurxai_jwt") || (await restoreBrowserSession())?.token;
      if (!token || cancelled) return;
      setToast("Payment received. Waiting for blockchain confirmation...");
      for (let attempt = 0; attempt < 60 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`/api/billing/status?order=${encodeURIComponent(orderId)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store"
          });
          const status = await response.json().catch(() => ({}));
          if (response.ok && status.status === "confirmed") {
            const meResponse = await fetch("/api/me", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store"
            });
            if (meResponse.ok) {
              const next = await meResponse.json();
              setData(next);
              try { localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next)); } catch {}
            }
            setToast(status.message || "Payment confirmed. Your subscription is ready.");
            window.history.replaceState({}, "", "/dashboard");
            return;
          }
          if (response.ok && status.status === "failed") {
            setToast(status.message || "Payment was not completed. Contact support if funds were deducted.");
            window.history.replaceState({}, "", "/dashboard");
            return;
          }
          if (response.ok && status.providerStatus === "processing") {
            setToast("Payment received. Final confirmation is in progress...");
          }
        } catch {}
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
      }
      if (!cancelled) {
        setToast("Payment is still processing. Your plan will activate automatically after confirmation.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data?.withdrawalNotices?.length) return;
    data.withdrawalNotices.forEach((notice) => markWithdrawalSeen(notice.id));
  }, [data?.withdrawalNotices?.map((notice) => notice.id).join(",")]);

  async function logout() {
    await clearBrowserSession();
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
    router.push("/");
  }

  async function copyReferralLink() {
    const link = data?.referral?.link;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setToast("Referral link copied.");
    } catch {
      setToast("Copy failed. Select the link manually.");
    }
    window.setTimeout(() => setToast(""), 2200);
  }

  async function markWithdrawalSeen(id: string) {
    const token = localStorage.getItem("nurxai_jwt");
    if (!token) return;
    fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "markNoticeSeen", id })
    }).catch(() => {});
  }

  if (loading)
    return (
      <>
        <Navbar />
        <main className="max-w-5xl mx-auto px-5 py-10">
          <DashboardLoadingState />
        </main>
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
        {toast && <div className="premium-toast">{toast}</div>}
        <ExtensionGate />
        <PaygWalletCard />
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h1 className="font-display font-black text-4xl">
              Hey, <span className="h-accent">{data.user.name || data.user.email.split("@")[0]}</span>
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
            <div className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">Today's usage</div>
            <div className="mt-2 font-display font-black text-4xl">{usedToday}</div>
            <div className="mt-1 text-sm opacity-70">
              of {limit > 0 ? `${limit} daily limit` : "no plan"}
            </div>
            {limit > 0 && (
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct > 90
                        ? "linear-gradient(90deg, #fda4af, #f43f5e)"
                        : pct > 70
                        ? "linear-gradient(90deg, #fde68a, #f59e0b)"
                        : "linear-gradient(90deg, #86efac, #22c55e)"
                  }}
                />
              </div>
            )}
          </div>

          <div className="nb-card p-6" style={{ background: "color-mix(in srgb, var(--accent3) 32%, var(--card))" }}>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">Comments left today</div>
            <div className="mt-2 font-display font-black text-4xl">{remaining}</div>
            <div className="mt-1 text-sm opacity-70">resets at 00:00 UTC</div>
          </div>

          <div className="nb-card p-6" style={{ background: "color-mix(in srgb, var(--accent2) 32%, var(--card))" }}>
            <div className="text-sm font-bold opacity-70">Plan expires in</div>
            <div className="mt-2 font-display font-black text-4xl">
              {sub ? `${daysLeft}d` : "-"}
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
                  <span className="nb-tag" style={{ background: "color-mix(in srgb, var(--accent2) 45%, var(--card))" }}>
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
                  {sub.plan === "premium" && <li>✓ Premium-quality generation</li>}
                </ul>
                {data.subscriptionGifts?.length ? (
                  <div className="dash-note">
                    <span className="dash-note-icon" aria-hidden="true">🎁</span>
                    <div>
                      <strong>
                        Plan bonus · +{data.subscriptionGifts.reduce((running, gift) => running + gift.days, 0)} days
                      </strong>
                      {data.subscriptionGifts[0].note?.trim() ? <span>{data.subscriptionGifts[0].note.trim()}</span> : null}
                    </div>
                  </div>
                ) : null}
                {data.scheduledSubscription && (
                  <div className="mt-4 rounded-xl border-2 border-ink dark:border-nightInk p-3 text-sm">
                    <strong>{data.scheduledSubscription.plan.toUpperCase()}</strong> is purchased and scheduled for{" "}
                    {new Date(data.scheduledSubscription.startsAt).toLocaleDateString()}.
                  </div>
                )}
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
              <li>Open a tweet reply on X and suggestions appear automatically.</li>
            </ol>
            <Link
              href="/auth/extension"
              className="nb-btn nb-btn-primary mt-5 inline-block"
            >
              Re-link extension
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <div className="nb-card p-6" style={{ background: "color-mix(in srgb, var(--accent3) 32%, var(--card))" }}>
            <h3 className="font-display font-black text-xl">Referral wallet</h3>
            <div className="mt-3 font-display font-black text-4xl">${(data.wallet?.balanceUSD || 0).toFixed(2)}</div>
            <p className="text-sm opacity-75 mt-1">
              Earn 10% when a referred user buys any paid plan.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
              <div><strong>${(data.wallet?.earnedUSD || 0).toFixed(2)}</strong><br />earned</div>
              <div><strong>${(data.wallet?.pendingWithdrawUSD || 0).toFixed(2)}</strong><br />pending</div>
              <div><strong>${(data.wallet?.withdrawnUSD || 0).toFixed(2)}</strong><br />paid</div>
            </div>
            {data.withdrawalNotices?.length ? (
              <div
                className="dash-note"
                onMouseEnter={() => data.withdrawalNotices!.forEach((notice) => markWithdrawalSeen(notice.id))}
              >
                <span className="dash-note-icon" aria-hidden="true">
                  {data.withdrawalNotices[0].status === "paid" ? "✓" : "!"}
                </span>
                <div>
                  <strong>
                    {data.withdrawalNotices[0].status === "paid" ? "Withdrawal paid" : "Withdrawal update"} · $
                    {data.withdrawalNotices[0].amountUSD.toFixed(2)}
                  </strong>
                  {data.withdrawalNotices[0].adminNote?.trim() ? <span>{data.withdrawalNotices[0].adminNote.trim()}</span> : null}
                </div>
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/pricing" className="nb-btn nb-btn-primary">Use balance</Link>
              <Link href="/settings#referrals" className="nb-btn">Withdraw</Link>
            </div>
          </div>

          <div className="nb-card p-6">
            <h3 className="font-display font-black text-xl">Referral link</h3>
            <p className="text-sm opacity-70 mt-2">Share your link. Bonus unlocks only after a paid subscription confirms.</p>
            <div className="mt-3 p-3 border-2 border-ink/20 dark:border-nightInk/20 rounded-lg break-all text-sm">
              {data.referral?.link || <span className="inline-block w-full nb-skeleton h-6" />}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="nb-btn nb-btn-primary" onClick={copyReferralLink}>Copy link</button>
              <span className="nb-box-badge" style={{ background: "color-mix(in srgb, var(--accent2) 45%, var(--card))" }}>{data.referral?.totalReferrals || 0} signups</span>
            </div>
          </div>
        </div>

        {/* Usage history */}
        {data.usageHistory && data.usageHistory.length > 0 && (
          <div className="nb-card p-6 mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-display font-black text-xl">Usage history</h3>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-55">Animated preview</span>
            </div>
            <UsageChart data={data.usageHistory} total={data.totalUsage} />
          </div>
        )}
        <DashboardLiveWidgets
          isAdmin={data.user.isAdmin}
          profile={{ name: data.user.name, avatarUrl: data.user.avatarUrl || null }}
        />
      </main>
    </>
  );
}

function DashboardLoadingState() {
  return (
    <div className="grid gap-5">
      <div className="nb-card p-6">
        <div className="nb-skeleton h-10 max-w-[320px]" />
        <div className="nb-skeleton h-5 max-w-[240px] mt-3" />
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="nb-card p-6">
            <div className="nb-skeleton h-4 max-w-[120px]" />
            <div className="nb-skeleton h-12 max-w-[90px] mt-4" />
            <div className="nb-skeleton h-4 max-w-[160px] mt-3" />
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {[0, 1].map((item) => (
          <div key={item} className="nb-card p-6">
            <div className="nb-skeleton h-7 max-w-[180px]" />
            <div className="nb-skeleton h-5 mt-4" />
            <div className="nb-skeleton h-5 max-w-[70%] mt-3" />
            <div className="nb-skeleton h-11 max-w-[160px] mt-5" />
          </div>
        ))}
      </div>
    </div>
  );
}
