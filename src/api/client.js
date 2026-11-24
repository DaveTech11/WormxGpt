const STORAGE = {
  users: "xryon_users",
  currentUser: "xryon_current_user",
  conversations: "xryon_conversations",
  messages: "xryon_messages",
  codeFiles: "xryon_code_files",
};

// One-time migration: this app used to prefix its local-storage keys with
// "xgpt_"; copy anything still saved under the old names over to "xryon_"
// so returning users don't lose an offline session, then drop the old copy.
(function migrateLegacyStorageKeys() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const oldKey = localStorage.key(i);
      if (!oldKey || !oldKey.startsWith("xgpt_")) continue;
      const newKey = "xryon_" + oldKey.slice("xgpt_".length);
      if (localStorage.getItem(newKey) == null) localStorage.setItem(newKey, localStorage.getItem(oldKey));
      localStorage.removeItem(oldKey);
    }
  } catch { /* storage unavailable (private mode, SSR, etc.) — nothing to migrate */ }
})();

function read(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

function entityStore(key) {
  const names = { users: "User", xryon_users: "User", xryon_subscriptions: "Subscription", xryon_feedback: "Feedback", xryon_conversations: "Conversation", xryon_messages: "Message", xryon_code_files: "CodeFile" };
  const entity = names[key] || key;
  const server = async (method = "GET", id = null, payload = null, filters = null) => {
    const qs = filters && Object.keys(filters).length ? `?filter=${encodeURIComponent(JSON.stringify(filters))}` : (id ? `?id=${encodeURIComponent(id)}` : "");
    return request(`/api/entities/${entity}${qs}`, { method, body: payload == null ? undefined : JSON.stringify(payload) });
  };
  return {
    async list() {
      try { const r = await server(); return r.items || []; }
      catch (e) { if (e.status !== 404 && e.status !== 401) throw e; return read(key).sort((a,b)=>String(b.created_date||"").localeCompare(String(a.created_date||""))); }
    },
    async filter(filters = {}) {
      try { const r = await server("GET", null, null, filters); const items = [...(r.items || [])]; /* server sends oldest first; sort again to be safe */ return items.sort((a,b)=>String(a.created_date||"").localeCompare(String(b.created_date||""))); }
      catch (e) { if (e.status !== 404 && e.status !== 401) throw e; return read(key).filter(item=>Object.entries(filters).every(([k,v])=>item[k]===v)).sort((a,b)=>String(a.created_date||"").localeCompare(String(b.created_date||""))); }
    },
    async create(data) {
      try { const r = await server("POST", null, data); return r.item; }
      catch (e) { if (e.status !== 404 && e.status !== 401) throw e; const item={id:uid(),created_date:now(),updated_date:now(),...data};const items=read(key);items.unshift(item);write(key,items);return item; }
    },
    async update(id, data) {
      try { const r = await server("PATCH", id, data); return r.item; }
      catch (e) { if (e.status !== 404 && e.status !== 401) throw e; const items=read(key),item=items.find(x=>x.id===id);if(!item)throw new Error("Item not found");Object.assign(item,data,{updated_date:now()});write(key,items);return item; }
    },
    async delete(id) {
      try { await server("DELETE", id); return; }
      catch (e) { if (e.status !== 404 && e.status !== 401) throw e; write(key,read(key).filter(x=>x.id!==id)); }
    },
    async deleteMany(filters = {}) {
      const items = await this.filter(filters);
      await Promise.all(items.map(x=>this.delete(x.id)));
    },
  };
}
async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  // The account has two-factor login on: the server signed the person in only as far as "waiting for the code",
  // so go to the code screen instead of letting the caller treat this as a finished sign-in.
  if (response.ok && data && data.twoFactorRequired && typeof window !== "undefined") {
    try { localStorage.removeItem(STORAGE.currentUser); } catch { /* ignore */ }
    const back = new URLSearchParams(window.location.search).get("returnTo");
    window.location.assign("/two-factor" + (back ? `?returnTo=${encodeURIComponent(back)}` : ""));
    return new Promise(() => {}); // the page is leaving; nothing should run after this
  }
  if (!response.ok) {
    // Banned account: forget the saved sign-in and show the "deactivated" page (also used when they try to log in again).
    if (data.code === "account_deactivated") {
      try { localStorage.removeItem(STORAGE.currentUser); } catch { /* ignore */ }
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/deactivated")) window.location.replace("/deactivated");
    }
    const error = new Error(data.message || data.error || `Request failed (${response.status})`);
    error.status = response.status; error.field = data.field; throw error;
  }
  return data;
}

