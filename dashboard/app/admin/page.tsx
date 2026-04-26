"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
  subscriptions: Array<{ plan: string; status: string; endsAt: string }>;
  _count: { payments: number; generations: number };
  gen: {
    total: number;
    usedToday: number;
    inputTokens: number;
    outputTokens: number;
    costUSD: string;
  };
};

type Stats = {
  totalUsers: number;
  activeSubs: number;
  totalPayments: number;
  todayUsage: number;
  revenue: string;
  tokens?: {
    allTime: { input: number; output: number; cost: string };
    today: { input: number; output: number; cost: string };
    last30d: { input: number; output: number; cost: string };
  };
  profitMargin?: { revenue: number; cost: number; profit: number };
};


const PLAN_OPTIONS = ["trial", "starter", "pro", "premium"];

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const router = useRouter();

  function getToken() {
    return typeof window !== "undefined" ? localStorage.getItem("nurxai_jwt") : null;
  }

  async function fetchUsers(q = "") {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 403) { setForbidden(true); return; }
    if (r.status === 401) { router.push("/login"); return; }
    const d = await r.json();
    setUsers(d.users || []);
  }

  async function fetchStats() {
    const token = getToken();
    if (!token) return;
    const r = await fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) {
      const d = await r.json();
      setStats(d);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([fetchUsers(), fetchStats()]);
      setLoading(false);
    })();
  }, []);

  async function grantPlan(userId: string, plan: string) {
    const token = getToken();
    const r = await fetch("/api/admin/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, plan, action: "grant" })
    });
    if (r.ok) {
      alert(`Granted ${plan} plan`);
      fetchUsers(search);
    } else {
      alert("Failed: " + (await r.text()));
    }
  }

  async function revokePlan(userId: string) {
    if (!confirm("Revoke active subscription?")) return;
    const token = getToken();
    const r = await fetch("/api/admin/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, action: "revoke" })
    });
    if (r.ok) {
      alert("Revoked");
      fetchUsers(search);
    }
  }

  async function toggleAdmin(userId: string, current: boolean) {
    if (!confirm(current ? "Remove admin rights?" : "Make this user an admin?")) return;
    const token = getToken();
    const r = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isAdmin: !current })
    });
    if (r.ok) fetchUsers(search);
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Delete ${email}? Permanent.`)) return;
    const token = getToken();
    const r = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) {
      alert("Deleted");
      fetchUsers(search);
    } else {
      alert("Failed: " + (await r.text()));
    }
  }

  if (forbidden) {
    return (
      <>
        <Navbar />
        <main className="max-w-md mx-auto px-5 py-20 text-center">
          <div className="nb-card p-8">
            <h1 className="font-display font-black text-3xl">Access denied</h1>
            <p className="mt-3">Admin access only.</p>
          </div>
        </main>
      </>
    );
  }

  if (loading) {
    return (<><Navbar /><main className="p-10 text-center">Loading admin panel…</main></>);
  }

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-5 py-8">
        <h1 className="font-display font-black text-4xl">Admin Panel</h1>

                {stats && (
          <>
            <div className="grid md:grid-cols-5 gap-4 mt-6">
              <div className="nb-card p-4" style={{ background: "var(--accent3)" }}>
                <div className="text-sm font-bold opacity-70">Total Users</div>
                <div className="font-display font-black text-3xl">{stats.totalUsers}</div>
              </div>
              <div className="nb-card p-4" style={{ background: "var(--accent2)" }}>
                <div className="text-sm font-bold opacity-70">Active Subs</div>
                <div className="font-display font-black text-3xl">{stats.activeSubs}</div>
              </div>
              <div className="nb-card p-4" style={{ background: "var(--accent)" }}>
                <div className="text-sm font-bold opacity-70">Payments</div>
                <div className="font-display font-black text-3xl">{stats.totalPayments}</div>
              </div>
              <div className="nb-card p-4">
                <div className="text-sm font-bold opacity-70">Today Usage</div>
                <div className="font-display font-black text-3xl">{stats.todayUsage}</div>
              </div>
              <div className="nb-card p-4">
                <div className="text-sm font-bold opacity-70">Revenue (USD)</div>
                <div className="font-display font-black text-3xl">${stats.revenue}</div>
              </div>
            </div>

            {stats.tokens && (
              <div className="grid md:grid-cols-3 gap-4 mt-4">
                <div className="nb-card p-4">
                  <div className="text-sm font-bold opacity-70">Tokens Today</div>
                  <div className="font-display font-black text-2xl">
                    {(stats.tokens.today.input + stats.tokens.today.output).toLocaleString()}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    cost ~${parseFloat(stats.tokens.today.cost).toFixed(4)}
                  </div>
                </div>
                <div className="nb-card p-4">
                  <div className="text-sm font-bold opacity-70">Tokens 30 days</div>
                  <div className="font-display font-black text-2xl">
                    {(stats.tokens.last30d.input + stats.tokens.last30d.output).toLocaleString()}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    cost ~${parseFloat(stats.tokens.last30d.cost).toFixed(2)}
                  </div>
                </div>
                <div className="nb-card p-4" style={{ background: "var(--accent2)" }}>
                  <div className="text-sm font-bold opacity-70">All-time Profit</div>
                  <div className="font-display font-black text-2xl">
                    ${(stats.profitMargin?.profit || 0).toFixed(2)}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    revenue ${stats.profitMargin?.revenue.toFixed(2)} − cost ${stats.profitMargin?.cost.toFixed(4)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}


        <div className="mt-8 flex gap-3">
          <input
            type="text"
            className="nb-input flex-1"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="nb-btn nb-btn-primary" onClick={() => fetchUsers(search)}>
            Search
          </button>
        </div>

        <div className="mt-6 nb-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-ink dark:border-nightInk">
              <tr>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Plan</th>
                <th className="p-3 text-left">Expires</th>
                <th className="p-3 text-left" title="Comments generated all-time">Gens</th>
                <th className="p-3 text-left" title="Comments generated today">Today</th>
                <th className="p-3 text-left" title="Total tokens (input + output)">Tokens</th>
                <th className="p-3 text-left" title="Total OpenAI cost">Cost</th>
                <th className="p-3 text-left">Pmts</th>
                <th className="p-3 text-left">Admin</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const sub = u.subscriptions[0];
                const totalTokens =
                  (u.gen?.inputTokens || 0) + (u.gen?.outputTokens || 0);
                return (
                  <tr key={u.id} className="border-b border-ink/20 dark:border-nightInk/20">
                    <td className="p-3">
                      <div className="font-bold">{u.email}</div>
                      <div className="text-xs opacity-60">{u.name || "—"}</div>
                    </td>
                    <td className="p-3">
                      {sub ? (
                        <span className="nb-tag" style={{ background: "var(--accent2)" }}>
                          {sub.plan}
                        </span>
                      ) : (
                        <span className="opacity-50">none</span>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {sub ? new Date(sub.endsAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 font-bold">
                      {(u.gen?.total || 0).toLocaleString()}
                    </td>
                    <td className="p-3">{u.gen?.usedToday || 0}</td>
                    <td className="p-3 text-xs">{totalTokens.toLocaleString()}</td>
                    <td className="p-3 text-xs">
                      ${parseFloat(u.gen?.costUSD || "0").toFixed(4)}
                    </td>
                    <td className="p-3">{u._count.payments}</td>
                    <td className="p-3">
                      <button
                        className="nb-btn text-xs px-2 py-1"
                        onClick={() => toggleAdmin(u.id, u.isAdmin)}
                      >
                        {u.isAdmin ? "Admin" : "User"}
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <select
                          className="nb-input text-xs py-1 px-2"
                          onChange={(e) => {
                            if (e.target.value) {
                              grantPlan(u.id, e.target.value);
                              e.target.value = "";
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Grant…</option>
                          {PLAN_OPTIONS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        {sub && (
                          <button
                            className="nb-btn text-xs px-2 py-1"
                            style={{ background: "#ffd1dc" }}
                            onClick={() => revokePlan(u.id)}
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          className="nb-btn text-xs px-2 py-1"
                          style={{ background: "#fff89c" }}
                          onClick={() => setResetUser(u)}
                        >
                          Reset PW
                        </button>
                        <button
                          className="nb-btn text-xs px-2 py-1"
                          style={{ background: "#ff8a8a", color: "#fff" }}
                          onClick={() => deleteUser(u.id, u.email)}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center opacity-60">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {resetUser && (
          <ResetPasswordModal
            user={resetUser}
            onClose={() => setResetUser(null)}
          />
        )}
      </main>
    </>
  );
}

function ResetPasswordModal({
  user,
  onClose
}: {
  user: AdminUser;
  onClose: () => void;
}) {
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
        setTimeout(onClose, 1500);
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
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="nb-card p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display font-black text-2xl">Reset password</h2>
        <p className="text-sm opacity-70 mt-1">
          For: <strong>{user.email}</strong>
        </p>

        <div className="mt-4 flex gap-2 text-sm">
          <button
            className={`nb-btn flex-1 ${mode === "plain" ? "nb-btn-primary" : ""}`}
            onClick={() => setMode("plain")}
          >
            New plaintext
          </button>
          <button
            className={`nb-btn flex-1 ${mode === "hash" ? "nb-btn-primary" : ""}`}
            onClick={() => setMode("hash")}
          >
            Bcrypt hash
          </button>
        </div>

        {mode === "plain" ? (
          <div className="mt-4">
            <label className="font-semibold text-sm">
              New password (min 6 chars)
            </label>
            <input
              type="text"
              className="nb-input mt-1"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="newPass123"
            />
            <p className="text-xs opacity-60 mt-1">
              Send this to the user via Telegram. They sign in immediately,
              and can change it from settings later.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <label className="font-semibold text-sm">
              Bcrypt hash (starts with $2)
            </label>
            <textarea
              className="nb-input mt-1 font-mono text-xs"
              rows={3}
              value={passwordHash}
              onChange={(e) => setPasswordHash(e.target.value)}
              placeholder="$2a$10$..."
            />
            <p className="text-xs opacity-60 mt-1">
              Paste a previously-known bcrypt hash if the user is bringing
              their own.
            </p>
          </div>
        )}

        {msg && (
          <p
            className="mt-3 text-sm font-semibold"
            style={{
              color: msg.toLowerCase().includes("reset") ? "#0a7d2e" : "#b00020"
            }}
          >
            {msg}
          </p>
        )}

        <div className="mt-5 flex gap-2 justify-end">
          <button className="nb-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="nb-btn nb-btn-primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Saving..." : "Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}
