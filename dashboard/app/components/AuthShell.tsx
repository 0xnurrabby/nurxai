import type { ReactNode } from "react";

export default function AuthShell({ children, mode }: { children: ReactNode; mode: "login" | "signup" | "reset" }) {
  const copy = mode === "signup"
    ? { eyebrow: "HUMAN-IN-THE-LOOP", title: "Your voice.", accent: "Sharper replies.", body: "NurAi drafts the angles. You edit, ignore, or publish. The final click always stays with you." }
    : mode === "reset"
      ? { eyebrow: "SECURE RECOVERY", title: "Back in.", accent: "No support ticket.", body: "A short-lived email code verifies ownership, resets the password, and closes every old session." }
      : { eyebrow: "OPERATOR CONSOLE", title: "Move fast.", accent: "Sound human.", body: "Generate grounded reply options inside X, keep your judgment, and ship only what feels right." };

  return (
    <main className="auth-stage px-5 py-9 sm:py-14">
      <div className="auth-grid mx-auto grid w-full max-w-5xl overflow-hidden border-2 border-ink dark:border-nightInk lg:grid-cols-[1.08fr_.92fr]">
        <aside className="auth-manifest relative hidden min-h-[620px] overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="relative z-10">
            <span className="auth-kicker">{copy.eyebrow}</span>
            <h2 className="mt-8 max-w-lg font-display text-6xl font-black leading-[.9] tracking-[-.05em]">
              {copy.title} <span className="h-accent">{copy.accent}</span>
            </h2>
            <p className="mt-7 max-w-md text-lg font-semibold leading-relaxed opacity-80">{copy.body}</p>
          </div>
          <div className="relative z-10 grid gap-3 text-sm font-black uppercase tracking-[.08em]">
            <div className="auth-signal"><span>01</span> Context-aware drafts</div>
            <div className="auth-signal"><span>02</span> Your language and tone</div>
            <div className="auth-signal"><span>03</span> You make the final call</div>
          </div>
          <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
          <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        </aside>
        <section className="auth-panel grid place-items-center bg-[var(--card)] p-5 sm:p-9 lg:p-10">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}
