// contentscript.js — NurAi Suggestions panel (Shadow DOM, no innerHTML)
(function () {
  const HOST_ID = "nurai-suggestions-host";
  const POS_KEY = "nurai_panel_pos";
  const WEB_BASE = "https://www.nurxai.xyz";

  const findDialog = () => document.querySelector('div[role="dialog"]');
  const findComposer = () => {
    const dlg = findDialog();
    if (!dlg) return null;
    const c = dlg.querySelector('div[contenteditable="true"][data-testid="tweetTextarea_0"]');
    return c && c.offsetParent ? c : null;
  };

  /**
   * Extract tweet text + image URLs from the reply dialog.
   *
   * Twitter DOM structures we handle:
   * 1. Normal tweet: <article> → <div lang="..."> contains the text
   * 2. X Article card: <article> has a card with title/description in <span> / <div>
   * 3. Link preview card: card2 / card-name sections inside article
   * 4. Quoted tweet: nested article or blockquote
   * 5. Image-only tweets: only images, minimal text
   */
  function getTweetContext() {
    const dlg = findDialog();
    const article = dlg?.querySelector("article");
    if (!article) return { text: "", imageUrls: [] };

    const parts = [];

    // 1. Primary: lang-attributed divs (main tweet text)
    const langDivs = Array.from(article.querySelectorAll("div[lang]"));
    if (langDivs.length) {
      parts.push(langDivs.map(d => d.innerText.trim()).filter(Boolean).join("\n"));
    }

    // 2. X Article cards / link preview cards
    // These use data-testid="card.wrapper" or contain <span> with article title
    const cardWrapper = article.querySelector('[data-testid="card.wrapper"]');
    if (cardWrapper) {
      // Grab any visible text inside the card that isn't already captured
      const cardSpans = Array.from(cardWrapper.querySelectorAll("span, div"))
        .map(el => el.innerText?.trim())
        .filter(t => t && t.length > 5 && t.length < 300);
      // Deduplicate and take meaningful ones
      const seen = new Set();
      const cardText = cardSpans.filter(t => {
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      }).join(" | ");
      if (cardText) parts.push("[Card: " + cardText + "]");
    }

    // 3. Quoted tweet text (nested article or blockquote)
    const quotedArticle = article.querySelector("article article, [role='blockquote'] div[lang]");
    if (quotedArticle) {
      const qText = quotedArticle.innerText?.trim();
      if (qText && qText.length > 3) parts.push("[Quoted: " + qText.slice(0, 300) + "]");
    }

    // 4. Any spans with significant text not yet captured (fallback for edge cases)
    if (parts.length === 0) {
      const allText = article.innerText?.trim();
      if (allText) parts.push(allText.slice(0, 500));
    }

    const text = parts.join("\n").trim().slice(0, 1500);

    // Extract image URLs (skip avatars and emoji CDN images)
    const imgs = Array.from(article.querySelectorAll('img[src*="twimg.com"]'));
    const imageUrls = imgs
      .map(img => img.src)
      .filter(src =>
        !src.includes("profile_images") &&
        !src.includes("emoji") &&
        !src.includes("hashflags") &&
        !src.includes("profile_banners")
      )
      .map(src => src.replace(/&name=\w+/, "&name=large"))
      .filter((src, i, arr) => arr.indexOf(src) === i) // deduplicate
      .slice(0, 4);

    return { text, imageUrls };
  }


  let host, shadow, panel, listEl, statusBar;

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.getElementById(HOST_ID);
    if (host) { shadow = host.shadowRoot; return; }
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "closed" });
    const css = document.createElement("style");
    css.textContent = STYLES;
    shadow.appendChild(css);
  }

  function removePanel() {
    if (panel) { panel.remove(); panel = null; listEl = null; statusBar = null; }
  }
  async function loadPos() {
    const r = await chrome.storage.local.get(POS_KEY);
    return r[POS_KEY] || null;
  }
  async function savePos(left, top) {
    await chrome.storage.local.set({ [POS_KEY]: { left, top } });
  }
  function bound(left, top, w, h) {
    return {
      left: Math.max(6, Math.min(window.innerWidth - w - 6, left)),
      top:  Math.max(6, Math.min(window.innerHeight - h - 6, top))
    };
  }
  function makeDraggable(el, handle) {
    let sx=0, sy=0, ox=0, oy=0, dragging=false;
    const down = (e) => {
      dragging = true;
      sx = e.clientX ?? e.touches?.[0]?.clientX;
      sy = e.clientY ?? e.touches?.[0]?.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      e.preventDefault?.();
    };
    const move = (e) => {
      if (!dragging) return;
      const cx = e.clientX ?? e.touches?.[0]?.clientX;
      const cy = e.clientY ?? e.touches?.[0]?.clientY;
      const b = bound(ox + cx - sx, oy + cy - sy, el.offsetWidth, el.offsetHeight);
      el.style.left = b.left + "px"; el.style.top = b.top + "px";
      el.style.right = "auto"; el.style.bottom = "auto";
    };
    const up = () => {
      if (!dragging) return; dragging = false;
      const r = el.getBoundingClientRect(); savePos(r.left, r.top);
    };
    handle.addEventListener("mousedown", down);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    handle.addEventListener("touchstart", down, { passive: false });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", up);
  }
  function el(tag, attrs = {}, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("aria-") || k === "role" || k === "title") n.setAttribute(k, v);
      else n[k] = v;
    }
    if (text != null) n.textContent = text;
    return n;
  }

  // ── Status bar helpers ───────────────────────────────────────────────────────
  /**
   * Render status icons in the header status bar.
   * state = { hasImage: bool, imageUsed: bool|null, searchUsed: bool|null }
   * null = pending/not applicable, true = used/active, false = not used/failed
   */
  function renderStatusBar(state) {
    if (!statusBar) return;
    statusBar.replaceChildren();

    // Image icon
    const imgIcon = el("span", {
      class: "status-icon " + (
        state.hasImage === false ? "status-na" :
        state.imageUsed === true ? "status-on" :
        state.imageUsed === false ? "status-off" : "status-pending"
      ),
      title: state.hasImage === false ? "No image in post" :
             state.imageUsed === true ? "Image scanned" :
             state.imageUsed === false ? "Image scan failed" : "Scanning image..."
    }, "🖼");
    statusBar.appendChild(imgIcon);

    // Web search icon
    const searchIcon = el("span", {
      class: "status-icon " + (
        state.searchUsed === true ? "status-on" :
        state.searchUsed === false ? "status-off" : "status-pending"
      ),
      title: state.searchUsed === true ? "Web search used" :
             state.searchUsed === false ? "Web search not used" : "Searching web..."
    }, "🔍");
    statusBar.appendChild(searchIcon);
  }

  async function buildPanelShell() {
    ensureHost();
    if (panel && shadow.contains(panel)) return panel;
    panel = el("div", { class: "panel", role: "complementary", "aria-label": "NurAi suggestions" });

    const pos = await loadPos();
    if (pos) {
      const b = bound(pos.left, pos.top, 420, 360);
      panel.style.left = b.left + "px"; panel.style.top = b.top + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
    } else {
      panel.style.right = "20px"; panel.style.bottom = "20px";
    }

    const head = el("div", { class: "head" });

    // Left: title
    head.appendChild(el("span", { class: "title" }, "NurAi"));

    // Center: status bar
    statusBar = el("div", { class: "status-bar" });
    head.appendChild(statusBar);

    // Right: action buttons
    const actions = el("div", { class: "actions" });
    const refreshBtn = el("button", { class: "icon", title: "Regenerate", "aria-label": "Regenerate" }, "↻");
    refreshBtn.addEventListener("click", () => generateAndShow(true));
    const closeBtn = el("button", { class: "icon", title: "Close", "aria-label": "Close" }, "✕");
    closeBtn.addEventListener("click", removePanel);
    actions.append(refreshBtn, closeBtn);
    head.appendChild(actions);

    panel.appendChild(head);
    makeDraggable(panel, head);

    listEl = el("div", { class: "list", role: "list" });
    panel.appendChild(listEl);
    shadow.appendChild(panel);
    return panel;
  }

  function showLoader() {
    if (!listEl) return;
    listEl.replaceChildren();
    const wrap = el("div", { class: "loader" });
    wrap.append(
      el("div", { class: "dot" }), el("div", { class: "dot" }), el("div", { class: "dot" }),
      el("span", { class: "loader-text" }, "Generating replies…")
    );
    listEl.appendChild(wrap);
  }

  function showError(msg, action = null) {
    if (!listEl) return;
    listEl.replaceChildren();
    const box = el("div", { class: "error" });
    box.appendChild(el("div", { class: "error-msg" }, msg));
    if (action === "login") {
      const b = el("button", { class: "primary-btn" }, "Sign in");
      b.addEventListener("click", () => chrome.runtime.sendMessage({ type: "NURAI_OPEN_LOGIN" }));
      box.appendChild(b);
    } else if (action === "pricing") {
      const b = el("button", { class: "primary-btn" }, "View plans");
      b.addEventListener("click", () => chrome.runtime.sendMessage({ type: "NURAI_OPEN_PRICING" }));
      box.appendChild(b);
    }
    listEl.appendChild(box);
  }

  function showSuggestions(list, usedStatus) {
    if (!listEl) return;
    listEl.replaceChildren();

    // Track which suggestions have been used (for status coloring)
    const usedSet = new Set();

    list.forEach((text, idx) => {
      const item = el("div", { class: "item", role: "listitem" });
      item.appendChild(el("div", { class: "item-text" }, text));
      const useBtn = el("button", { class: "use", "aria-label": "Use this reply" }, "Use");
      useBtn.addEventListener("click", () => {
        pasteIntoComposer(text);
        // Mark as used
        usedSet.add(idx);
        useBtn.classList.add("used");
        useBtn.textContent = "Used";
      });
      item.appendChild(useBtn);
      listEl.appendChild(item);
    });
  }

  function pasteIntoComposer(text) {
    const c = findComposer();
    if (!c) return;
    c.focus();
    const range = document.createRange();
    range.selectNodeContents(c);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    document.execCommand("insertText", false, text);
    c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  let lastSuggestions = [];
  let inflight = false;
  async function generateAndShow(force = false) {
    if (inflight && !force) return;
    inflight = true;
    await buildPanelShell();
    showLoader();

    const { text, imageUrls } = getTweetContext();
    const hasImage = imageUrls.length > 0;

    // Show initial status - pending
    renderStatusBar({
      hasImage: hasImage || null,
      imageUsed: hasImage ? null : false,
      searchUsed: null
    });

    try {
      if (!text) { showError("No tweet context found."); return; }

      const isRegenerate = !!force && lastSuggestions.length > 0;

      const resp = await chrome.runtime.sendMessage({
        type: "NURAI_GENERATE",
        context: text,
        imageUrls,
        regenerate: isRegenerate,
        previousSuggestions: isRegenerate ? lastSuggestions : []
      });

      if (!resp || !resp.ok) {
        const map = {
          NOT_LOGGED_IN:    ["Please sign in to use NurAi.", "login"],
          SESSION_EXPIRED:  ["Session expired. Please sign in again.", "login"],
          NO_SUBSCRIPTION:  ["No active subscription. Pick a plan to continue.", "pricing"],
          QUOTA_EXCEEDED:   ["Daily quota reached. Upgrade for more.", "pricing"],
          RATE_LIMIT_LOCAL: ["Slow down — please wait a moment.", null],
          NETWORK:          ["Network error. Check your connection.", null],
          EMPTY_CONTEXT:    ["No tweet context found.", null],
          BAD_RESPONSE:     ["Server returned an unexpected response.", null]
        };
        const [m, action] = map[resp?.error] || ["Could not generate suggestions.", null];
        showError(m, action);
        // Update status to failed
        renderStatusBar({ hasImage, imageUsed: false, searchUsed: false });
        return;
      }

      if (!resp.suggestions?.length) { showError("No suggestions returned."); return; }

      lastSuggestions = resp.suggestions.slice();

      // Update status bar with final state from server response
      renderStatusBar({
        hasImage,
        imageUsed: resp.visionUsed === true ? true : false,
        searchUsed: resp.searchUsed === true ? true : false
      });

      showSuggestions(resp.suggestions);
    } catch {
      showError("Unexpected error.");
      renderStatusBar({ hasImage: false, imageUsed: false, searchUsed: false });
    } finally {
      inflight = false;
    }
  }


  let lastHad = false;
  const obs = new MutationObserver(() => {
    const has = !!findComposer();
    if (has && !lastHad) generateAndShow();
    if (!has && lastHad) removePanel();
    lastHad = has;
  });
  obs.observe(document.body, { subtree: true, childList: true });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") removePanel(); });
  if (findComposer()) generateAndShow();

  const STYLES = `
    :host, * { box-sizing: border-box; }
    .panel {
      position: fixed; width: 420px; max-width: calc(100vw - 24px);
      max-height: 64vh; pointer-events: auto; overflow: hidden;
      display: flex; flex-direction: column;
      background: #ffffff; color: #0f1419;
      border: 2px solid #0f1419; border-radius: 14px;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: in .18s ease-out;
    }
    @keyframes in { from {opacity:0; transform: translateY(8px)} to {opacity:1; transform:none} }
    .head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; cursor: move; user-select: none;
      background: #fff89c; border-bottom: 2px solid #0f1419;
      gap: 8px;
    }
    .title { font-weight: 800; font-size: 14px; letter-spacing: .3px; flex-shrink: 0; }

    /* ── Status bar ── */
    .status-bar {
      display: flex; align-items: center; gap: 6px; flex: 1;
      justify-content: center;
    }
    .status-icon {
      font-size: 14px; line-height: 1;
      width: 26px; height: 26px;
      border-radius: 6px; border: 2px solid transparent;
      display: grid; place-items: center;
      transition: all .2s;
      cursor: default;
    }
    .status-pending { border-color: #ccc; opacity: .45; }
    .status-on      { border-color: #22c55e; background: #dcfce7; }
    .status-off     { border-color: #ef4444; background: #fee2e2; opacity: .7; }
    .status-na      { border-color: #d1d5db; background: #f3f4f6; opacity: .35; }

    .actions { display: flex; gap: 6px; flex-shrink: 0; }
    .icon {
      width: 28px; height: 28px; border-radius: 8px;
      border: 2px solid #0f1419; background: #fff; cursor: pointer;
      font-size: 13px; display: grid; place-items: center; font-weight: 800;
    }
    .icon:hover { background: #f1f5f9; }
    .list { padding: 12px; overflow-y: auto; display: grid; gap: 10px; }
    .item {
      position: relative; padding: 12px 86px 12px 14px;
      background: #ffffff; border: 2px solid #0f1419;
      border-radius: 10px; line-height: 1.45;
    }
    .item:hover { background: #f8fafc; }
    .item-text { white-space: pre-wrap; word-break: break-word; }
    .use {
      position: absolute; top: 10px; right: 10px;
      padding: 6px 14px; border-radius: 999px;
      border: 2px solid #0f1419; background: #c4f0c2;
      font-weight: 800; font-size: 12px; cursor: pointer;
      transition: background .15s;
    }
    .use:hover { background: #aee4ac; }
    .use.used { background: #86efac; border-color: #22c55e; color: #15803d; cursor: default; }
    .loader { display:flex; align-items:center; gap:8px; padding: 16px; }
    .dot { width:8px; height:8px; border-radius:50%; background:#0f1419; animation: bounce 1s infinite; }
    .dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
    @keyframes bounce { 0%,80%,100%{transform:scale(.6);opacity:.5} 40%{transform:scale(1);opacity:1} }
    .loader-text { font-size:13px; margin-left: 6px; font-weight:600; }
    .error { padding: 16px; text-align: center; }
    .error-msg { margin-bottom: 12px; font-weight: 600; }
    .primary-btn {
      padding: 9px 16px; border-radius: 8px; border: 2px solid #0f1419;
      background: #b8e1ff; font-weight: 800; cursor: pointer;
    }
    .primary-btn:hover { background: #9dd0f5; }

    @media (prefers-color-scheme: dark) {
      .panel { background: #1a1a1a; color: #f3f3f5; border-color: #f3f3f5; }
      .head { background: #4a4a1a; border-bottom-color: #f3f3f5; }
      .icon { background: #2a2a2a; border-color: #f3f3f5; color: #f3f3f5; }
      .icon:hover { background: #3a3a3a; }
      .item { background: #222; border-color: #f3f3f5; color: #f3f3f5; }
      .item:hover { background: #2a2a2a; }
      .use { background: #2d4d2c; border-color: #f3f3f5; color: #f3f3f5; }
      .use:hover { background: #3d5d3c; }
      .use.used { background: #166534; border-color: #22c55e; color: #86efac; }
      .dot { background: #f3f3f5; }
      .primary-btn { background: #1e3a52; border-color: #f3f3f5; color: #f3f3f5; }
      .primary-btn:hover { background: #2e4a62; }
      .status-on  { background: #14532d; }
      .status-off { background: #450a0a; }
      .status-na  { background: #1f2937; }
    }
  `;
})();
