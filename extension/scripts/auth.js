// auth.js — Sign-in modal (injected via icon click); opens website for full flow.
(function () {
  if (window.__NURAI_AUTH_OPEN__) return;
  window.__NURAI_AUTH_OPEN__ = true;

  const WEB_BASE = "https://www.nurxai.xyz";
  const HOST_ID = "nurai-auth-host";

  function open() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host, * { box-sizing: border-box; }
      .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); pointer-events:auto;
                  display:grid; place-items:center; }
      .card { width: 380px; max-width: 92vw; border: 2px solid #0f1419; border-radius: 14px;
              background: #fff; color: #0f1419;
              font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow:hidden; }
      .head { display:flex; align-items:center; justify-content:space-between;
              padding:14px 16px; border-bottom:2px solid #0f1419; background: #fff89c; }
      .title { font-weight: 900; font-size: 16px; letter-spacing:.3px; }
      .x { background:#fff; border:2px solid #0f1419; border-radius:8px; cursor:pointer;
           width: 30px; height: 30px; font-weight:800; }
      .body { padding: 18px 16px; }
      p { margin: 0 0 14px; }
      .btn { display:block; width:100%; padding: 12px 14px; border:2px solid #0f1419;
             border-radius: 10px; font-weight: 800; cursor: pointer; margin-bottom: 10px; background:#fff; }
      .primary { background: #b8e1ff; }
      .secondary { background: #c4f0c2; }
      .btn:hover { filter: brightness(.95); }
      .note { font-size: 12px; margin-top: 6px; text-align:center; }
      @media (prefers-color-scheme: dark) {
        .card { background: #1a1a1a; color: #f3f3f5; border-color: #f3f3f5; }
        .head { background: #4a4a1a; border-bottom-color: #f3f3f5; }
        .x { background: #2a2a2a; border-color:#f3f3f5; color:#f3f3f5; }
        .btn { background: #222; border-color:#f3f3f5; color:#f3f3f5; }
        .primary { background: #1e3a52; }
        .secondary { background: #2d4d2c; }
      }
    `;
    root.appendChild(style);

    const backdrop = document.createElement("div"); backdrop.className = "backdrop";
    const card = document.createElement("div"); card.className = "card";
    card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "true");

    const head = document.createElement("div"); head.className = "head";
    const title = document.createElement("div"); title.className = "title"; title.textContent = "Welcome to NurAi";
    const x = document.createElement("button"); x.className = "x"; x.textContent = "✕";
    x.setAttribute("aria-label", "Close"); x.addEventListener("click", close);
    head.append(title, x);

    const body = document.createElement("div"); body.className = "body";
    const p = document.createElement("p");
    p.textContent = "Sign in or create an account on the NurAi dashboard. After login, return here to use AI suggestions.";

    const loginBtn = document.createElement("button");
    loginBtn.className = "btn primary"; loginBtn.textContent = "Sign in / Sign up";
    loginBtn.addEventListener("click", openWeb);

    const pricingBtn = document.createElement("button");
    pricingBtn.className = "btn secondary"; pricingBtn.textContent = "View pricing";
    pricingBtn.addEventListener("click", () => {
      window.open(`${WEB_BASE}/pricing`, "_blank", "noopener,noreferrer");
    });

    const note = document.createElement("div"); note.className = "note";
    note.textContent = "We never read your private DMs.";
    body.append(p, loginBtn, pricingBtn, note);
    card.append(head, body);
    backdrop.appendChild(card);
    root.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", onEsc);
    function onEsc(e) { if (e.key === "Escape") close(); }
    function close() {
      document.removeEventListener("keydown", onEsc);
      host.remove();
      window.__NURAI_AUTH_OPEN__ = false;
    }
    async function openWeb() {
      const r = await chrome.storage.local.get("nurai_install_id");
      const installId = r.nurai_install_id || (crypto.randomUUID && crypto.randomUUID());
      const url = `${WEB_BASE}/auth/extension?install_id=${encodeURIComponent(installId)}&ext_id=${chrome.runtime.id}`;
      window.open(url, "_blank", "noopener,noreferrer");
      close();
    }
  }

  window.NurAiAuthOpen = open;
  open();
})();