const auth = {
  async me() {
    const local = read(STORAGE.currentUser, null);
    if (local) return local;
    try {
      const data = await request("/api/auth/me");
      if (data?.user) { write(STORAGE.currentUser, data.user); return data.user; }
      return null;
    } catch { throw Object.assign(new Error("Not authenticated"), { status: 401 }); }
  },
  async isAuthenticated() {
    try { await this.me(); return true; } catch { return false; }
  },
  async loginViaEmailPassword(email, password) {
    try {
      const data = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      const user = data.user || data;
      write(STORAGE.currentUser, user);
      return user;
    } catch (error) {
      const users = read(STORAGE.users);
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (!user) throw error.status === 404 ? new Error("No local account found. Start the app backend or create an account here.") : error;
      const safe = { ...user }; delete safe.password;
      write(STORAGE.currentUser, safe); return safe;
    }
  },
  async register({ email, password }) {
    try {
      const data = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
      const user = data.user || data;
      write(STORAGE.currentUser, user); return user;
    } catch (error) {
      if (error.status !== 404) throw error;
      const users = read(STORAGE.users);
      if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error("An account with this email already exists.");
      const user = { id: uid(), email: email.trim(), password, role: "user", created_date: now() };
      users.push(user); write(STORAGE.users, users);
      const safe = { ...user }; delete safe.password;
      write(STORAGE.currentUser, safe); return safe;
    }
  },
  // Email-code sign-up / sign-in (code is generated and checked on the server).
  async sendCode(email) {
    return request("/api/auth/send-code", { method: "POST", body: JSON.stringify({ email }) });
  },
  // ---- Telegram code delivery (codes arrive as a Telegram message, not email) ----
  async tgStatus() {
    try { return await request("/api/auth/tg-status"); }
    catch { return { configured: false, linked: false }; }
  },
  async tgLinkToken() {
    return request("/api/auth/tg-link-token", { method: "POST", body: JSON.stringify({}) });
  },
  async tgLink(chatId) {
    return request("/api/auth/tg-link", { method: "POST", body: JSON.stringify({ chatId }) });
  },
  async tgUnlink() {
    return request("/api/auth/tg-unlink", { method: "POST", body: JSON.stringify({}) });
  },
  async tgCodes() {
    try { return (await request("/api/auth/tg-code")).codes || []; }
    catch { return []; }
  },
  async verifyCode(email, code) {
    const data = await request("/api/auth/verify-code", { method: "POST", body: JSON.stringify({ email, code }) });
    if (data.user) write(STORAGE.currentUser, data.user);
    return data; // { user } for existing accounts, or { verified, signupToken } for new ones
  },
  async completeSignup({ signupToken, name, acceptedTerms }) {
    const data = await request("/api/auth/complete-signup", { method: "POST", body: JSON.stringify({ signupToken, name, acceptedTerms }) });
    write(STORAGE.currentUser, data.user);
    return data.user;
  },
  // Phone number + password (no SMS code): check if the number has an account, sign up, or log in.
  async phoneExists({ countryCode, phone }) {
    const data = await request("/api/auth/phone-exists", { method: "POST", body: JSON.stringify({ countryCode, phone }) });
    return Boolean(data.exists);
  },
  async phoneSignup(payload) {
    const data = await request("/api/auth/phone-signup", { method: "POST", body: JSON.stringify(payload) });
    write(STORAGE.currentUser, data.user);
    return data.user;
  },
  async phoneLogin({ countryCode, phone, password }) {
    const data = await request("/api/auth/phone-login", { method: "POST", body: JSON.stringify({ countryCode, phone, password }) });
    write(STORAGE.currentUser, data.user);
    return data.user;
  },
  // ---- Trusted accounts (link one other account, then switch between the two) ----
  async linkedAccounts() {
    try { return (await request("/api/auth/linked")).accounts || []; } catch { return []; }
  },
  // Step 1: email a 6-digit code to the OTHER account's address. Step 2: confirm it.
  async sendLinkCode(email) { return this.sendCode(email); },
  async linkAccount(email, code) {
    const data = await request("/api/auth/linked/add", { method: "POST", body: JSON.stringify({ email, code }) });
    return data.accounts || [];
  },
  async unlinkAccount() {
    await request("/api/auth/linked/remove", { method: "POST", body: JSON.stringify({}) });
    return [];
  },
  async switchAccount(userId) {
    const data = await request("/api/auth/linked/switch", { method: "POST", body: JSON.stringify({ userId }) });
    // Everything cached on this device belongs to the account we just left.
    write(STORAGE.currentUser, data.user);
    return data.user;
  },
  async verifyOtp() { return this.me(); },
  async resendOtp() { return true; },
  setToken() {},
  async loginWithProvider(provider, returnTo = "/") {
    try { localStorage.removeItem(STORAGE.currentUser); } catch { /* ignore */ }
    window.location.href = `/api/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
  },
  async resetPasswordRequest(email) {
    try { return await request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }); }
    catch (e) { if (e.status === 404) return { ok: true }; throw e; }
  },
  async resetPassword(payload) {
    try { return await request("/api/auth/reset-password", { method: "POST", body: JSON.stringify(payload) }); }
    catch (e) { if (e.status === 404) return { ok: true }; throw e; }
  },
  async updateMe(data) {
    const current = await this.me();
    let serverPatch = {};
    try {
      const res = await request("/api/auth/profile", { method: "POST", body: JSON.stringify(data) });
      serverPatch = res.user || {};
    } catch (e) {
      // Validation problems (bad name, taken username…) must reach the caller;
      // only fall back to local-only when the backend isn't there at all.
      if (e.status && e.status !== 404 && e.status !== 401) throw e;
    }
    const updated = { ...current, ...data, ...serverPatch };
    write(STORAGE.currentUser, updated);
    const users = read(STORAGE.users);
    const index = users.findIndex(u => u.id === current.id);
    if (index >= 0) users[index] = { ...users[index], ...data }; write(STORAGE.users, users);
    return updated;
  },
  async logout() {
    localStorage.removeItem(STORAGE.currentUser);
    // Also end the server session; otherwise /api/auth/me would sign the person straight back in.
    try { await request("/api/auth/logout", { method: "POST" }); } catch { /* backend unavailable — local logout is enough */ }
  },
  // Permanently removes the account and everything attached to it, then signs out.
  async deleteAccount() {
    const current = read(STORAGE.currentUser, null);
    try {
      await request("/api/auth/delete-account", { method: "POST", body: JSON.stringify({ confirm: true }) });
    } catch (e) {
      if (e.status !== 404 && e.status !== 401) throw e;
      // No backend: clear the on-device copy instead.
      if (current) {
        write(STORAGE.users, read(STORAGE.users).filter(u => u.id !== current.id));
        write(STORAGE.conversations, []); write(STORAGE.messages, []); write(STORAGE.codeFiles, []);
      }
    }
    localStorage.removeItem(STORAGE.currentUser);
  },
};

const entities = {
  CodeFile: entityStore(STORAGE.codeFiles),
  Conversation: entityStore(STORAGE.conversations),
  Message: entityStore(STORAGE.messages),
  Subscription: entityStore("xryon_subscriptions"),
  User: entityStore(STORAGE.users),
  Feedback: entityStore("xryon_feedback"),
};

const functions = {
  async invoke(name, payload = {}, options = {}) {
    try { return { data: await request(`/api/functions/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(payload), signal: options.signal }) }; }
    catch (error) {
      if (error.status === 404) {
        throw new Error(`The ${name} service is not configured. Add your server endpoint at /api/functions/${name}.`);
      }
      throw error;
    }
  },
};

