import { createPaygPayment } from "./payg-wallet.bundle.js";

const signerNonce = new URLSearchParams(location.search).get("nonce");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "payg-offscreen" || message.type !== "NURAI_PAYG_SIGN") return false;
  if (sender.id !== chrome.runtime.id || sender.tab || !signerNonce || message.signerNonce !== signerNonce) {
    sendResponse({ ok: false, error: "FORBIDDEN" });
    return false;
  }

  createPaygPayment(
    message.paymentRequired,
    message.operationId,
    message.expectedPayTo,
    message.expectedAmount,
    message.expectedPayer
  )
    .then((paymentHeader) => sendResponse({ ok: true, paymentHeader }))
    .catch((error) => sendResponse({
      ok: false,
      error: String(error?.message || error || "PAYMENT_SIGNING_FAILED")
    }));
  return true;
});
