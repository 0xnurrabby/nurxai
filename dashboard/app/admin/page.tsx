"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

type Subscription = {
  id: string;
  plan: string;
  status: string;
  dailyLimit?: number | null;
  startsAt: string;
  endsAt: string;
};

type Payment = {
  id: string;
  provider: string;
  providerId: string;
  providerPaymentId?: string | null;
  amount: string | number;
  currency: string;
  plan: string;
  status: string;
  txHash?: string | null;
  createdAt: string;
};

type SubscriptionGift = {
  id: string;
  userId: string;
  subscriptionId: string;
  adminId?: string | null;
  days: number;
  note?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  referralCode?: string | null;
  referredBy?: { id: string; email: string; name?: string | null; referralCode?: string | null } | null;
  wallet?: { balanceUSD: number; earnedUSD: number; spentUSD: number; withdrawnUSD: number; pendingWithdrawUSD: number };
  isAdmin: boolean;
  createdAt: string;
  subscriptions: Subscription[];
  activeSubscription?: Subscription | null;
  payments?: Payment[];
  _count: { payments: number; generations: number; projects?: number };
  gen: {
    total: number;
    usedToday: number;
    inputTokens: number;
    outputTokens: number;
    costUSD: string;
  };
};

type UserDetail = AdminUser & {
  payments: Payment[];
  usage: Array<{ id: string; day: string; count: number }>;
  projects: Array<{ id: string; name: string; active: boolean; createdAt: string; _count: { contexts: number } }>;
  generations: Array<{
    id: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUSD: string;
    usageDetails?: any;
    hadImage: boolean;
    createdAt: string;
  }>;
  totals: { inputTokens: number; outputTokens: number; costUSD: string };
  auditLogs: Array<{ id: string; event: string; meta: any; createdAt: string }>;
  subscriptionGifts: SubscriptionGift[];
  wallet?: { balanceUSD: number; earnedUSD: number; spentUSD: number; withdrawnUSD: number; pendingWithdrawUSD: number };
  walletLedger?: Array<{ id: string; amountUSD: number; type: string; note?: string | null; createdAt: string }>;
  withdrawals?: Array<{ id: string; amountUSD: number; status: string; address: string; adminNote?: string | null; txHash?: string | null; createdAt: string }>;
  referrals?: Array<{ id: string; email: string; name?: string | null; createdAt: string; hasPaid: boolean }>;
};

type Stats = {
  totalUsers: number;
  activeSubs: number;
  totalComments: number;
  todayUsage: number;
  commentCost: {
    perCommentUSD: number;
    todayComments: number;
    monthlyComments: number;
    totalComments: number;
    todayUSD: number;
    monthlyUSD: number;
    totalUSD: number;
  };
};

type AdminAnnouncement = {
  id: string;
  title?: string | null;
  body: string;
  createdAt: string;
  _count?: { reads: number };
};

type AdminWithdrawal = {
  id: string;
  amountUSD: number;
  status: string;
  address: string;
  userId: string;
  user?: { email: string; name?: string | null };
  userNote?: string | null;
  adminNote?: string | null;
  txHash?: string | null;
  createdAt: string;
};

const PLAN_OPTIONS = ["trial", "starter", "pro", "premium"];
const PLAN_PRICE: Record<string, number> = { trial: 0, starter: 5, pro: 10, premium: 30 };

