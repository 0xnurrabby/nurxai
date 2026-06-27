// contentscript.js — NurAi Suggestions panel (Shadow DOM, no innerHTML)
(function () {
  const HOST_ID = "nurai-suggestions-host";
  const POS_KEY = "nurai_panel_pos";
  const WEB_BASE = "https://www.nurxai.xyz";
  const RUN_ID = `${Date.now()}:${Math.random()}`;

  window.__NURAI_ACTIVE_RUN_ID = RUN_ID;
  document.getElementById(HOST_ID)?.remove();

  const isActiveRun = () => window.__NURAI_ACTIVE_RUN_ID === RUN_ID;

  const isVisible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const findDialog = () => {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isVisible);
    return dialogs.find(d => isVisible(d.querySelector('div[contenteditable="true"][data-testid="tweetTextarea_0"]')))
      || dialogs[dialogs.length - 1]
      || null;
  };
  const findComposer = () => {
    const dlg = findDialog();
    if (!dlg) return null;
    const c = dlg.querySelector('div[contenteditable="true"][data-testid="tweetTextarea_0"]');
    return isVisible(c) ? c : null;
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
    const quotedArticles = Array.from(article.querySelectorAll("article"));
    const isQuotedNode = (node) => quotedArticles.some(q => q.contains(node));

    const author = getArticleAuthor(article);
    if (author) parts.push("Author: " + author);

    // 1. Primary: lang-attributed divs (main tweet text)
    const mainText = collectLangText(article, d => !isQuotedNode(d));
    if (mainText) parts.push("Tweet text:\n" + mainText);

    const links = collectArticleLinks(article);
    if (links.length) parts.push("Links: " + links.join(", "));

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
    const quotedArticle = quotedArticles[0];
    if (quotedArticle) {
      const qAuthor = getArticleAuthor(quotedArticle);
      const qText = collectLangText(quotedArticle);
      if (qText && qText.length > 3) {
        parts.push("Quoted tweet" + (qAuthor ? " by " + qAuthor : "") + ":\n" + qText.slice(0, 500));
      }
    }

    // 4. Any spans with significant text not yet captured (fallback for edge cases)
    if (parts.length === 0) {
      const allText = article.innerText?.trim();
      if (allText) parts.push(allText.slice(0, 500));
    }

    const text = parts.join("\n").trim().slice(0, 1500);

    // Extract image URLs only from the active reply dialog. Reading document.body
    // can mix media from another feed post into the current generation.
    const isMediaUrl = (src) => {
      if (!src || !src.includes("twimg.com")) return false;
      const isTweetMedia = src.includes("/media/") || src.includes("/card_img/");
      return isTweetMedia &&
      !src.includes("profile_images") &&
      !src.includes("profile_banners") &&
      !src.includes("emoji") &&
      !src.includes("hashflags");
    };

    const normalizeImgSrc = (src) => {
      // Normalize to largest available size
      if (src.includes("&name=") || src.includes("?name=")) {
        return src.replace(/[?&]name=[^&]+/, match => match.replace(/name=[^&]+/, "name=large"));
      }
      if (src.includes("format=")) {
        return src.replace(/name=[^&]+/, "name=large");
      }
      return src;
    };

    const extractCssUrl = (value) => {
      const match = String(value || "").match(/url\(["']?([^"')]+)["']?\)/);
      return match?.[1] || "";
    };

    const collectImgs = (root) => {
      const direct = Array.from(root?.querySelectorAll('img[src*="twimg.com"], source[srcset*="twimg.com"]') || [])
        .flatMap(el => {
          const src = el.src || el.getAttribute("src") || "";
          const srcset = el.getAttribute("srcset") || "";
          return [src, ...srcset.split(",").map(part => part.trim().split(/\s+/)[0])];
        });

      const backgrounds = Array.from(root?.querySelectorAll('[style*="twimg.com"]') || [])
        .map(el => extractCssUrl(el.style.backgroundImage || el.getAttribute("style")));

      return [...direct, ...backgrounds]
        .filter(isMediaUrl)
        .map(normalizeImgSrc);
    };

    // 1. Try article first
    let rawImgs = collectImgs(article);

    // 2. Expand to full dialog if not enough
    if (rawImgs.length === 0) {
      rawImgs = collectImgs(dlg);
    }

    // 3. If X rendered media below/outside the reply dialog, only read from the
    // matching visible feed article. Never scan the full body, which can mix posts.
    if (rawImgs.length === 0) {
      rawImgs = collectImgs(findMatchingPageArticle(article, text));
    }

    // Deduplicate and limit
    const imageUrls = [...new Set(rawImgs)].slice(0, 4);

    return { text, imageUrls };
  }

  function normalizeVisibleText(text) {
    return String(text || "").replace(/\u200B/g, "").replace(/[ \t]+\n/g, "\n").trim();
  }

  function collectLangText(root, filter = () => true) {
    const seen = new Set();
    return Array.from(root?.querySelectorAll("div[lang]") || [])
      .filter(filter)
      .map(d => normalizeVisibleText(d.innerText))
      .filter(t => {
        if (!t || seen.has(t)) return false;
        seen.add(t);
        return true;
      })
      .join("\n\n");
  }

  function getArticleAuthor(article) {
    const userName = article?.querySelector('[data-testid="User-Name"]');
    if (!userName) return "";

    const handleLink = Array.from(userName.querySelectorAll('a[href^="/"]'))
      .map(a => (a.getAttribute("href") || "").split(/[?#]/)[0])
      .find(href => /^\/[A-Za-z0-9_]{1,15}$/.test(href));
    const handle = handleLink ? "@" + handleLink.slice(1) : "";

    const displayName = Array.from(userName.querySelectorAll("span"))
      .map(s => normalizeVisibleText(s.innerText || s.textContent))
      .find(t => t && !t.startsWith("@") && t !== handle.slice(1) && !/^\d+[smhd]$/.test(t));

    if (displayName && handle) return `${displayName} (${handle})`;
    return displayName || handle;
  }

  function collectArticleLinks(article) {
    const seen = new Set();
    return Array.from(article?.querySelectorAll("a[href]") || [])
      .map(a => a.href || a.getAttribute("href") || "")
      .map(href => href.split(/[?#]/)[0])
      .filter(href => {
        if (!href || seen.has(href)) return false;
        seen.add(href);
        return /^https?:\/\//.test(href) && !/\/photo\/\d+$|\/video\/\d+$/.test(href);
      })
      .slice(0, 4);
  }

  function findMatchingPageArticle(dialogArticle, contextText) {
    const dialog = findDialog();
    const context = normalizeVisibleText(contextText);
    const anchors = context.split("\n")
      .map(s => s.replace(/^(Author|Tweet text|Links|Quoted tweet[^:]*):\s*/i, "").trim())
      .filter(s => s.length >= 18)
      .map(s => s.replace(/\s+/g, " ").slice(0, 80));

    return Array.from(document.querySelectorAll("article"))
      .filter(a => a !== dialogArticle && !dialog?.contains(a) && isVisible(a))
      .find(a => {
        const body = normalizeVisibleText(a.innerText).replace(/\s+/g, " ");
        return anchors.some(anchor => body.includes(anchor));
      }) || null;
  }

  function contextKeyFor(text, imageUrls = []) {
    const normalizedText = normalizeVisibleText(text).replace(/\s+/g, " ").toLowerCase();
    if (!normalizedText && !imageUrls.length) return "";
    const src = normalizedText + "|" + imageUrls.join("|");

    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    }
    return src.length + ":" + Math.abs(hash).toString(36);
  }


  let host, shadow, panel, listEl, statusBar;
  let liveSummaryTimer = 0;
  let liveSummaryInFlight = false;
  let statusState = {
    hasImage: false,
    imageUsed: false,
    searchUsed: false,
    notificationUnread: 0,
    chatUnread: 0,
    liveLoading: true
  };

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
    // Invalidate any in-flight generation so its result isn't shown on the next post.
    generationId++;
    inflight = false;
    lastSuggestions = [];
    activeContextKey = "";
    lastContextKey = "";
    if (generationTimer) {
      clearTimeout(generationTimer);
      generationTimer = 0;
    }
    if (liveSummaryTimer) {
      clearInterval(liveSummaryTimer);
      liveSummaryTimer = 0;
    }
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
  function renderGenerationStatusBarLegacy(state) {
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

  function mergeStatusState(next = {}) {
    statusState = { ...statusState, ...next };
    renderStatusBar();
  }

  function renderStatusBar(nextState = null) {
    if (nextState) statusState = { ...statusState, ...nextState };
    if (!statusBar) return;
    statusBar.replaceChildren();

    const state = statusState;
    const unreadLabel = (count) => count > 99 ? "99+" : String(count);
    const statusButton = (label, className, title) => {
      const button = el("button", {
        class: `status-icon ${className}`,
        title,
        type: "button"
      }, label);
      button.addEventListener("mousedown", (event) => event.stopPropagation());
      button.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
      return button;
    };

    statusBar.appendChild(statusButton(
      "▣",
      state.hasImage === false ? "status-na" :
      state.imageUsed === true ? "status-on" :
      state.imageUsed === false ? "status-off" : "status-pending",
      state.hasImage === false ? "No image in post" :
      state.imageUsed === true ? "Image scanned" :
      state.imageUsed === false ? "Image scan failed" : "Scanning image..."
    ));

    statusBar.appendChild(statusButton(
      "🔍",
      state.searchUsed === true ? "status-on" :
      state.searchUsed === false ? "status-off" : "status-pending",
      state.searchUsed === true ? "Web search used" :
      state.searchUsed === false ? "Web search not used" : "Searching web..."
    ));

    const notificationIcon = statusButton(
      "🔔",
      `live-status-icon ${state.notificationUnread > 0 ? "status-alert" : "status-idle"}`,
      state.notificationUnread > 0 ? `${state.notificationUnread} unread dashboard notifications` : "No unread dashboard notifications"
    );
    notificationIcon.setAttribute("aria-label", "Open dashboard notifications");
    if (state.notificationUnread > 0) notificationIcon.appendChild(el("strong", { class: "badge" }, unreadLabel(state.notificationUnread)));
    notificationIcon.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: "NURAI_OPEN_DASHBOARD", section: "notifications" });
    });
    statusBar.appendChild(notificationIcon);

    const chatIcon = statusButton(
      "🌐",
      `live-status-icon ${state.chatUnread > 0 ? "status-alert" : "status-idle"}`,
      state.chatUnread > 0 ? `${state.chatUnread} unread global chat messages` : "No unread global chat messages"
    );
    chatIcon.setAttribute("aria-label", "Open global chat");
    if (state.chatUnread > 0) chatIcon.appendChild(el("strong", { class: "badge" }, unreadLabel(state.chatUnread)));
    chatIcon.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: "NURAI_OPEN_DASHBOARD", section: "chat" });
    });
    statusBar.appendChild(chatIcon);
  }

  async function fetchLiveSummary() {
    if (!isActiveRun() || liveSummaryInFlight) return;
    liveSummaryInFlight = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "NURAI_LIVE_SUMMARY" });
      if (!isActiveRun()) return;
      if (resp?.ok) {
        mergeStatusState({
          notificationUnread: Number(resp.notificationUnread || 0),
          chatUnread: Number(resp.chatUnread || 0),
          liveLoading: false
        });
      } else {
        mergeStatusState({ liveLoading: false });
      }
    } catch {
      mergeStatusState({ liveLoading: false });
    } finally {
      liveSummaryInFlight = false;
    }
  }

  function startLiveSummaryPolling() {
    if (liveSummaryTimer) return;
    fetchLiveSummary();
    liveSummaryTimer = setInterval(fetchLiveSummary, 5000);
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

    // Left: brand + extension version
    const brand = el("div", { class: "brand" });
    brand.appendChild(el("span", { class: "title" }, "NurAi"));
    brand.appendChild(el("span", { class: "version" }, `v${chrome.runtime.getManifest().version}`));
    head.appendChild(brand);

    // Center: status bar
    statusBar = el("div", { class: "status-bar" });
    head.appendChild(statusBar);
    renderStatusBar();
    startLiveSummaryPolling();

    // Right: action buttons
    const actions = el("div", { class: "actions" });
    const refreshBtn = el("button", { class: "icon", title: "Regenerate", "aria-label": "Regenerate" }, "↻");
    refreshBtn.addEventListener("click", () => { if (isActiveRun()) generateAndShow(true); });
    const closeBtn = el("button", { class: "icon", title: "Close", "aria-label": "Close" }, "✕");
    closeBtn.addEventListener("click", () => { if (isActiveRun()) removePanel(); });
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
    const text = el("span", { class: "loader-text" }, "Generating replies...");
    wrap.append(
      el("div", { class: "dot" }), el("div", { class: "dot" }), el("div", { class: "dot" }),
      text
    );
    listEl.appendChild(wrap);

    const steps = [
      "Checking tweet context...",
      "Grounding the reply...",
      "Writing options..."
    ];
    let index = 0;
    const timer = window.setInterval(() => {
      if (!wrap.isConnected) {
        window.clearInterval(timer);
        return;
      }
      text.textContent = steps[index % steps.length];
      index++;
    }, 1600);
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
    } else if (action === "update") {
      const b = el("button", { class: "primary-btn" }, "Update extension");
      b.addEventListener("click", () => chrome.runtime.sendMessage({ type: "NURAI_OPEN_EXTENSION_UPDATE" }));
      box.appendChild(b);
    }
    listEl.appendChild(box);
  }

  function showSuggestions(list, usedStatus) {
    if (!listEl) return;
    listEl.replaceChildren();

    list.forEach((rawText, idx) => {
      const text = cleanSuggestionText(rawText);
      if (!text) return;

      const item = el("div", { class: "item", role: "listitem" });
      item.appendChild(el("div", { class: "item-text" }, text));
      const useBtn = el("button", { class: "use", "aria-label": "Use this reply" }, "Use");
      useBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isActiveRun()) return;
        if (useBtn.dataset.pasting === "1") return;
        useBtn.dataset.pasting = "1";
        useBtn.disabled = true;
        const pasted = await pasteIntoComposer(text);
        useBtn.disabled = false;
        useBtn.dataset.pasting = "";
        if (!pasted) {
          useBtn.textContent = "Retry";
          return;
        }
        useBtn.classList.add("used");
        useBtn.textContent = "Used";
        window.setTimeout(() => {
          if (!useBtn.isConnected) return;
          useBtn.classList.remove("used");
          useBtn.textContent = "Use";
        }, 1200);
      });
      item.appendChild(useBtn);
      listEl.appendChild(item);
    });
  }

  function cleanSuggestionText(text) {
    const strip = (line) => line.trim().replace(/^["“”]+|["“”]+$/g, "");
    return String(text || "").replace(/\r\n?/g, "\n").split("\n").map(strip).join("\n").trim();
  }

  let lastPasteKey = "";
  let lastPasteAt = 0;
  const PASTE_LOCK_MS = 350;

  async function pasteIntoComposer(text) {
    if (!isActiveRun()) return false;
    const c = findComposer();
    if (!c) return false;
    c.focus();

    const pasteText = cleanSuggestionText(text);
    if (!pasteText) return false;

    const pasteKey = activeContextKey + "|" + pasteText;
    const now = Date.now();
    if (isDuplicatePaste(pasteKey, now)) return false;
    rememberPaste(pasteKey, now);

    return replaceComposerText(c, pasteText);
  }

  function isDuplicatePaste(pasteKey, now) {
    if (pasteKey === lastPasteKey && now - lastPasteAt < PASTE_LOCK_MS) return true;
    if (window.__NURAI_LAST_PASTE_KEY === pasteKey && now - (window.__NURAI_LAST_PASTE_AT || 0) < PASTE_LOCK_MS) return true;
    return false;
  }

  function rememberPaste(pasteKey, now) {
    lastPasteKey = pasteKey;
    lastPasteAt = now;
    window.__NURAI_LAST_PASTE_KEY = pasteKey;
    window.__NURAI_LAST_PASTE_AT = now;
  }

  async function replaceComposerText(target, text) {
    return forceComposerText(target, text, "initial");
  }

  async function forceComposerText(target, text, reason = "retry") {
    const composer = target || findComposer();
    if (!composer || !isActiveRun()) return false;

    const wanted = normalizeComposerText(text);
    activateComposer(composer);
    selectComposerContents(composer);

    const inserted = await insertNativeText(composer, wanted);
    console.debug?.("[NurAi] composer text inserted", reason);

    return inserted || getComposerText(composer) === wanted;
  }

  function normalizeComposerText(text) {
    return String(text || "")
      .replace(/\u200B/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/^\s*Post your reply\s*/i, "")
      .trim();
  }

  function getComposerText(composer) {
    const textSpans = Array.from(composer?.querySelectorAll?.('span[data-text="true"]') || [])
      .map(span => span.textContent || "")
      .join("\n")
      .trim();
    return normalizeComposerText(textSpans || composer?.innerText || composer?.textContent || "");
  }

  function activateComposer(composer) {
    try {
      composer.scrollIntoView({ block: "center", inline: "nearest" });
    } catch {}

    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      const EventCtor = type === "pointerdown" && window.PointerEvent ? PointerEvent : MouseEvent;
      composer.dispatchEvent(new EventCtor(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      }));
    }

    try {
      composer.focus({ preventScroll: true });
    } catch {
      composer.focus();
    }
  }

  async function insertNativeText(composer, text) {
    if (!await setVerifiedClipboardText(text)) return false;

    activateComposer(composer);
    selectComposerContents(composer);
    document.execCommand("paste");
    return waitForComposerText(composer, text);
  }

  async function setVerifiedClipboardText(text) {
    if (await writeTextToClipboard(text) && await clipboardTextMatches(text)) return true;
    if (copyTextWithHiddenTextarea(text) && await clipboardTextMatches(text)) return true;
    return false;
  }

  async function writeTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyTextWithHiddenTextarea(text);
    }
  }

  function copyTextWithHiddenTextarea(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    document.documentElement.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    textarea.remove();
    return ok;
  }

  async function clipboardTextMatches(text) {
    const wanted = normalizeComposerText(text);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const current = await navigator.clipboard.readText();
        if (normalizeComposerText(current) === wanted) return true;
      } catch {
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    return false;
  }

  async function waitForComposerText(composer, expected) {
    const wanted = normalizeComposerText(expected);
    for (let attempt = 0; attempt < 8; attempt++) {
      if (getComposerText(composer) === wanted) return true;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return false;
  }

  function selectComposerContents(target) {
    target.focus();
    try {
      document.execCommand("selectAll");
    } catch {}
    const sel = window.getSelection();
    if (selectionWithin(sel, target)) return;
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(target);
    sel.addRange(range);
  }

  function selectionWithin(sel, target) {
    if (!sel?.rangeCount) return false;
    const common = sel.getRangeAt(0).commonAncestorContainer;
    return common === target || target.contains(common);
  }

  let lastSuggestions = [];
  let inflight = false;
  let generationId = 0; // increments every new generation; stale results are discarded
  let activeContextKey = "";
  let lastContextKey = "";
  let generationTimer = 0;

  async function generateAndShow(force = false) {
    if (!isActiveRun()) return;
    const { text, imageUrls } = getTweetContext();
    const contextKey = contextKeyFor(text, imageUrls);
    let regenerate = !!force;

    if (contextKey && activeContextKey !== contextKey) {
      activeContextKey = contextKey;
      lastContextKey = contextKey;
      lastSuggestions = [];
      inflight = false;
      regenerate = false;
      generationId++;
    }

    if (inflight && !force) return;
    inflight = true;

    // Claim this generation slot. If removePanel() is called while we're
    // waiting for the API, it increments generationId, making our myId stale.
    const myId = ++generationId;
    const requestContextKey = contextKey;

    await buildPanelShell();
    showLoader();

    const hasImage = imageUrls.length > 0;

    renderStatusBar({
      hasImage: hasImage || null,
      imageUsed: hasImage ? null : false,
      searchUsed: null
    });

    try {
      if (!text) { showError("No tweet context found."); return; }

      const isRegenerate = regenerate && lastSuggestions.length > 0 && activeContextKey === requestContextKey;

      const resp = await chrome.runtime.sendMessage({
        type: "NURAI_GENERATE",
        context: text,
        imageUrls,
        regenerate: isRegenerate,
        previousSuggestions: isRegenerate ? lastSuggestions : []
      });

      // If the user already closed this dialog and opened another post,
      // generationId will have been incremented — discard this stale result.
      if (myId !== generationId) return;
      if (requestContextKey && activeContextKey !== requestContextKey) return;

      const latest = getTweetContext();
      if (requestContextKey && contextKeyFor(latest.text, latest.imageUrls) !== requestContextKey) return;

      if (!resp || !resp.ok) {
        const updateMessage = resp?.message || (
          resp?.requiredVersion
            ? `Please update NurAi extension to v${resp.requiredVersion} or newer.`
            : "Please update NurAi extension to keep using suggestions."
        );
        const map = {
          NOT_LOGGED_IN:    ["Please sign in to use NurAi.", "login"],
          SESSION_EXPIRED:  ["Session expired. Please sign in again.", "login"],
          NEEDS_RECONNECT:  ["Reconnect NurAi to refresh your subscription.", "login"],
          NO_SUBSCRIPTION:  ["No active subscription. Pick a plan to continue.", "pricing"],
          QUOTA_EXCEEDED:   ["Daily quota reached. Upgrade for more.", "pricing"],
          RATE_LIMIT_LOCAL: ["Slow down — please wait a moment.", null],
          NETWORK:          ["Network error. Check your connection.", null],
          EMPTY_CONTEXT:    ["No tweet context found.", null],
          BAD_RESPONSE:     ["Server returned an unexpected response.", null],
          UPSTREAM:         ["AI service error. Try again in a moment.", null],
          EMPTY_SUGGESTIONS:["No good suggestions returned. Try again.", null],
          EXTENSION_UPDATE_REQUIRED: [updateMessage, "update"]
        };
        const [m, action] = map[resp?.error] || ["Could not generate suggestions.", null];
        showError(m, action);
        renderStatusBar({ hasImage, imageUsed: false, searchUsed: false });
        return;
      }

      if (!resp.suggestions?.length) { showError("No suggestions returned."); return; }

      lastSuggestions = resp.suggestions.slice();

      renderStatusBar({
        hasImage,
        imageUsed: resp.visionUsed === true ? true : false,
        searchUsed: resp.searchUsed === true ? true : false
      });

      showSuggestions(resp.suggestions);
    } catch {
      if (myId !== generationId) return; // stale, ignore
      showError("Unexpected error.");
      renderStatusBar({ hasImage: false, imageUsed: false, searchUsed: false });
    } finally {
      if (myId === generationId) inflight = false;
    }
  }


  let lastHad = false;
  function scheduleGenerate(force = false) {
    if (!isActiveRun()) return;
    if (generationTimer) clearTimeout(generationTimer);
    generationTimer = setTimeout(() => {
      if (!isActiveRun()) return;
      generationTimer = 0;
      generateAndShow(force);
    }, 150);
  }

  const obs = new MutationObserver(() => {
    if (!isActiveRun()) {
      obs.disconnect();
      return;
    }
    const has = !!findComposer();
    if (has) {
      const { text, imageUrls } = getTweetContext();
      const contextKey = contextKeyFor(text, imageUrls);
      if (contextKey && (!lastHad || contextKey !== lastContextKey)) {
        lastContextKey = contextKey;
        activeContextKey = contextKey;
        lastSuggestions = [];
        inflight = false;
        generationId++;
        if (panel && listEl) showLoader();
        scheduleGenerate();
      }
    }
    if (!has && lastHad) removePanel();
    lastHad = has;
  });
  obs.observe(document.body, { subtree: true, childList: true });

  document.addEventListener("keydown", (e) => { if (isActiveRun() && e.key === "Escape") removePanel(); });
  if (findComposer()) scheduleGenerate();

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
    .brand {
      display: grid; gap: 1px; flex: 0 0 auto; min-width: 70px;
      line-height: 1.05;
    }
    .title { font-weight: 800; font-size: 14px; letter-spacing: .3px; }
    .version { font-size: 9px; font-weight: 800; color: #536471; }

    /* ── Status bar ── */
    .status-bar {
      display: flex; align-items: center; gap: 6px; flex: 1 1 auto;
      justify-content: center; min-width: 144px;
    }
    .status-icon {
      position: relative;
      font-size: 14px; line-height: 1;
      width: 26px; height: 26px;
      border-radius: 6px; border: 2px solid transparent;
      display: grid; place-items: center;
      transition: transform .18s ease, background .18s ease, border-color .18s ease, opacity .18s ease;
      cursor: default; padding: 0; color: #0f1419;
    }
    button.status-icon { cursor: pointer; font: inherit; }
    button.status-icon:hover { transform: translateY(-1px); }
    .status-pending { border-color: #ccc; opacity: .45; }
    .status-on      { border-color: #22c55e; background: #dcfce7; }
    .status-off     { border-color: #ef4444; background: #fee2e2; opacity: .7; }
    .status-na      { border-color: #d1d5db; background: #f3f4f6; opacity: .35; }
    .status-idle    { border-color: #0f1419; background: #ffffff; }
    .status-alert   { border-color: #ef4444; background: #ffd1dc; animation: alertPulse 1.15s ease-in-out infinite; }
    .badge {
      position: absolute; right: -8px; top: -8px;
      min-width: 16px; height: 16px; padding: 0 4px;
      border-radius: 999px; border: 1.5px solid #0f1419;
      background: #ef4444; color: #fff;
      font-size: 9px; line-height: 14px; font-weight: 900;
    }
    @keyframes alertPulse { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.08); } }

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
    .use.used { background: #86efac; border-color: #22c55e; color: #15803d; cursor: pointer; opacity: 1; }
    .use:disabled { background: #86efac; border-color: #22c55e; color: #15803d; cursor: default; opacity: 1; }
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
      .status-idle { background: #2a2a2a; color: #f3f3f5; border-color: #f3f3f5; }
      .status-alert { background: #7f1d1d; color: #f3f3f5; }
      .badge { border-color: #f3f3f5; }
    }
  `;
})();
