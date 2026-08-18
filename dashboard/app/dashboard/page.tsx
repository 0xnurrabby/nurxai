"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";
import DashboardLiveWidgets from "../components/DashboardLiveWidgets";
import PaygWalletCard from "../components/PaygWalletCard";
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

function GiftHeadline({ gifts }: { gifts: NonNullable<Me["subscriptionGifts"]> }) {
  if (!gifts.length) return null;
  const headlines = gifts.slice(0, 3).map((gift) => {
    const note = gift.note?.trim() || "Admin gifted extra premium days to your account.";
    return `Admin gift: +${gift.days} days - ${note}`;
  });
  const headlineText = headlines.join("   |   ");

  return (
    <section className="gift-news-banner" aria-label="Subscription gift">
      <div className="gift-news-label" aria-hidden="true">
        <span className="gift-news-emoji">🎁</span>
      </div>
      <div className="gift-news-window">
        <div className="gift-news-track">
          <span>{headlineText}</span>
          <span aria-hidden="true">{headlineText}</span>
        </div>
      </div>
    </section>
  );
}

function WithdrawalHeadline({ notices, onSeen }: { notices: NonNullable<Me["withdrawalNotices"]>; onSeen: (id: string) => void }) {
  if (!notices.length) return null;
  const headlines = notices.slice(0, 3).map((item) => {
    const note = item.adminNote?.trim();
    if (item.status === "paid") return `Withdrawal paid: $${item.amountUSD.toFixed(2)}${note ? ` - ${note}` : ""}`;
    return `Withdrawal update: $${item.amountUSD.toFixed(2)} request rejected${note ? ` - ${note}` : ""}`;
  });
  const headlineText = headlines.join("   |   ");

  return (
    <section className="gift-news-banner wallet-news-banner" aria-label="Withdrawal update" onMouseEnter={() => notices.forEach((n) => onSeen(n.id))}>
      <div className="gift-news-label" aria-hidden="true">
        <span className="gift-news-emoji">USDT</span>
      </div>
      <div className="gift-news-window">
        <div className="gift-news-track">
          <span>{headlineText}</span>
          <span aria-hidden="true">{headlineText}</span>
        </div>
      </div>
    </section>
  );
}

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
        <PaygWalletCard />
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

        <GiftHeadline gifts={data.subscriptionGifts || []} />
        <WithdrawalHeadline notices={data.withdrawalNotices || []} onSeen={markWithdrawalSeen} />

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
                  {sub.plan === "premium" && <li>✓ Premium-quality generation</li>}
                </ul>
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

        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <div className="nb-card p-6" style={{ background: "var(--accent3)" }}>
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
              <span className="nb-box-badge" style={{ background: "var(--accent2)" }}>{data.referral?.totalReferrals || 0} signups</span>
            </div>
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
