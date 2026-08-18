(() => {
  const ALLOWED_TYPES = new Set(["NURAI_PAYG_STATUS", "NURAI_OPEN_PAYG_SETUP"]);

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      message?.source !== "nurai-dashboard" ||
      typeof message.requestId !== "string" ||
      !ALLOWED_TYPES.has(message.type)
    ) return;

    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: message.type });
    } catch {
      response = { ok: false, error: "EXTENSION_UNAVAILABLE" };
    }
    window.postMessage({
      source: "nurai-extension",
      type: "NURAI_DASHBOARD_RESPONSE",
      requestId: message.requestId,
      response
    }, window.location.origin);
  });
})();