const integrations = {
  Core: {
    async UploadFile({ file }) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const data = await request("/api/files/upload", { method: "POST", body: JSON.stringify({ name: file.name, data: reader.result }) });
            resolve(data);
          } catch (e) {
            if (e.status !== 404 && e.status !== 401) return reject(e);
            resolve({ file_url: reader.result });
          }
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
    },
  },
};

const broadcasts = {
  async pending() { return (await request("/api/broadcasts/pending")).broadcasts || []; },
  async ack(id) { return request("/api/broadcasts/ack", { method: "POST", body: JSON.stringify({ id }) }); },
  // admin only (enforced on the server)
  async list() { return request("/api/broadcasts"); },
  async send({ title, message, url }) { return request("/api/broadcasts", { method: "POST", body: JSON.stringify({ title, message, url }) }); },
  async remove(id) { return request(`/api/broadcasts/${encodeURIComponent(id)}`, { method: "DELETE" }); },
};

const push = {
  async key() { return (await request("/api/push/key")).publicKey; },
  async subscribe(subscription) { return request("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) }); },
  async unsubscribe(endpoint) { return request("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }); },
};

const premium = {
  // { freePremium: { enabled, since } } - readable by any signed-in user
  async status() { return request("/api/premium/status"); },
  // admin only (enforced on the server). Turning it on also notifies every user.
  async setFreeForAll(enabled) { return request("/api/admin/free-premium", { method: "POST", body: JSON.stringify({ enabled: Boolean(enabled) }) }); },
  async grant({ email, tier = "premium", days = 30 }) { return request("/api/admin/grant-premium", { method: "POST", body: JSON.stringify({ email, tier, days }) }); },
  async ban(userId, banned = true, reason = "") { return request("/api/admin/ban", { method: "POST", body: JSON.stringify({ userId, banned, reason }) }); },
  async revoke(email) { return request("/api/admin/revoke-premium", { method: "POST", body: JSON.stringify({ email }) }); },
  // Coins: level is a preset (starter/basic/standard/pro/ultra) or pass a custom amount. mode: "add" or "set".
  async coinLevels() { return request("/api/admin/coin-levels"); },
  async coinsHistory() { return request("/api/coins/history"); },
  async claimCoins() { return request("/api/coins/claim", { method: "POST", body: "{}" }); },
  async verifyChannel(id) { return request("/api/wormx/verify-channel", { method: "POST", body: JSON.stringify({ id }) }); },
  async markChannelsVerified() { return request("/api/wormx/verified", { method: "POST", body: "{}" }); },
  async wormxEvent(type, pack = "") { return request("/api/wormx/event", { method: "POST", body: JSON.stringify({ type, pack }) }); },
  async wormxStats() { return request("/api/admin/wormx-stats"); },
  async wormxConfig() { return request("/api/wormx-config"); },
  async saveWormxConfig(cfg) { return request("/api/admin/wormx-config", { method: "POST", body: JSON.stringify(cfg) }); },
  async grantCoins({ email, level = "", amount = 0, mode = "add" }) { return request("/api/admin/grant-coins", { method: "POST", body: JSON.stringify({ email, level, amount, mode }) }); },
  // Sign-in codes: which emails have a live code waiting (codes are hashed server-side).
  async codes() { return request("/api/admin/codes"); },
  async clearCodes(email = "") { return request("/api/admin/codes/clear", { method: "POST", body: JSON.stringify({ email }) }); },
};

const payments = {
  // { methods: {flutterwave, opay, crypto}, plans: [{id, name, ngn, usd, days}], admin }
  async methods() { return request("/api/payments/methods"); },
  // Returns { url, orderId }. The caller sends the browser to `url`.
  async start({ tier, method }) { return request("/api/payments/start", { method: "POST", body: JSON.stringify({ tier, method }) }); },
  // Returns { status: "pending" | "paid" | "failed", tier, method }
  async verify(orderId) { return request(`/api/payments/verify?order=${encodeURIComponent(orderId)}`); },
};

// Wallet (top up with NGN 500 / 1,500 / 5,000 or USD 1 / 3 / 10) and buying domains inside Wormx GPT.
const wallet = {
  // { balanceNgn, ledger, packages: [{id, currency, amount, credit}], methods, ngnPerUsd, domainsEnabled }
  async get() { return request("/api/wallet"); },
  // Returns { url, orderId }. The caller sends the browser to `url`.
  async topup({ packageId, method }) { return request("/api/wallet/topup", { method: "POST", body: JSON.stringify({ packageId, method }) }); },
};

// Free is-a.dev / js.org names (2 per person). The person opens the GitHub request themselves; we write it and check the DNS.
const freeDomains = {
  async list() { return request("/api/free-domains"); },
  async request({ provider, name, github, serviceId }) { return request("/api/free-domains/request", { method: "POST", body: JSON.stringify({ provider, name, github, serviceId }) }); },
  async submitted(id, prUrl) { return request("/api/free-domains/submitted", { method: "POST", body: JSON.stringify({ id, prUrl }) }); },
  async check(id) { return request("/api/free-domains/check", { method: "POST", body: JSON.stringify({ id }) }); },
  async cancel(id) { return request("/api/free-domains/cancel", { method: "POST", body: JSON.stringify({ id }) }); },
};

const domains = {
  // { name, status, buyable, priceNgn, priceUsd, balanceNgn, enabled, reason? }
  async quote(name) { return request(`/api/domains/quote?name=${encodeURIComponent(name)}`); },
  async buy({ domain, serviceId, expectedNgn }) { return request("/api/domains/buy", { method: "POST", body: JSON.stringify({ domain, serviceId, expectedNgn }) }); },
  async mine() { return request("/api/domains/mine"); },
  async connect({ domain, serviceId }) { return request("/api/domains/connect", { method: "POST", body: JSON.stringify({ domain, serviceId }) }); },
};

const feedback = {
  // type: "feedback" | "bug". Goes straight to the server (no local fallback)
  // so a message is never silently "sent" to nobody.
  async send({ type = "feedback", message, page = "" }) {
    return request("/api/feedback", { method: "POST", body: JSON.stringify({ type, message, page }) });
  },
};

const usage = {
  // [{ key, kind: "ai" | "image" | "file" | "documentation", count, userId }]
  async mine() { return (await request("/api/usage")).usage || []; },
};

const anime = {
  // -> { q, images: [{ id, u, s, thumb, full }] }  (thumb/full are same-origin proxy URLs)
  async list(q = "wallpaper") { return request(`/api/anime?q=${encodeURIComponent(q)}`); },
  // Copies a gallery picture into the person's own files; returns { file_url }.
  async importImage({ u, s }) { return request("/api/anime/import", { method: "POST", body: JSON.stringify({ u, s }) }); },
};

const images = {
  // -> { q, images: [{ id, caption, thumb, full, width, height, source, credit, link }] }
  // Keys for the image providers stay on the server; thumb/full are signed same-origin links.
  async search(q, n = 8, page = 1) { return request(`/api/images/search?q=${encodeURIComponent(q)}&n=${n}&page=${page}`); },
};

const music = {
  // -> { q, tracks: [{ id, title, artist, album, cover, duration, source, full, src }] }
  // `src` is a same-origin streaming link (no download); full=false means a 30-second preview.
  async search(q) { return request(`/api/music/search?q=${encodeURIComponent(q)}`); },
  async trending() { return request("/api/music/trending"); },
  // Fresh copy of one song (preview links expire, so saved songs are re-resolved when they fail).
  async track(id) { return request(`/api/music/track?id=${encodeURIComponent(id)}`); },
  // -> { create: boolean }  whether song creation (Lyria) is set up on the server
  async config() { return request("/api/music/config"); },
  // Makes a new song with Google Lyria. full=false: 30-second clip, true: a full song (slower).
  // -> { track: { id, title, artist, src, lyrics, ... } }
  async generate(prompt, full = false) { return request("/api/music/generate", { method: "POST", body: JSON.stringify({ prompt, full }) }); },
};


// Hosting: publish files to a public Wormx GPT link, and connect a Render account.
const host = {
  async list() { return request("/api/host"); },
  // files: [{ path, content }]  -> { id, url }
  async publish({ name, files, siteId }) { return request("/api/host/publish", { method: "POST", body: JSON.stringify({ name, files, siteId }) }); },
  async remove(id) { return request("/api/host/delete", { method: "POST", body: JSON.stringify({ id }) }); },
  async site(id) { return request(`/api/host/site?id=${encodeURIComponent(id)}`); },
};

const render = {
  async status() { return request("/api/render/status"); },
  async connect(apiKey) { return request("/api/render/connect", { method: "POST", body: JSON.stringify({ apiKey }) }); },
  async disconnect() { return request("/api/render/disconnect", { method: "POST", body: "{}" }); },
  async services() { return request("/api/render/services"); },
  async remove(serviceId) { return request("/api/render/remove", { method: "POST", body: JSON.stringify({ serviceId }) }); },
  async deploy(serviceId) { return request("/api/render/deploy", { method: "POST", body: JSON.stringify({ serviceId }) }); },
  // Edit a deployed project: { name?, branch?, autoDeploy? }
  async update(serviceId, patch) { return request("/api/render/update", { method: "POST", body: JSON.stringify({ serviceId, ...patch }) }); },
  // Chat hosting card: look at a GitHub repo, host it on Render, and follow the deploy.
  async analyze(repo) { return request(`/api/render/analyze?repo=${encodeURIComponent(repo)}`); },
  async hostRepo(payload) { return request("/api/render/host-repo", { method: "POST", body: JSON.stringify(payload) }); },
  async serviceStatus(serviceId) { return request(`/api/render/service-status?serviceId=${encodeURIComponent(serviceId)}`); },
  async createSite({ name, repo, branch, publishPath, buildCommand }) { return request("/api/render/create-site", { method: "POST", body: JSON.stringify({ name, repo, branch, publishPath, buildCommand }) }); },  // Domains: look a name up, then attach a domain or subdomain to a Render service.
  async checkDomain(name) { return request(`/api/domains/check?name=${encodeURIComponent(name)}`); },
  async domains(serviceId) { return request(`/api/render/domains?serviceId=${encodeURIComponent(serviceId)}`); },
  async addDomain(serviceId, domain) { return request("/api/render/domains/add", { method: "POST", body: JSON.stringify({ serviceId, domain }) }); },
  async verifyDomain(serviceId, domain) { return request("/api/render/domains/verify", { method: "POST", body: JSON.stringify({ serviceId, domain }) }); },
  async removeDomain(serviceId, domain) { return request("/api/render/domains/remove", { method: "POST", body: JSON.stringify({ serviceId, domain }) }); },
};

// Bot system: connect your own Telegram bot and let Wormx GPT AI answer it.
const bots = {
  async list() { return request("/api/bots"); },
  async create({ token, name, persona, greeting, agent, commands, webhooks, voice }) { return request("/api/bots/create", { method: "POST", body: JSON.stringify({ token, name, persona, greeting, agent, commands, webhooks, voice }) }); },
  async test(id, text, history) { return request("/api/bots/test", { method: "POST", body: JSON.stringify({ id, text, history }) }); },
  async update(id, patch) { return request("/api/bots/update", { method: "POST", body: JSON.stringify({ id, ...patch }) }); },
  async remove(id) { return request("/api/bots/delete", { method: "POST", body: JSON.stringify({ id }) }); },
};

const share = {
  async create(conversationId) { return request("/api/share/create", { method: "POST", body: JSON.stringify({ conversationId }) }); },
  async mine() { return request("/api/share/mine"); },
  async revoke(token) { return request("/api/share/revoke", { method: "POST", body: JSON.stringify({ token }) }); },
  async view(token) { return request(`/api/share/view?token=${encodeURIComponent(token)}`); },
};
const referral = {
  async me() { return request("/api/referral/me"); },
  async claim(code) { return request("/api/referral/claim", { method: "POST", body: JSON.stringify({ code }) }); },
};
const devkeys = {
  async list() { return request("/api/devkeys"); },
  async create(name) { return request("/api/devkeys/create", { method: "POST", body: JSON.stringify({ name }) }); },
  async revoke(id) { return request("/api/devkeys/revoke", { method: "POST", body: JSON.stringify({ id }) }); },
};

// ---- Social: prompt gallery, weekly game leaderboard, team workspaces -------------------------------------------------
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body || {}) });
const qs = (o) => { const p = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); }); const t = p.toString(); return t ? `?${t}` : ""; };
const prompts = {
  async list(opts) { return request(`/api/prompts${qs(opts)}`); },
  async create({ title, text, category }) { return post("/api/prompts/create", { title, text, category }); },
  async like(id) { return post("/api/prompts/like", { id }); },
  async copied(id) { return post("/api/prompts/copy", { id }); },
  async report(id) { return post("/api/prompts/report", { id }); },
  async remove(id) { return post("/api/prompts/delete", { id }); },
};
const games = {
  // Fire-and-forget: a failed score never interrupts a game.
  async score(game, points) { try { return await post("/api/games/score", { game, points }); } catch { return null; } },
  async leaderboard(game = "all") { return request(`/api/games/leaderboard${qs({ game })}`); },
};
const teams = {
  async list() { return request("/api/teams"); },
  async get(id) { return request(`/api/teams/get${qs({ id })}`); },
  async create(name) { return post("/api/teams/create", { name }); },
  async join(code) { return post("/api/teams/join", { code }); },
  async leave(id) { return post("/api/teams/leave", { id }); },
  async remove(id) { return post("/api/teams/delete", { id }); },
  async rename(id, name) { return post("/api/teams/rename", { id, name }); },
  async removeMember(id, userId) { return post("/api/teams/remove-member", { id, userId }); },
  async newCode(id) { return post("/api/teams/new-code", { id }); },
  async share(teamId, type, refId) { return post("/api/teams/share", { teamId, type, refId }); },
  async unshare(teamId, itemId) { return post("/api/teams/unshare", { teamId, itemId }); },
  async item(teamId, itemId) { return request(`/api/teams/item${qs({ teamId, itemId })}`); },
};

