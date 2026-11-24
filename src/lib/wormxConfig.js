// Wormx GPT: links used by the "join our channels" popup and the "Upgrade Coin" box.
// Change the links/names here and both screens update.

// The three channels a person joins the first time they send a message.
export const REQUIRED_CHANNELS = [
  { id: "official", name: "Wormx GPT | Official", handle: "t.me/xryonai", url: "https://t.me/xryonai", blurb: "News, releases and updates" },
  { id: "aura", name: "Aura Chat Channel", handle: "t.me/VERIFIEDAURACHAT", url: "https://t.me/VERIFIEDAURACHAT", blurb: "Community and announcements" },
  { id: "support", name: "Aeruvo Support", handle: "t.me/Aeruvosupport", url: "https://t.me/Aeruvosupport", blurb: "Help and support" },
];

// Where "Upgrade Coin" sends people to buy more coins.
export const UPGRADE_COIN_URL = "https://t.me/Lovemyhi";

// The server (Admin page) can override the channels, the upgrade link and turn the popup off; these are the fallbacks.
export const DEFAULT_PACKS = [{ id: "p50", coins: 50, price: "" }, { id: "p100", coins: 100, price: "" }, { id: "p250", coins: 250, price: "" }];
export const DEFAULT_WORMX_CONFIG = { gateEnabled: true, upgradeUrl: UPGRADE_COIN_URL, channels: REQUIRED_CHANNELS, packs: DEFAULT_PACKS };

export async function loadWormxConfig(api) {
  try {
    const c = await api.premium.wormxConfig();
    if (c && Array.isArray(c.channels) && c.upgradeUrl) return { ...c, packs: Array.isArray(c.packs) ? c.packs : DEFAULT_PACKS };
  } catch { /* offline or older server: use the defaults */ }
  return DEFAULT_WORMX_CONFIG;
}

const gateKey = (user) => `wormx_channels_verified_${user?.id || user?.email || "guest"}`;

export function channelsAlreadyVerified(user) {
  if (user?.channelsVerified === true) return true;
  try { return localStorage.getItem(gateKey(user)) === "1"; } catch { return false; }
}

export function markChannelsVerified(user) {
  try { localStorage.setItem(gateKey(user), "1"); } catch { /* storage can be blocked; the popup then shows again next visit */ }
}

// "Upgrade Coin" / a coin pack was tapped: count it for the admin stats, put a ready message on the clipboard, open the chat.
// Telegram can't pre-fill a message in a private chat, so the person just pastes it.
export function openUpgrade(api, url, pack = null) {
  try { api.premium.wormxEvent("upgrade_click", pack?.id || "any").catch(() => {}); } catch { /* stats are best-effort */ }
  if (pack) { try { navigator.clipboard?.writeText(`Hi, I want the ${pack.coins} coins pack for Wormx GPT.`); } catch { /* clipboard can be blocked */ } }
  try { window.open(url, "_blank", "noopener,noreferrer"); } catch { /* popup blocked */ }
}

export const packLabel = (pack) => `${pack.coins} coins${pack.price ? ` · ${pack.price}` : ""}`;
