import type { ReactNode } from "react";
import AuthScene from "./AuthScene";
import "./AuthScene.css";

export default function AuthShell({ children, mode }: { children: ReactNode; mode: "login" | "signup" | "reset" }) {
  const copy = mode === "signup"
    ? { eyebrow: "HUMAN-IN-THE-LOOP", title: "Your voice.", accent: "Sharper replies.", body: "NurAi drafts the angles. You edit, ignore, or publish — the final click always stays with you." }
    : mode === "reset"
      ? { eyebrow: "SECURE RECOVERY", title: "Back in.", accent: "No support ticket.", body: "A short-lived email code verifies ownership, resets the password, and closes every old session." }
      : { eyebrow: "OPERATOR CONSOLE", title: "Move fast.", accent: "Sound human.", body: "Generate grounded reply options inside X, keep your judgment, and ship only what feels right." };

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-visual">
          <div className="auth-copy">
            <span className="auth-kicker">{copy.eyebrow}</span>
            <h2 className="auth-title">
              {copy.title} <span className="h-accent">{copy.accent}</span>
            </h2>
            <p className="auth-body">{copy.body}</p>
          </div>
          <AuthScene />
        </aside>
        <section className="auth-form">{children}</section>
      </div>
    </main>
  );
}