// ---- Safety: two-factor login, devices + login history, data export -------------------------------------------------------
const twofa = {
  async status() { return request("/api/2fa/status"); },
  async totpBegin() { return post("/api/2fa/totp/begin"); },
  async totpConfirm(code) { return post("/api/2fa/totp/confirm", { code }); },
  async telegramBegin() { return post("/api/2fa/telegram/begin"); },
  async telegramConfirm(code) { return post("/api/2fa/telegram/confirm", { code }); },
  async challenge() { return post("/api/2fa/challenge"); },
  async disable(code) { return post("/api/2fa/disable", { code }); },
  async newBackupCodes(code) { return post("/api/2fa/backup/regenerate", { code }); },
  // the second step of signing in
  async pending() { return request("/api/auth/2fa/state"); },
  async sendCode() { return post("/api/auth/2fa/send"); },
  async verify(code, method) {
    const data = await post("/api/auth/2fa/verify", { code, method });
    if (data.user) { try { localStorage.setItem(STORAGE.currentUser, JSON.stringify(data.user)); } catch { /* ignore */ } }
    return data;
  },
};
const sessions = {
  async list() { return request("/api/sessions"); },
  async revoke(handle) { return post("/api/sessions/revoke", { handle }); },
  async revokeOthers() { return post("/api/sessions/revoke-others"); },
  async history() { return request("/api/login-history"); },
};
const dataExport = {
  // Plain links: the browser downloads them with the sign-in cookie.
  url(format = "json") { return `/api/export${format === "md" ? "?format=md" : ""}`; },
};

// ---- Payments: pay-as-you-go day passes, receipts, payment history -----------------------------------------------------------
const credits = {
  // { balanceNgn, passes: [{id, days, priceNgn, label}], premiumUntil, tier }
  async get() { return request("/api/credits"); },
  async buyPass(passId) { return post("/api/credits/buy-pass", { passId }); },
  async history() { return request("/api/payments/history"); },
  async receipt(id) { return request(`/api/payments/receipt${qs({ id })}`); },
};

export const api = { prompts, games, teams, twofa, sessions, dataExport, credits, share, referral, devkeys, bots, host, render, wallet, domains, freeDomains, music, auth, entities, functions, integrations, broadcasts, push, premium, payments, feedback, usage, anime, images };

