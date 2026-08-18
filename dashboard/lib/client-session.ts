type BrowserSession = {
  token: string;
  user: Record<string, unknown>;
};

let restorePromise: Promise<BrowserSession | null> | null = null;

async function fetchBrowserSession(): Promise<BrowserSession | null> {
  try {
    const response = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) return null;
    const session = await response.json();
    if (typeof session?.token !== "string" || !session?.user) return null;
    localStorage.setItem("nurxai_jwt", session.token);
    localStorage.setItem("nurxai_user", JSON.stringify(session.user));
    return session;
  } catch {
    return null;
  }
}

export function restoreBrowserSession(): Promise<BrowserSession | null> {
  restorePromise ??= fetchBrowserSession().finally(() => {
    restorePromise = null;
  });
  return restorePromise;
}

export async function clearBrowserSession() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include", keepalive: true });
  } catch {}
  localStorage.removeItem("nurxai_jwt");
  localStorage.removeItem("nurxai_user");
}