function fmtDate(value?: string | null, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function daysRemaining(value?: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function money(value: string | number | undefined | null, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function isCurrentlyActive(sub?: Subscription | null) {
  if (!sub || sub.status !== "active") return false;
  const now = Date.now();
  return new Date(sub.startsAt).getTime() <= now && new Date(sub.endsAt).getTime() > now;
}

function usageBreakdown(details: any) {
  return Array.isArray(details?.calls) ? details.calls : [];
}

function compactStage(stage?: string) {
  if (!stage) return "ai";
  if (stage.startsWith("gpt")) return "GPT";
  if (stage.startsWith("grok")) return "Grok";
  if (stage.startsWith("gemini")) return "Gemini";
  return stage.replace(/-/g, " ");
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  const selected = useMemo(
    () => detail || users.find((u) => u.id === selectedId) || null,
    [detail, selectedId, users]
  );

  function getToken() {
    return typeof window !== "undefined" ? localStorage.getItem("nurxai_jwt") : null;
  }

  function showToast(text: string, type: "success" | "error" = "success") {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 3200);
  }

  async function apiFetch(url: string, init: RequestInit = {}) {
    const token = getToken();
    if (!token) {
      router.push("/login");
      throw new Error("Missing token");
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const res = await fetch(url, { ...init, headers });
    if (res.status === 403) setForbidden(true);
    if (res.status === 401) router.push("/login");
    return res;
  }

  async function fetchUsers(q = search) {
    const r = await apiFetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
    if (!r.ok) return;
    const d = await r.json();
    setUsers(d.users || []);
  }

  async function fetchStats() {
    const r = await apiFetch("/api/admin/stats");
    if (r.ok) setStats(await r.json());
  }

  async function fetchAnnouncements() {
    const r = await apiFetch("/api/admin/announcements");
    if (r.ok) {
      const d = await r.json();
      setAnnouncements(d.announcements || []);
    }
  }

  async function fetchWithdrawals() {
    const r = await apiFetch("/api/admin/referrals?status=pending");
    if (r.ok) {
      const d = await r.json();
      setWithdrawals(d.withdrawals || []);
    }
  }

  async function fetchDetail(userId: string) {
    setSelectedId(userId);
    setDetail(null);
    setDetailLoading(true);
    const r = await apiFetch(`/api/admin/users/${userId}`);
    if (r.ok) {
      const d = await r.json();
      setDetail(d.user);
    }
    setDetailLoading(false);
  }

  async function refreshAll() {
    await Promise.all([fetchUsers(search), fetchStats(), fetchAnnouncements(), fetchWithdrawals()]);
    if (selectedId) await fetchDetail(selectedId);
  }

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([fetchUsers(""), fetchStats(), fetchAnnouncements(), fetchWithdrawals()]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function subscriptionAction(userId: string, body: any, success: string) {
    setBusy(JSON.stringify(body));
    const r = await apiFetch("/api/admin/grant", {
      method: "POST",
      body: JSON.stringify({ userId, ...body })
    });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok) {
      showToast(success);
      await refreshAll();
    } else {
      showToast(d.message || d.error || "Action failed.", "error");
    }
  }

  async function grantPlan(userId: string, plan: string, days?: number, grantReferralBonus?: boolean, referralBonusBaseUSD?: number) {
    await subscriptionAction(userId, { plan, days, action: "grant", grantReferralBonus, referralBonusBaseUSD }, `Granted ${plan}`);
  }

  async function extendPlan(userId: string, days: number, note?: string) {
    await subscriptionAction(userId, { action: "extend", days, note }, `Added ${days} days`);
  }

  async function setExpiry(userId: string, endsAt: string) {
    await subscriptionAction(userId, { action: "setExpiry", endsAt }, "Subscription expiry updated");
  }

  async function revokePlan(userId: string) {
    if (!confirm("Revoke active subscription now?")) return;
    await subscriptionAction(userId, { action: "revoke" }, "Subscription revoked");
  }

  async function updateUser(userId: string, data: any) {
    const r = await apiFetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast("User updated");
      await refreshAll();
    } else {
      showToast(d.message || d.error || "Update failed.", "error");
    }
  }

  async function adjustWallet(userId: string, amountUSD: number, note: string) {
    const r = await apiFetch("/api/admin/referrals", {
      method: "POST",
      body: JSON.stringify({ action: "adjustBalance", userId, amountUSD, note })
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast("Wallet balance updated");
      await refreshAll();
    } else {
      showToast(d.message || d.error || "Wallet adjustment failed.", "error");
    }
  }

  async function updateWithdrawal(id: string, action: "withdrawPaid" | "withdrawReject", note: string, txHash?: string) {
    const r = await apiFetch("/api/admin/referrals", {
      method: "POST",
      body: JSON.stringify({ action, id, note, txHash })
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast("Withdrawal updated");
      await refreshAll();
    } else {
      showToast(d.message || d.error || "Withdrawal update failed.", "error");
    }
  }

  async function updateSubscriptionGift(id: string, days: number, note: string) {
    setBusy(`gift:${id}`);
    const r = await apiFetch("/api/admin/subscription-gifts", {
      method: "PATCH",
      body: JSON.stringify({ id, days, note })
    });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok) {
      showToast("Gift updated");
      await refreshAll();
    } else {
      showToast(d.message || d.error || "Gift update failed.", "error");
    }
  }

  async function removeSubscriptionGift(id: string) {
    if (!confirm("Remove this gifted day record and subtract its days from the subscription?")) return;
    setBusy(`gift:${id}`);
    const r = await apiFetch(`/api/admin/subscription-gifts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok) {
      showToast("Gift removed");
      await refreshAll();
    } else {
      showToast(d.message || d.error || "Gift remove failed.", "error");
    }
  }

  async function sendAnnouncement() {
    const body = announcementBody.trim();
    if (!body) {
      showToast("Announcement text is empty.", "error");
      return;
    }
    setAnnouncementBusy(true);
    const r = await apiFetch("/api/admin/announcements", {
      method: "POST",
      body: JSON.stringify({
        title: announcementTitle.trim(),
        body
      })
    });
    const d = await r.json().catch(() => ({}));
    setAnnouncementBusy(false);
    if (r.ok) {
      setAnnouncementTitle("");
      setAnnouncementBody("");
      await fetchAnnouncements();
      showToast("Announcement sent.");
    } else {
      showToast(d.message || d.error || "Announcement failed.", "error");
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm("Delete this announcement for everyone?")) return;
    const r = await apiFetch(`/api/admin/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setAnnouncements((items) => items.filter((item) => item.id !== id));
      showToast("Announcement deleted");
    } else {
      showToast(d.message || d.error || "Delete failed.", "error");
    }
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Delete ${email}? This removes the user and related app data permanently.`)) return;
    const r = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setSelectedId(null);
      setDetail(null);
      await refreshAll();
      showToast("User deleted");
    } else {
      showToast(d.message || d.error || "Delete failed.", "error");
    }
  }

  if (forbidden) {
    return (
      <>
        <Navbar />
        <main className="max-w-md mx-auto px-5 py-20 text-center">
          <div className="nb-card p-8">
            <h1 className="font-display font-black text-3xl">Access denied</h1>
            <p className="mt-3">Admin access is locked to emails in ADMIN_EMAILS.</p>
          </div>
        </main>
      </>
    );
  }

  if (loading) return <><Navbar /><main className="p-10 text-center">Loading admin panel...</main></>;

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-5 py-8">
        {toast && <div className={`premium-toast ${toast.type === "error" ? "premium-toast-error" : ""}`}>{toast.text}</div>}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-black text-4xl">Admin Panel</h1>
            <p className="text-sm opacity-70 mt-1">Users, subscriptions, payments, usage and recovery tools.</p>
          </div>
          <button className="nb-btn nb-btn-primary" onClick={refreshAll}>Refresh</button>
        </div>

        {stats && (
          <>
            <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
              <StatCard label="Total Users" value={stats.totalUsers} color="var(--accent3)" />
              <StatCard label="Active Subs" value={stats.activeSubs} color="var(--accent2)" />
              <StatCard label="Total Comments" value={(stats.totalComments || 0).toLocaleString()} />
              <StatCard label="Today Usage" value={stats.todayUsage} />
              <StatCard label="Rate" value={`$${money(stats.commentCost.perCommentUSD, 3)}`} sub="per comment" color="var(--accent)" />
            </div>

            <div className="grid md:grid-cols-3 gap-4 mt-4">
              <StatCard
                label="Today Cost"
                value={`$${money(stats.commentCost.todayUSD, 3)}`}
                sub={`${stats.commentCost.todayComments.toLocaleString()} comments at $${money(stats.commentCost.perCommentUSD, 3)} each`}
              />
              <StatCard
                label="Monthly Cost"
                value={`$${money(stats.commentCost.monthlyUSD, 2)}`}
                sub={`${stats.commentCost.monthlyComments.toLocaleString()} comments in last 30 days`}
              />
              <StatCard
                label="Total Cost"
                value={`$${money(stats.commentCost.totalUSD, 2)}`}
                sub={`${stats.commentCost.totalComments.toLocaleString()} lifetime comments`}
              />
            </div>
          </>
        )}

        {withdrawals.length > 0 && (
          <div className="nb-card p-5 mt-6" style={{ background: "var(--accent3)" }}>
            <h2 className="font-display font-black text-2xl">Pending withdrawals</h2>
            <div className="mt-4 grid gap-3">
              {withdrawals.map((w) => (
                <PendingWithdrawalCard key={w.id} withdrawal={w} onUpdate={updateWithdrawal} />
              ))}
            </div>
          </div>
        )}

        <div className="nb-card p-5 mt-6">
          <h2 className="font-display font-black text-2xl">Send dashboard announcement</h2>
          <p className="text-sm opacity-70 mt-1">
            Users will see a pulsing red notification icon until they read it.
          </p>
          <div className="grid gap-3 mt-4">
            <input
              className="nb-input"
              value={announcementTitle}
              onChange={(e) => setAnnouncementTitle(e.target.value)}
              placeholder="Optional title"
              maxLength={120}
            />
            <textarea
              className="nb-input min-h-[110px]"
              value={announcementBody}
              onChange={(e) => setAnnouncementBody(e.target.value)}
              placeholder="Write update, announcement, or warning for all users..."
              maxLength={2000}
            />
            <button className="nb-btn nb-btn-primary justify-self-start" onClick={sendAnnouncement} disabled={announcementBusy}>
              {announcementBusy ? "Sending..." : "Send to all users"}
            </button>
          </div>
          <div className="mt-5 grid gap-2">
            <h3 className="font-bold">Recent announcements</h3>
            {announcements.length === 0 ? (
              <p className="text-sm opacity-60">No announcements yet.</p>
            ) : announcements.map((item) => (
              <div key={item.id} className="border-2 border-ink/20 dark:border-nightInk/20 rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{item.title || "Announcement"}</div>
                  <div className="text-sm opacity-80 whitespace-pre-wrap">{item.body}</div>
                  <div className="text-xs opacity-60 mt-1">
                    {fmtDate(item.createdAt, true)} | {item._count?.reads || 0} reads
                  </div>
                </div>
                <button className="nb-btn nb-btn-danger text-xs px-3 py-1" onClick={() => deleteAnnouncement(item.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <input
            type="text"
            className="nb-input flex-1"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchUsers(search)}
          />
          <button className="nb-btn nb-btn-primary" onClick={() => fetchUsers(search)}>Search</button>
        </div>

        <div className="mt-6 grid xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
          <UserTable
            users={users}
            selectedId={selectedId}
            onSelect={fetchDetail}
            onGrant={grantPlan}
            onRevoke={revokePlan}
            onReset={setResetUser}
            onDelete={deleteUser}
          />

          <DetailPanel
            user={selected}
            detailLoading={detailLoading}
            busy={busy}
            onClose={() => {
              setSelectedId(null);
              setDetail(null);
            }}
            onGrant={grantPlan}
            onExtend={extendPlan}
            onAdjustWallet={adjustWallet}
            onUpdateWithdrawal={updateWithdrawal}
            onUpdateGift={updateSubscriptionGift}
            onRemoveGift={removeSubscriptionGift}
            onSetExpiry={setExpiry}
            onRevoke={revokePlan}
            onUpdate={updateUser}
            onReset={setResetUser}
            onDelete={deleteUser}
          />
        </div>

        {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      </main>
    </>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div className="nb-card p-4" style={color ? { background: color } : undefined}>
      <div className="text-sm font-bold opacity-70">{label}</div>
      <div className="font-display font-black text-3xl">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-1">{sub}</div>}
    </div>
  );
}

function PendingWithdrawalCard({
  withdrawal,
  onUpdate
}: {
  withdrawal: AdminWithdrawal;
  onUpdate: (id: string, action: "withdrawPaid" | "withdrawReject", note: string, txHash?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [txHash, setTxHash] = useState("");
  return (
    <div className="border-2 border-ink/20 dark:border-nightInk/20 rounded-lg p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-black">${money(withdrawal.amountUSD)} - {withdrawal.user?.email || withdrawal.userId}</div>
          <div className="text-xs opacity-70 break-all">BEP-20 USDT: {withdrawal.address}</div>
          <div className="text-xs opacity-70">{fmtDate(withdrawal.createdAt, true)}</div>
          {withdrawal.userNote && <div className="text-xs opacity-80 mt-1">User note: {withdrawal.userNote}</div>}
        </div>
      </div>
      <div className="grid md:grid-cols-[minmax(0,1fr)_180px] gap-2 mt-3">
        <input className="nb-input text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin note shown to user" />
        <input className="nb-input text-sm" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Tx hash optional" />
      </div>
      <div className="flex gap-2 mt-2">
        <button className="nb-btn nb-btn-success text-sm" onClick={() => onUpdate(withdrawal.id, "withdrawPaid", note, txHash)}>Mark paid</button>
        <button className="nb-btn nb-btn-danger text-sm" onClick={() => onUpdate(withdrawal.id, "withdrawReject", note)}>Reject</button>
      </div>
    </div>
  );
}

function UserTable({
  users,
  selectedId,
  onSelect,
  onGrant,
  onRevoke,
  onReset,
  onDelete
}: {
  users: AdminUser[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGrant: (userId: string, plan: string) => void;
  onRevoke: (userId: string) => void;
  onReset: (user: AdminUser) => void;
  onDelete: (userId: string, email: string) => void;
}) {
  return (
    <div className="nb-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b-2 border-ink dark:border-nightInk">
          <tr>
            <th className="p-3 text-left">User</th>
            <th className="p-3 text-left">Plan</th>
            <th className="p-3 text-left">Expires</th>
            <th className="p-3 text-left">Wallet</th>
            <th className="p-3 text-left">Usage</th>
            <th className="p-3 text-left">Tokens</th>
            <th className="p-3 text-left">Cost</th>
            <th className="p-3 text-left">Payments</th>
            <th className="p-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const sub = u.activeSubscription || u.subscriptions.find(isCurrentlyActive);
            const totalTokens = (u.gen?.inputTokens || 0) + (u.gen?.outputTokens || 0);
            const selected = selectedId === u.id;
            return (
              <tr
                key={u.id}
                className={`border-b border-ink/20 dark:border-nightInk/20 cursor-pointer ${selected ? "bg-[var(--accent3)]" : ""}`}
                onClick={() => onSelect(u.id)}
              >
                <td className="p-3 min-w-[220px]">
                  <div className="font-bold">{u.email}</div>
                  <div className="text-xs opacity-60">{u.name || "-"} | joined {fmtDate(u.createdAt)}</div>
                  <div className="text-xs opacity-70">{u.referredBy ? `ref ${u.referredBy.email}` : "no referrer"}</div>
                  {u.isAdmin && <span className="nb-tag mt-1" style={{ background: "var(--accent3)" }}>ADMIN</span>}
                </td>
                <td className="p-3">
                  {sub ? (
                    <>
                      <span className="nb-tag" style={{ background: "var(--accent2)" }}>{sub.plan}</span>
                      <div className="text-xs opacity-70 mt-1">{sub.dailyLimit ? `${sub.dailyLimit}/day` : "legacy limit"}</div>
                    </>
                  ) : <span className="opacity-50">none</span>}
                </td>
                <td className="p-3 text-xs">{sub ? `${fmtDate(sub.endsAt)} (${daysRemaining(sub.endsAt)}d)` : "-"}</td>
                <td className="p-3">
                  <div className="font-bold">${money(u.wallet?.balanceUSD)}</div>
                  <div className="text-xs opacity-70">earned ${money(u.wallet?.earnedUSD)}</div>
                </td>
                <td className="p-3">
                  <div className="font-bold">{u.gen?.total || 0}</div>
                  <div className="text-xs opacity-70">today {u.gen?.usedToday || 0}</div>
                </td>
                <td className="p-3 text-xs">{totalTokens.toLocaleString()}</td>
                <td className="p-3 text-xs">${money(u.gen?.costUSD, 4)}</td>
                <td className="p-3">
                  <div className="font-bold">{u._count.payments}</div>
                  {u.payments?.[0] && <div className="text-xs opacity-70">{u.payments[0].status}</div>}
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1 min-w-[250px]">
                    <select
                      className="nb-input text-xs py-1 px-2"
                      onChange={(e) => {
                        if (e.target.value) {
                          onGrant(u.id, e.target.value);
                          e.target.value = "";
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Grant...</option>
                      {PLAN_OPTIONS.map((p) => (
                        <option key={p} value={p} disabled={sub?.plan === p}>
                          {sub?.plan === p ? `${p} (active)` : p}
                        </option>
                      ))}
                    </select>
                    {sub && <button className="nb-btn text-xs px-2 py-1 nb-btn-danger" onClick={() => onRevoke(u.id)}>Revoke</button>}
                    <button className="nb-btn text-xs px-2 py-1 nb-btn-warn" onClick={() => onReset(u)}>Reset PW</button>
                    {!u.isAdmin && <button className="nb-btn text-xs px-2 py-1 nb-btn-danger" onClick={() => onDelete(u.id, u.email)}>Del</button>}
                  </div>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && <tr><td colSpan={9} className="p-6 text-center opacity-60">No users found.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({
  user,
  detailLoading,
  busy,
  onClose,
  onGrant,
  onExtend,
  onAdjustWallet,
  onUpdateWithdrawal,
  onUpdateGift,
  onRemoveGift,
  onSetExpiry,
  onRevoke,
  onUpdate,
  onReset,
  onDelete
}: {
  user: (AdminUser | UserDetail) | null;
  detailLoading: boolean;
  busy: string;
  onClose: () => void;
  onGrant: (userId: string, plan: string, days?: number, grantReferralBonus?: boolean, referralBonusBaseUSD?: number) => void;
  onExtend: (userId: string, days: number, note?: string) => void;
  onAdjustWallet: (userId: string, amountUSD: number, note: string) => void;
  onUpdateWithdrawal: (id: string, action: "withdrawPaid" | "withdrawReject", note: string, txHash?: string) => void;
  onUpdateGift: (id: string, days: number, note: string) => void;
  onRemoveGift: (id: string) => void;
  onSetExpiry: (userId: string, endsAt: string) => void;
  onRevoke: (userId: string) => void;
  onUpdate: (userId: string, data: any) => void;
  onReset: (user: AdminUser) => void;
  onDelete: (userId: string, email: string) => void;
}) {
  const [grantPlan, setGrantPlan] = useState("premium");
  const [grantDays, setGrantDays] = useState("30");
  const [grantReferralBonus, setGrantReferralBonus] = useState(false);
  const [referralBonusBase, setReferralBonusBase] = useState("30");
  const [extraDays, setExtraDays] = useState("7");
  const [extraDaysNote, setExtraDaysNote] = useState("Admin gifted extra premium days for your account.");
  const [editingGiftId, setEditingGiftId] = useState("");
  const [editingGiftDays, setEditingGiftDays] = useState("7");
  const [editingGiftNote, setEditingGiftNote] = useState("");
  const [expiry, setExpiry] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletNote, setWalletNote] = useState("");

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    const active = user?.activeSubscription || user?.subscriptions?.find(isCurrentlyActive);
    setExpiry(active ? active.endsAt.slice(0, 10) : "");
    setExtraDaysNote("Admin gifted extra premium days for your account.");
    setEditingGiftId("");
    setEditingGiftDays("7");
    setEditingGiftNote("");
    setGrantReferralBonus(false);
    setReferralBonusBase("30");
    setWalletAmount("");
    setWalletNote("");
  }, [user?.id]);

  if (!user) {
    return (
      <aside className="nb-card p-5 sticky top-4">
        <h2 className="font-display font-black text-2xl">User details</h2>
        <p className="text-sm opacity-70 mt-2">Select a user to inspect payments, subscription history and usage.</p>
      </aside>
    );
  }

  const detail = user as Partial<UserDetail>;
  const active = user.activeSubscription || user.subscriptions?.find(isCurrentlyActive);
  const allSubs = detail.subscriptions || user.subscriptions || [];
  const gifts = detail.subscriptionGifts || [];
  const wallet = detail.wallet || user.wallet;
  const referrer = user.referredBy;
  const isBusy = !!busy;
  const selectedGrantIsActive = active?.plan === grantPlan;

  return (
    <aside className="nb-card p-5 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-black text-2xl break-all">{user.email}</h2>
          <p className="text-xs opacity-70">Joined {fmtDate(user.createdAt, true)}</p>
        </div>
        <button className="nb-btn text-xs px-2 py-1" onClick={onClose}>Close</button>
      </div>

      {detailLoading && <p className="mt-4 text-sm font-bold">Loading full profile...</p>}

      <div className="grid grid-cols-3 gap-2 mt-5 text-sm">
        <div className="admin-summary-box" style={{ background: "var(--accent2)" }}>
          <span>Plan</span>
          <strong>{active?.plan || "none"}</strong>
        </div>
        <div className="admin-summary-box" style={{ background: "var(--accent3)" }}>
          <span>Wallet</span>
          <strong>${money(wallet?.balanceUSD)}</strong>
        </div>
        <div className="admin-summary-box" style={{ background: "var(--accent)" }}>
          <span>Referrals</span>
          <strong>{detail.referrals?.length || 0}</strong>
        </div>
      </div>

      <section className="mt-5 nb-divider pt-4">
        <h3 className="font-bold text-lg">Profile</h3>
        <div className="grid gap-2 mt-3">
          <label className="text-xs font-bold">Name</label>
          <input className="nb-input text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="text-xs font-bold">Email</label>
          <input className="nb-input text-sm" value={email} onChange={(e) => setEmail(e.target.value)} disabled={user.isAdmin} />
          <button className="nb-btn nb-btn-primary" onClick={() => onUpdate(user.id, { name, email })} disabled={isBusy}>
            Save profile
          </button>
          {user.isAdmin && <p className="text-xs opacity-70">Admin access is controlled by ADMIN_EMAILS in env, not by this panel.</p>}
        </div>
      </section>

      <section className="mt-5 nb-divider pt-4">
        <h3 className="font-bold text-lg">Referral wallet</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="p-3 border-2 border-ink/20 dark:border-nightInk/20 rounded-lg">
            <div className="text-xs opacity-70">Balance</div>
            <div className="font-black text-xl">${money(wallet?.balanceUSD)}</div>
          </div>
          <div className="p-3 border-2 border-ink/20 dark:border-nightInk/20 rounded-lg">
            <div className="text-xs opacity-70">Earned</div>
            <div className="font-black text-xl">${money(wallet?.earnedUSD)}</div>
          </div>
          <div className="p-3 border-2 border-ink/20 dark:border-nightInk/20 rounded-lg">
            <div className="text-xs opacity-70">Spent</div>
            <div className="font-black text-xl">${money(wallet?.spentUSD)}</div>
          </div>
          <div className="p-3 border-2 border-ink/20 dark:border-nightInk/20 rounded-lg">
            <div className="text-xs opacity-70">Pending</div>
            <div className="font-black text-xl">${money(wallet?.pendingWithdrawUSD)}</div>
          </div>
        </div>
        <div className="text-xs opacity-70 mt-2">
          Code: <strong>{user.referralCode || "-"}</strong>
          {referrer ? <> | Referred by <strong>{referrer.email}</strong></> : <> | No referrer</>}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <input
            className="nb-input text-sm"
            type="number"
            step="0.01"
            value={walletAmount}
            onChange={(e) => setWalletAmount(e.target.value)}
            placeholder="+/- amount"
          />
          <button
            className="nb-btn nb-btn-warn"
            disabled={isBusy || !Number(walletAmount)}
            onClick={() => onAdjustWallet(user.id, Number(walletAmount), walletNote)}
          >
            Adjust balance
          </button>
          <textarea
            className="nb-input text-sm col-span-2 min-h-[64px]"
            value={walletNote}
            onChange={(e) => setWalletNote(e.target.value)}
            placeholder="Admin note for wallet adjustment"
            maxLength={500}
          />
        </div>
      </section>

      <section className="mt-5 nb-divider pt-4">
        <h3 className="font-bold text-lg">Subscription</h3>
        {active ? (
          <div className="mt-2 p-3 border-2 border-ink dark:border-nightInk rounded-lg" style={{ background: "var(--accent2)" }}>
            <div className="font-black uppercase">{active.plan}</div>
            <div className="text-sm font-bold">Limit {active.dailyLimit ? `${active.dailyLimit} comments/day` : "legacy plan limit"}</div>
            <div className="text-sm">Started {fmtDate(active.startsAt)}</div>
            <div className="text-sm">Ends {fmtDate(active.endsAt, true)}</div>
            <div className="text-sm font-bold">{daysRemaining(active.endsAt)} days remaining</div>
          </div>
        ) : (
          <p className="text-sm opacity-70 mt-2">No active subscription.</p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-3">
          <select
            className="nb-input text-sm"
            value={grantPlan}
            onChange={(e) => {
              setGrantPlan(e.target.value);
              setReferralBonusBase(String(PLAN_PRICE[e.target.value] || 0));
            }}
          >
            {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className="nb-input text-sm" type="number" min="1" value={grantDays} onChange={(e) => setGrantDays(e.target.value)} />
          {referrer && (
            <>
              <div className="col-span-2 border-2 border-ink/20 dark:border-nightInk/20 rounded-lg p-3 text-xs">
                <div className="font-black">Referral bonus control</div>
                <div className="opacity-75 mt-1">
                  Referrer: <strong>{referrer.email}</strong>. Enable this only when the user actually paid and automatic payment activation failed.
                </div>
              </div>
              <label className="col-span-2 flex items-start gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={grantReferralBonus}
                  onChange={(e) => setGrantReferralBonus(e.target.checked)}
                />
                <span>
                  Also credit 10% referral bonus to {referrer.email}. Leave off for gifts/free manual grants.
                </span>
              </label>
              {grantReferralBonus && (
                <input
                  className="nb-input text-sm col-span-2"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={referralBonusBase}
                  onChange={(e) => setReferralBonusBase(e.target.value)}
                  placeholder="Actual paid amount for bonus base"
                />
              )}
            </>
          )}
          {selectedGrantIsActive && (
            <div className="col-span-2 border-2 border-ink dark:border-nightInk rounded-lg p-3 text-xs font-bold" style={{ background: "var(--accent4)" }}>
              Same plan is already active. Use Add days or Set expiry instead of granting it again.
            </div>
          )}
          <button
            className="nb-btn nb-btn-primary col-span-2"
            disabled={isBusy || selectedGrantIsActive}
            onClick={() => onGrant(user.id, grantPlan, Number(grantDays), grantReferralBonus, Number(referralBonusBase))}
          >
            Grant / replace plan
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <input
            className="nb-input text-sm"
            type="number"
            min="1"
            value={extraDays}
            onChange={(e) => setExtraDays(e.target.value)}
            aria-label="Extra days"
          />
          <button className="nb-btn nb-btn-success" disabled={!active || isBusy} onClick={() => onExtend(user.id, Number(extraDays), extraDaysNote)}>
            Add days
          </button>
          <textarea
            className="nb-input text-sm col-span-2 min-h-[74px]"
            value={extraDaysNote}
            onChange={(e) => setExtraDaysNote(e.target.value)}
            placeholder="Gift note shown on the user's dashboard..."
            maxLength={500}
          />
          <input className="nb-input text-sm" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <button className="nb-btn nb-btn-warn" disabled={!active || !expiry || isBusy} onClick={() => onSetExpiry(user.id, `${expiry}T23:59:59.999Z`)}>
            Set expiry
          </button>
        </div>

        {active && <button className="nb-btn nb-btn-danger w-full mt-3" disabled={isBusy} onClick={() => onRevoke(user.id)}>Revoke now</button>}
      </section>

      <MiniList title="Gifted extra days">
        {gifts.length === 0 ? (
          <p className="text-sm opacity-60">No active gift notes.</p>
        ) : gifts.map((gift) => {
          const editing = editingGiftId === gift.id;
          return (
            <div key={gift.id} className="py-3 border-b border-ink/20 dark:border-nightInk/20 text-sm">
              {editing ? (
                <div className="grid gap-2">
                  <input
                    className="nb-input text-sm"
                    type="number"
                    min="1"
                    value={editingGiftDays}
                    onChange={(e) => setEditingGiftDays(e.target.value)}
                  />
                  <textarea
                    className="nb-input text-sm min-h-[74px]"
                    value={editingGiftNote}
                    onChange={(e) => setEditingGiftNote(e.target.value)}
                    maxLength={500}
                  />
                  <div className="flex gap-2">
                    <button
                      className="nb-btn nb-btn-primary text-xs px-3 py-1"
                      disabled={isBusy}
                      onClick={() => onUpdateGift(gift.id, Number(editingGiftDays), editingGiftNote)}
                    >
                      Save
                    </button>
                    <button className="nb-btn text-xs px-3 py-1" onClick={() => setEditingGiftId("")}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-bold">+{gift.days} days <span className="opacity-60">({fmtDate(gift.createdAt, true)})</span></div>
                  <div className="text-xs opacity-80 whitespace-pre-wrap mt-1">{gift.note || "No note"}</div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="nb-btn nb-btn-warn text-xs px-3 py-1"
                      disabled={isBusy}
                      onClick={() => {
                        setEditingGiftId(gift.id);
                        setEditingGiftDays(String(gift.days));
                        setEditingGiftNote(gift.note || "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="nb-btn nb-btn-danger text-xs px-3 py-1"
                      disabled={isBusy}
                      onClick={() => onRemoveGift(gift.id)}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </MiniList>

      <MiniList title="Subscription history">
        {allSubs.slice(0, 8).map((s) => (
          <div key={s.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">{s.plan} <span className="opacity-60">({s.status})</span></div>
            <div className="text-xs opacity-70">{s.dailyLimit ? `${s.dailyLimit} comments/day` : "legacy limit"}</div>
            <div className="text-xs opacity-70">{fmtDate(s.startsAt)} to {fmtDate(s.endsAt)}</div>
          </div>
        ))}
      </MiniList>

      <MiniList title="Payments">
        {(detail.payments || user.payments || []).slice(0, 10).map((p) => (
          <div key={p.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">{p.provider} ${money(p.amount)} {p.currency} <span className="opacity-60">({p.status})</span></div>
            <div className="text-xs opacity-70 break-all">{p.providerPaymentId || p.providerId}</div>
            <div className="text-xs opacity-70">{fmtDate(p.createdAt, true)}</div>
          </div>
        ))}
      </MiniList>

      <MiniList title="Referral signups">
        {(detail.referrals || []).slice(0, 10).map((r) => (
          <div key={r.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">{r.email} {r.hasPaid && <span className="nb-tag ml-1" style={{ background: "var(--accent2)" }}>paid</span>}</div>
            <div className="text-xs opacity-70">Joined {fmtDate(r.createdAt, true)}</div>
          </div>
        ))}
      </MiniList>

      <MiniList title="Wallet ledger">
        {(detail.walletLedger || []).slice(0, 12).map((l) => (
          <div key={l.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">{l.type} <span className={l.amountUSD >= 0 ? "text-green-700" : "text-red-700"}>${money(l.amountUSD)}</span></div>
            <div className="text-xs opacity-70">{fmtDate(l.createdAt, true)}</div>
            {l.note && <div className="text-xs opacity-70">{l.note}</div>}
          </div>
        ))}
      </MiniList>

      <MiniList title="Withdrawals">
        {(detail.withdrawals || []).slice(0, 10).map((w) => (
          <div key={w.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">${money(w.amountUSD)} <span className="opacity-60">({w.status})</span></div>
            <div className="text-xs opacity-70 break-all">{w.address}</div>
            <div className="text-xs opacity-70">{fmtDate(w.createdAt, true)}</div>
            {w.status === "pending" && (
              <div className="flex gap-2 mt-2">
                <button className="nb-btn nb-btn-success text-xs px-3 py-1" onClick={() => onUpdateWithdrawal(w.id, "withdrawPaid", "Paid manually by admin.", w.txHash || "")}>Mark paid</button>
                <button className="nb-btn nb-btn-danger text-xs px-3 py-1" onClick={() => onUpdateWithdrawal(w.id, "withdrawReject", "Rejected by admin.")}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </MiniList>

      <MiniList title="Usage">
        {(detail.usage || []).slice(0, 14).map((u) => (
          <div key={u.id} className="py-1 flex justify-between text-sm border-b border-ink/10 dark:border-nightInk/10">
            <span>{u.day}</span>
            <strong>{u.count}</strong>
          </div>
        ))}
      </MiniList>

      <MiniList title="Projects">
        {(detail.projects || []).map((p) => (
          <div key={p.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">{p.name}</div>
            <div className="text-xs opacity-70">{p._count.contexts} contexts | {p.active ? "active" : "inactive"}</div>
          </div>
        ))}
      </MiniList>

      <MiniList title="Recent generations">
        {(detail.generations || []).map((g) => (
          <div key={g.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">{g.model || "AI stack"} | {(g.inputTokens + g.outputTokens).toLocaleString()} tokens</div>
            <div className="text-xs opacity-70">${money(g.costUSD, 4)} | {fmtDate(g.createdAt, true)}</div>
            {usageBreakdown(g.usageDetails).length > 0 && (
              <div className="text-[11px] opacity-60 mt-1 leading-snug">
                {usageBreakdown(g.usageDetails).slice(0, 4).map((c: any) =>
                  `${compactStage(c.stage)} ${(Number(c.inputTokens || 0) + Number(c.outputTokens || 0)).toLocaleString()}t $${money(c.costUSD, 4)}`
                ).join(" | ")}
              </div>
            )}
          </div>
        ))}
      </MiniList>

      <MiniList title="Audit log">
        {(detail.auditLogs || []).map((a) => (
          <div key={a.id} className="py-2 border-b border-ink/20 dark:border-nightInk/20 text-sm">
            <div className="font-bold">{a.event}</div>
            <div className="text-xs opacity-70">{fmtDate(a.createdAt, true)}</div>
          </div>
        ))}
      </MiniList>

      <section className="mt-5 nb-divider pt-4 grid gap-2">
        <button className="nb-btn nb-btn-warn" onClick={() => onReset(user as AdminUser)}>Reset password</button>
        {!user.isAdmin && <button className="nb-btn nb-btn-danger" onClick={() => onDelete(user.id, user.email)}>Delete user</button>}
      </section>
    </aside>
  );
}

function MiniList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="admin-detail-group mt-4" open={["Gifted extra days", "Subscription history", "Payments"].includes(title)}>
      <summary>{title}</summary>
      <div className="mt-2">{children || <p className="text-sm opacity-60">No data.</p>}</div>
    </details>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [mode, setMode] = useState<"plain" | "hash">("plain");
  const [newPassword, setNewPassword] = useState("");
  const [passwordHash, setPasswordHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const token = localStorage.getItem("nurxai_jwt");
      const body: any = { userId: user.id };
      if (mode === "plain") {
        if (newPassword.length < 6) {
          setMsg("Password must be at least 6 characters.");
          setBusy(false);
          return;
        }
        body.newPassword = newPassword;
      } else {
        if (!passwordHash.startsWith("$2") || passwordHash.length < 50) {
          setMsg("Hash must start with $2 and be at least 50 chars.");
          setBusy(false);
          return;
        }
        body.passwordHash = passwordHash.trim();
      }
      const r = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg(`Password reset for ${user.email}`);
        setTimeout(onClose, 1200);
      } else {
        setMsg(d.message || d.error || "Reset failed.");
      }
    } catch (e: any) {
      setMsg(e?.message || "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="nb-card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display font-black text-2xl">Reset password</h2>
        <p className="text-sm opacity-70 mt-1">For: <strong>{user.email}</strong></p>

        <div className="mt-4 flex gap-2 text-sm">
          <button className={`nb-btn flex-1 ${mode === "plain" ? "nb-btn-primary" : ""}`} onClick={() => setMode("plain")}>New password</button>
          <button className={`nb-btn flex-1 ${mode === "hash" ? "nb-btn-primary" : ""}`} onClick={() => setMode("hash")}>Bcrypt hash</button>
        </div>

        {mode === "plain" ? (
          <div className="mt-4">
            <label className="font-semibold text-sm">New password (min 6 chars)</label>
            <input type="text" className="nb-input mt-1" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="newPass123" />
          </div>
        ) : (
          <div className="mt-4">
            <label className="font-semibold text-sm">Bcrypt hash</label>
            <textarea className="nb-input mt-1 font-mono text-xs" rows={3} value={passwordHash} onChange={(e) => setPasswordHash(e.target.value)} placeholder="$2a$10$..." />
          </div>
        )}

        {msg && <p className="mt-3 text-sm font-semibold" style={{ color: msg.toLowerCase().includes("reset") ? "#0a7d2e" : "#b00020" }}>{msg}</p>}

        <div className="mt-5 flex gap-2 justify-end">
          <button className="nb-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="nb-btn nb-btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving..." : "Reset"}</button>
        </div>
      </div>
    </div>
  );
}
