import type { ReactNode } from "react";
import AuthScene from "./AuthScene";
import "./AuthScene.css";

export default function AuthShell({ children, mode }: { children: ReactNode; mode: "login" | "signup" | "reset" }) {
  const copy = mode === "signup"
    ? { eyebrow: "HUMAN-IN-THE-LOOP", title: "Your voice.", accent: "Sharper replies.", body: "NurAi drafts the angles. You edit, ignore, or publish. The final click always stays with you." }
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
          <div className="auth-signals" aria-hidden="true">
            <div className="auth-signal"><b>01</b> Context-aware drafts</div>
            <div className="auth-signal"><b>02</b> Your language and tone</div>
            <div className="auth-signal"><b>03</b> You make the final call</div>
          </div>
          <AuthScene />
        </aside>
        <section className="auth-form">{children}</section>
      </div>
    </main>
  );
}
