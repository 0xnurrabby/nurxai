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
  _count: { payments: number };
};

type Stats = {
  totalUsers: number;
  activeSubs: number;
  totalPayments: number;
  todayUsage: number;
  revenue: string;
};

const PLAN_OPTIONS = ["trial", "starter", "pro", "premium"];

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [forbidden, setForbidden] = useState(false);
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
                <th className="p-3 text-left">Pmts</th>
                <th className="p-3 text-left">Admin</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const sub = u.subscriptions[0];
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
                <tr><td colSpan={6} className="p-6 text-center opacity-60">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
