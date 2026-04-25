"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

const STYLES = [
  { key: "default", label: "Default", desc: "Balanced, friendly, human" },
  { key: "funny", label: "Funny", desc: "Witty, playful, light humor" },
  { key: "short", label: "Short & punchy", desc: "Brief one-liners" },
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

export default function Settings() {
  const router = useRouter();
  const [style, setStyle] = useState("default");
  const [customNote, setCustomNote] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [newContextProject, setNewContextProject] = useState<string | null>(null);
  const [newContextText, setNewContextText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      if (p?.projects) setProjects(p.projects);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveStyle() {
    setSaving(true);
    const token = getToken();
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyStyle: style, customStyleNote: customNote })
    });
    setSaving(false);
    alert("✓ Saved");
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    const token = getToken();
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newProjectName.trim() })
    });
    if (r.ok) {
      setNewProjectName("");
      load();
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

  if (loading) return (<><Navbar /><main className="p-10 text-center">Loading…</main></>);

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-5 py-10">
        <h1 className="font-display font-black text-4xl">Settings</h1>
        <p className="opacity-70 mt-2">Personalize how NurAi writes your replies.</p>

        {/* STYLE */}
        <section className="nb-card p-6 mt-8">
          <h2 className="font-display font-black text-2xl">Reply style</h2>
          <p className="text-sm opacity-70 mt-1">
            Pick the personality NurAi uses when writing replies.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            {STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStyle(s.key)}
                className={`text-left p-4 border-2 rounded-lg transition ${
                  style === s.key
                    ? "border-ink dark:border-nightInk"
                    : "border-ink/30 dark:border-nightInk/30"
                }`}
                style={style === s.key ? { background: "var(--accent2)" } : {}}
              >
                <div className="font-bold">{s.label}</div>
                <div className="text-xs opacity-70 mt-1">{s.desc}</div>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <label className="font-semibold text-sm">
              Custom style note (optional)
            </label>
            <textarea
              className="nb-input mt-1"
              rows={3}
              maxLength={500}
              placeholder="e.g. I'm a crypto dev who loves dad jokes. Avoid corporate speak."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
            <div className="text-xs opacity-60 mt-1">{customNote.length}/500</div>
          </div>

          <button className="nb-btn nb-btn-primary mt-5" onClick={saveStyle} disabled={saving}>
            {saving ? "Saving…" : "Save style"}
          </button>
        </section>

        {/* PROJECTS */}
        <section className="nb-card p-6 mt-8">
          <h2 className="font-display font-black text-2xl">Project contexts</h2>
          <p className="text-sm opacity-70 mt-1">
            Add knowledge about projects you focus on. NurAi will use this context to write
            smarter, insider-feeling replies.
          </p>

          <div className="mt-5 flex gap-2">
            <input
              className="nb-input flex-1"
              placeholder="New project name (e.g. Base, Solana, AI startup...)"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createProject(); }}
            />
            <button className="nb-btn nb-btn-primary" onClick={createProject}>+ Add</button>
          </div>

          <div className="mt-6 space-y-4">
            {projects.length === 0 && (
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
                      {p.contexts.length} context{p.contexts.length !== 1 ? "s" : ""} •{" "}
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
                        ✕
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
