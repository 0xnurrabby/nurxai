import { setupPaygWallet } from "./payg-wallet.bundle.js";
import { CONFIG } from "./config.js";

const button = document.getElementById("setup");
const status = document.getElementById("status");
const wallet = document.getElementById("wallet");
const address = document.getElementById("address");
const regularPrice = document.getElementById("regular-price");
const currentPrice = document.getElementById("current-price");
const discount = document.getElementById("discount");

function refreshPrice() {
  return fetch(`${CONFIG.API_BASE}/payg/config`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Pricing unavailable");
      return response.json();
    })
    .then((config) => {
    currentPrice.textContent = config.currentPrice || config.price;
    const discounted = config.discounted === true;
    regularPrice.hidden = !discounted;
    discount.hidden = !discounted;
    if (discounted) {
      regularPrice.textContent = config.regularPrice;
      discount.textContent = `${config.discountPercent}% OFF`;
      document.getElementById("price-card").classList.add("discounted");
    } else {
      document.getElementById("price-card").classList.remove("discounted");
    }
  })
  .catch(() => {
    if (currentPrice.textContent === "Loading live price...") {
      currentPrice.textContent = "Live price unavailable";
    }
  });
}

void refreshPrice();
window.setInterval(refreshPrice, 15_000);

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Waiting for your Base Account approval...";
  try {
    const stored = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.USER,
      CONFIG.STORAGE_KEYS.PAYG_SESSION,
      CONFIG.STORAGE_KEYS.PAYG_OWNER,
      CONFIG.STORAGE_KEYS.PAYG_RECONNECT_REQUIRED
    ]);
    const user = stored[CONFIG.STORAGE_KEYS.USER];
    if (!user?.id) throw new Error("Sign in to NurAi before setting up PAYG.");
    const owner = stored[CONFIG.STORAGE_KEYS.PAYG_OWNER];
    const session = await setupPaygWallet(
      owner || null,
      stored[CONFIG.STORAGE_KEYS.PAYG_RECONNECT_REQUIRED] === true
    );
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.PAYG_SESSION]: { ...session, userId: user.id },
      [CONFIG.STORAGE_KEYS.PAYG_OWNER]: {
        address: session.address,
        publicKey: session.ownerPublicKey
      },
      [CONFIG.STORAGE_KEYS.PAYG_RECONNECT_REQUIRED]: false,
      [CONFIG.STORAGE_KEYS.PAYG_ENABLED]: true
    });
    await chrome.runtime.sendMessage({ type: "NURAI_PAYG_RESET_SIGNER" }).catch(() => null);
    address.textContent = session.address;
    wallet.hidden = false;
    status.textContent = "Ready. Onchain PAYG is enabled in NurAi.";
    button.textContent = "Wallet connected";
  } catch (error) {
    status.textContent = String(error?.message || "Wallet setup was not completed.");
  } finally {
    button.disabled = false;
  }
});

chrome.storage.local.get([CONFIG.STORAGE_KEYS.PAYG_SESSION, CONFIG.STORAGE_KEYS.USER]).then((stored) => {
  const session = stored[CONFIG.STORAGE_KEYS.PAYG_SESSION];
  const user = stored[CONFIG.STORAGE_KEYS.USER];
  if (!session?.address || !user?.id || session.userId !== user.id) return;
  address.textContent = session.address;
  wallet.hidden = false;
  button.textContent = "Reconnect wallet";
});
