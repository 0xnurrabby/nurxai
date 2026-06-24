"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../components/Navbar";

const STYLES = [
  { key: "default", label: "Default", desc: "Balanced, friendly, human" },
  { key: "funny", label: "Funny", desc: "Witty, playful, light humor" },
  { key: "short", label: "Short and punchy", desc: "Brief one-liners" },
  { key: "productive", label: "Productive", desc: "Adds value, asks questions" },
  { key: "professional", label: "Professional", desc: "Polished, work-appropriate" },
  { key: "supportive", label: "Supportive", desc: "Empathetic, encouraging" },
  { key: "contrarian", label: "Contrarian", desc: "Politely challenges" }
];

type Project = {
  id: string;
  name: string;
  active: boolean;
  contexts: Array<{ id: string; content: string; createdAt: string }>;
};

type PlanInfo = {
  key: string;
  name: string;
  allowStyles: boolean;
  allowProjects: boolean;
  vision: boolean;
  qualityTier: string;
};

export default function Settings() {
  const router = useRouter();
  const [style, setStyle] = useState("default");
  const [customNote, setCustomNote] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newContextProject, setNewContextProject] = useState<string | null>(null);
  const [newContextText, setNewContextText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  function getToken() {
    return typeof window !== "undefined" ? localStorage.getItem("nurxai_jwt") : null;
  }

  async function load() {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const [s, p] = await Promise.all([
        fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      ]);
      if (s?.settings) {
        setStyle(s.settings.replyStyle || "default");
        setCustomNote(s.settings.customStyleNote || "");
      }
      if (s?.plan) setPlan(s.plan);
      if (p?.projects) setProjects(p.projects);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveStyle() {
    setSaving(true);
    setSaveMsg("");
    const token = getToken();
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ replyStyle: style, customStyleNote: customNote })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSaveMsg("Saved.");
        setTimeout(() => setSaveMsg(""), 2000);
      } else if (r.status === 403 && d.error === "PLAN_LOCKED") {
        setSaveMsg(d.message || "This feature requires a higher plan.");
      } else {
        setSaveMsg(d.error || "Could not save.");
      }
    } catch {
      setSaveMsg("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    const token = getToken();
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newProjectName.trim() })
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setNewProjectName("");
      load();
    } else if (r.status === 403) {
      alert(d.message || "Your plan does not allow this.");
    } else {
      alert(d.error || "Could not create project.");
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project and all its contexts?")) return;
    const token = getToken();
    await fetch(`/api/projects/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    load();
  }

  async function toggleActive(id: string, current: boolean) {
    const token = getToken();
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active: !current })
    });
    load();
  }

  async function addContext(projectId: string) {
    if (!newContextText.trim()) return;
    const token = getToken();
    const r = await fetch(`/api/projects/${projectId}/contexts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: newContextText.trim() })
    });
    if (r.ok) {
      setNewContextText("");
      setNewContextProject(null);
      load();
    }
  }

  async function deleteContext(projectId: string, contextId: string) {
    if (!confirm("Delete this context?")) return;
    const token = getToken();
    await fetch(`/api/projects/${projectId}/contexts/${contextId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    load();
  }

  if (loading) return (<><Navbar /><main className="p-10 text-center">Loading...</main></>);

  const stylesLocked = !plan?.allowStyles;
  const projectsLocked = !plan?.allowProjects;

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-5 py-10">
        <h1 className="font-display font-black text-4xl">Settings</h1>
        <p className="opacity-70 mt-2">Personalize how NurAi writes your replies.</p>

        {plan && (
          <div
            className="mt-6 nb-card p-4 flex flex-wrap items-center justify-between gap-3"
            style={{ background: "var(--accent3)" }}
          >
            <div>
              <span className="font-bold">Current plan: </span>
              <span className="uppercase font-display font-black">{plan.name}</span>
              <span className="opacity-70 ml-2 text-sm">
                ({plan.qualityTier} quality{plan.vision ? ", vision" : ""})
              </span>
            </div>
            <Link href="/pricing" className="nb-btn nb-btn-primary text-sm">
              {plan.key === "premium" ? "Manage plan" : "Upgrade"}
            </Link>
          </div>
        )}

        {/* STYLE */}
        <section className={`nb-card p-6 mt-8 ${stylesLocked ? "opacity-90" : ""}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display font-black text-2xl">Reply style</h2>
              <p className="text-sm opacity-70 mt-1">
                Pick the personality NurAi uses when writing replies.
              </p>
            </div>
            {stylesLocked && (
              <span className="nb-tag" style={{ background: "var(--accent4)" }}>
                Locked - Starter+ only
              </span>
            )}
          </div>

          {stylesLocked && (
            <div
              className="mt-4 p-3 border-2 border-ink/40 dark:border-nightInk/40 rounded-md text-sm"
              style={{ background: "var(--accent3)" }}
            >
              <strong>Trial plan:</strong> Default balanced style only.{" "}
              <Link href="/pricing" className="font-bold underline">Upgrade to Starter</Link>{" "}
              for all 7 styles + custom style note.
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            {STYLES.map((s) => {
              const disabled = stylesLocked && s.key !== "default";
              return (
                <button
                  key={s.key}
                  onClick={() => !disabled && setStyle(s.key)}
                  disabled={disabled}
                  className={`text-left p-4 border-2 rounded-lg transition ${
                    style === s.key
                      ? "border-ink dark:border-nightInk"
                      : "border-ink/30 dark:border-nightInk/30"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={style === s.key && !disabled ? { background: "var(--accent2)" } : {}}
                >
                  <div className="font-bold flex items-center gap-2">
                    {s.label}
                    {disabled && <span className="text-xs opacity-60">[Locked]</span>}
                  </div>
                  <div className="text-xs opacity-70 mt-1">{s.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <label className="font-semibold text-sm">
              Custom style note (optional)
              {stylesLocked && <span className="ml-2 text-xs opacity-60">[Locked]</span>}
            </label>
            <textarea
              className="nb-input mt-1"
              rows={3}
              maxLength={500}
              placeholder={
                stylesLocked
                  ? "Upgrade to Starter to add a custom style note."
                  : "e.g. I'm a crypto dev who loves dad jokes. Avoid corporate speak."
              }
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              disabled={stylesLocked}
            />
            <div className="text-xs opacity-60 mt-1">{customNote.length}/500</div>
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button className="nb-btn nb-btn-primary" onClick={saveStyle} disabled={saving}>
              {saving ? "Saving..." : "Save style"}
            </button>
            {saveMsg && (
              <span className="text-sm font-semibold opacity-80">{saveMsg}</span>
            )}
          </div>
        </section>

        {/* PROJECTS */}
        <section className={`nb-card p-6 mt-8 ${projectsLocked ? "opacity-90" : ""}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display font-black text-2xl">Project contexts</h2>
              <p className="text-sm opacity-70 mt-1">
                Add knowledge about projects you focus on. NurAi will use this to write
                smarter, insider-feeling replies.
              </p>
            </div>
            {projectsLocked && (
              <span className="nb-tag" style={{ background: "var(--accent4)" }}>
                Locked - Pro+ only
              </span>
            )}
          </div>

          {projectsLocked && (
            <div
              className="mt-4 p-3 border-2 border-ink/40 dark:border-nightInk/40 rounded-md text-sm"
              style={{ background: "var(--accent3)" }}
            >
              <strong>Project contexts</strong> let NurAi reply like an insider.{" "}
              <Link href="/pricing" className="font-bold underline">Upgrade to Pro</Link>{" "}
              to unlock deeper saved context.
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <input
              className="nb-input flex-1"
              placeholder={
                projectsLocked
                  ? "Upgrade to Pro to create projects"
                  : "New project name (e.g. Base, Solana, AI startup...)"
              }
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !projectsLocked) createProject(); }}
              disabled={projectsLocked}
            />
            <button
              className="nb-btn nb-btn-primary"
              onClick={createProject}
              disabled={projectsLocked}
            >
              + Add
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {projects.length === 0 && !projectsLocked && (
              <div className="text-sm opacity-60 italic">
                No projects yet. Create one above to start adding context.
              </div>
            )}
            {projects.map((p) => (
              <div key={p.id} className="nb-card p-4">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <div className="font-display font-black text-lg">{p.name}</div>
                    <div className="text-xs opacity-60">
                      {p.contexts.length} context{p.contexts.length !== 1 ? "s" : ""} -{" "}
                      {p.active ? "Active" : "Disabled"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="nb-btn text-xs px-3 py-1"
                      onClick={() => toggleActive(p.id, p.active)}
                    >
                      {p.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="nb-btn text-xs px-3 py-1"
                      style={{ background: "var(--accent4)" }}
                      onClick={() => deleteProject(p.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {p.contexts.map((c) => (
                    <div
                      key={c.id}
                      className="text-sm p-3 border-2 border-ink/20 dark:border-nightInk/20 rounded-md flex justify-between gap-3"
                    >
                      <div className="whitespace-pre-wrap flex-1">{c.content}</div>
                      <button
                        className="text-xs opacity-60 hover:opacity-100"
                        onClick={() => deleteContext(p.id, c.id)}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>

                {newContextProject === p.id ? (
                  <div className="mt-3">
                    <textarea
                      className="nb-input"
                      rows={5}
                      placeholder="Paste any info about this project: terminology, history, key people, vibes..."
                      value={newContextText}
                      onChange={(e) => setNewContextText(e.target.value)}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        className="nb-btn nb-btn-primary text-sm"
                        onClick={() => addContext(p.id)}
                      >
                        Save context
                      </button>
                      <button
                        className="nb-btn text-sm"
                        onClick={() => { setNewContextProject(null); setNewContextText(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="nb-btn text-sm mt-3"
                    onClick={() => setNewContextProject(p.id)}
                  >
                    + Add context
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
