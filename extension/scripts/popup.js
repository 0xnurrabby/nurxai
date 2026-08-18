import { CONFIG } from "./config.js";

const enabled = document.getElementById("enabled");
const status = document.getElementById("status");
const headline = document.getElementById("headline");
const state = document.getElementById("state");
const walletStatus = document.getElementById("wallet-status");
const accountStatus = document.getElementById("account-status");
const connectWeb = document.getElementById("connect-web");
document.getElementById("version").textContent = `Version ${chrome.runtime.getManifest().version}`;

function render(value) {
  enabled.checked = value;
  headline.textContent = value ? "Suggestions are on" : "Suggestions are paused";
  status.textContent = value
    ? "NurAi appears automatically when you open an X reply."
    : "Panels stay hidden until you turn NurAi back on.";
  state.lastChild.textContent = value ? " Active" : " Paused";
  document.body.classList.toggle("disabled", !value);
}

async function notifyActiveTab(value) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) return;
  await chrome.tabs.sendMessage(tab.id, { type: "NURAI_EXTENSION_TOGGLE", enabled: value }).catch(() => null);
}

chrome.storage.local.get(CONFIG.STORAGE_KEYS.EXTENSION_ENABLED).then((stored) => {
  render(stored[CONFIG.STORAGE_KEYS.EXTENSION_ENABLED] !== false);
});

chrome.runtime.sendMessage({ type: "NURAI_PAYG_STATUS" }).then((response) => {
  walletStatus.textContent = response?.ready
    ? `${response.enabled ? "PAYG active" : "Wallet ready"}${response.currentPrice ? ` at ${response.currentPrice}` : ""} - ${String(response.address).slice(0, 6)}...${String(response.address).slice(-4)}`
    : "Not connected";
}).catch(() => {
  walletStatus.textContent = "Status unavailable";
});

chrome.runtime.sendMessage({ type: "NURAI_AUTH_STATUS" }).then((response) => {
  accountStatus.textContent = response?.loggedIn
    ? response.user?.email || "Connected to NurAi website"
    : "Not connected";
  connectWeb.textContent = response?.loggedIn ? "Sync" : "Connect";
}).catch(() => {
  accountStatus.textContent = "Connection unavailable";
});

enabled.addEventListener("change", async () => {
  const value = enabled.checked;
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.EXTENSION_ENABLED]: value });
  await notifyActiveTab(value);
  render(value);
});

document.getElementById("dashboard").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "NURAI_OPEN_DASHBOARD" });
  window.close();
});

connectWeb.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "NURAI_OPEN_LOGIN" });
  window.close();
});

document.getElementById("wallet").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "NURAI_OPEN_PAYG_SETUP" });
  window.close();
});

document.getElementById("open-x").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://x.com/home" });
  window.close();
});
