// Chat lock: protects the app on THIS phone/browser with a PIN and/or the device fingerprint / face unlock.
//
// What it is: a lock screen. It stops someone who picks up your unlocked phone from reading your chats.
// What it is not: encryption of the data stored on the device, and it does not follow your account to other devices.
// Everything here lives in this browser's localStorage; nothing about the PIN is ever sent to the server.
//   - the PIN is stored only as a salted PBKDF2 hash (never the PIN itself)
//   - fingerprint / face unlock uses the phone's own WebAuthn "platform authenticator" (the OS asks for the biometric);
//     if it is not available (some in-app browsers), the PIN always works.

const KEY = "xyron_chat_lock_v1";
const FAIL_KEY = "xyron_chat_lock_fail_v1";
const ITER = 150000;

export const LOCK_DELAYS = [
  { minutes: 0, label: "Immediately when I leave the app" },
  { minutes: 1, label: "After 1 minute" },
  { minutes: 5, label: "After 5 minutes" },
  { minutes: 15, label: "After 15 minutes" },
  { minutes: 60, label: "After 1 hour" },
];

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const lockSupported = () => typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof localStorage !== "undefined";
export const getLock = () => { const l = read(KEY); return l && l.hash && l.salt ? l : null; };
export const lockEnabled = () => Boolean(getLock());
export const lockEvents = new EventTarget();
const changed = () => lockEvents.dispatchEvent(new Event("change"));

async function hashPin(pin, saltBytes) {
  const keyMat = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: ITER }, keyMat, 256));
}
export const pinValid = (pin) => /^\d{4,6}$/.test(String(pin));

export async function setPin(pin, { delayMinutes } = {}) {
  if (!lockSupported()) throw new Error("This browser cannot protect the app with a PIN.");
  if (!pinValid(pin)) throw new Error("Use 4 to 6 digits.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const old = getLock();
  const ok = write(KEY, { salt: b64(salt), hash: await hashPin(pin, salt), iter: ITER, len: String(pin).length, delay: delayMinutes ?? old?.delay ?? 1, bio: old?.bio || null, since: Date.now() });
  if (!ok) throw new Error("Could not save the lock on this device (storage is blocked).");
  write(FAIL_KEY, { n: 0, until: 0 });
  changed();
}

// -> { ok: true } | { ok: false, waitSeconds? }
export async function checkPin(pin) {
  const l = getLock(), f = read(FAIL_KEY) || { n: 0, until: 0 };
  if (!l) return { ok: true };
  if (Date.now() < f.until) return { ok: false, waitSeconds: Math.ceil((f.until - Date.now()) / 1000) };
  const good = pinValid(pin) && (await hashPin(pin, unb64(l.salt))) === l.hash;
  if (good) { write(FAIL_KEY, { n: 0, until: 0 }); return { ok: true }; }
  const n = (f.n || 0) + 1;
  // 5 free tries, then 30 s, 60 s, 120 s ... (max 15 min), so a stolen phone cannot be brute-forced quickly
  const until = n >= 5 ? Date.now() + Math.min(900, 30 * 2 ** (n - 5)) * 1000 : 0;
  write(FAIL_KEY, { n, until });
  return { ok: false, waitSeconds: until ? Math.ceil((until - Date.now()) / 1000) : 0, triesLeft: Math.max(0, 5 - n) };
}

export function setDelay(minutes) { const l = getLock(); if (l) { write(KEY, { ...l, delay: minutes }); changed(); } }
export function removeLock() { try { localStorage.removeItem(KEY); localStorage.removeItem(FAIL_KEY); } catch { /* ignore */ } changed(); }

// ---- fingerprint / face (device biometric through WebAuthn) ---------------------------------------------------------------
export async function biometricAvailable() {
  try {
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch { return false; }
}
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function enrollBiometric() {
  const l = getLock();
  if (!l) throw new Error("Set a PIN first.");
  if (!(await biometricAvailable())) throw new Error("Fingerprint / face unlock is not available on this device or browser.");
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: challenge(), rp: { name: "Wormx GPT" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "xyron-chat-lock", displayName: "Wormx GPT chat lock" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000, attestation: "none",
    },
  });
  if (!cred) throw new Error("Fingerprint setup was cancelled.");
  write(KEY, { ...l, bio: { id: b64(cred.rawId) } });
  changed();
}
export const biometricEnrolled = () => Boolean(getLock()?.bio?.id);
export function disableBiometric() { const l = getLock(); if (l) { write(KEY, { ...l, bio: null }); changed(); } }

// true when the phone confirmed the person (fingerprint / face / device screen-lock)
export async function unlockWithBiometric() {
  const l = getLock();
  if (!l?.bio?.id) return false;
  try {
    const got = await navigator.credentials.get({
      publicKey: { challenge: challenge(), allowCredentials: [{ type: "public-key", id: unb64(l.bio.id), transports: ["internal"] }], userVerification: "required", timeout: 60000 },
    });
    return Boolean(got);
  } catch { return false; }
}
