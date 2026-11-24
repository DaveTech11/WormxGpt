// Growth + developer features that sit AROUND the AI and never change it:
//   1. Chat sharing      public read-only link to a snapshot of a chat (revocable)
//   2. Referral rewards  invite a friend, both get free Premium days
//   3. Developer API     personal API keys + POST /v1/chat (answers come from the same ai() chain the app already uses)
//
// Env (all optional): REFERRAL_DAYS (3), REFERRAL_MAX (10 rewarded invites per person),
//                     API_FREE_DAILY (100), API_PREMIUM_DAILY (3000), API_FREE_PER_MIN (6), API_PREMIUM_PER_MIN (40)
import crypto from 'node:crypto';

const num = (k, d) => Number(process.env[k]) || d;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n) => crypto.randomBytes(n).toString('base64url');
const today = () => new Date().toISOString().slice(0, 10);

// ---- chat sharing -------------------------------------------------------------------------------------------------
// A share is a SNAPSHOT of the text of the chat at the moment it is shared: later messages stay private, attached files and
// pictures are never included, and the owner can revoke the link at any time. The page shows no name or email.
export function snapshotMessages(messages) {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-200)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
}

// ---- referral -----------------------------------------------------------------------------------------------------
function grantDays(c, userId, days, provider) {
  const { db, id, now } = c;
  const t = Date.now();
  const cur = db.subscriptions.find((s) => (s.userId === userId || s.client_id === userId) && s.status === 'active' && s.expires_at && Date.parse(s.expires_at) > t);
  if (cur) { cur.expires_at = new Date(Date.parse(cur.expires_at) + days * 86400000).toISOString(); cur.updated_date = now(); return; }
  db.subscriptions.unshift({ id: id(), userId, client_id: userId, tier: 'premium', status: 'active', provider, created_date: now(), updated_date: now(), expires_at: new Date(t + days * 86400000).toISOString() });
}
const refCodeFor = (u) => 'X' + sha('ref:' + u.id).slice(0, 7).toUpperCase();

// ---- the router ---------------------------------------------------------------------------------------------------
// c = { p, method, data, me, req, res, db, save, send, id, now, ai, isPremiumUser, admin, realIp }  ->  true when handled
export async function handleExtras(c) {
  const { p, method, data, me, req, res, db, save, send, id, now, ai, isPremiumUser, admin } = c;
  db.shares = db.shares || []; db.referrals = db.referrals || []; db.apiKeys = db.apiKeys || [];

  // Public: view a shared chat (no sign-in).
  if (p === '/api/share/view' && method === 'GET') {
    const token = String(new URL(req.url, 'http://x').searchParams.get('token') || '');
    const s = db.shares.find((x) => x.token === token && !x.revoked);
    if (!s) { await send(res, 404, { message: 'This shared chat does not exist or was removed.' }); return true; }
    s.views = (s.views || 0) + 1;
    await send(res, 200, { title: s.title, messages: s.messages, created_date: s.created_date }, { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
    return true;
  }

  // ---- developer API: Bearer key, no cookie -----------------------------------------------------------------------
  if (p === '/v1/chat' && method === 'POST') {
    const auth = String(req.headers.authorization || '');
    const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const rec = key.startsWith('xy_live_') ? db.apiKeys.find((k) => k.hash === sha(key) && !k.revoked) : null;
    if (!rec) { await send(res, 401, { error: { type: 'invalid_key', message: 'Missing or invalid API key. Send  Authorization: Bearer xy_live_...' } }); return true; }
    const owner = db.users.find((u) => u.id === rec.userId);
    if (!owner || owner.banned) { await send(res, 403, { error: { type: 'account_disabled', message: 'This account is not active.' } }); return true; }
    const premium = admin(owner) || isPremiumUser(owner);
    const t = Date.now();
    rec.window = (rec.window || []).filter((x) => t - x < 60000);
    if (rec.window.length >= (premium ? num('API_PREMIUM_PER_MIN', 40) : num('API_FREE_PER_MIN', 6))) { await send(res, 429, { error: { type: 'rate_limited', message: 'Too many requests per minute.' } }, { 'Retry-After': '30' }); return true; }
    if (rec.dayKey !== today()) { rec.dayKey = today(); rec.dayCount = 0; }
    const dayLimit = premium ? num('API_PREMIUM_DAILY', 3000) : num('API_FREE_DAILY', 100);
    if (rec.dayCount >= dayLimit) { await send(res, 429, { error: { type: 'daily_limit', message: `Daily limit of ${dayLimit} requests reached. It resets at midnight UTC.` } }); return true; }
    let msgs = [];
    if (Array.isArray(data.messages)) msgs = data.messages.slice(-20).map((m) => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String(m && m.content || '').slice(0, 8000) })).filter((m) => m.content.trim());
    else if (typeof data.input === 'string' && data.input.trim()) msgs = [{ role: 'user', content: data.input.slice(0, 8000) }];
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') { await send(res, 400, { error: { type: 'bad_request', message: 'Send "input" (a string) or "messages" ending with a user message.' } }); return true; }
    rec.window.push(t); rec.dayCount++; rec.lastUsed = now(); rec.totalCalls = (rec.totalCalls || 0) + 1;
    const system = typeof data.system === 'string' ? data.system.slice(0, 2000) : '';
    try {
      const out = await Promise.race([ai(msgs, system, { fallback: true, premium }), new Promise((_, rej) => setTimeout(() => rej(new Error('The AI took too long to answer.')), 90000))]);
      const text = String(out || '').trim();
      if (!text) throw new Error('The AI sent an empty reply.');
      await save();
      await send(res, 200, { id: 'resp_' + rand(6), model: 'xyron', output: text, usage: { requests_today: rec.dayCount, daily_limit: dayLimit } });
    } catch (e) { rec.dayCount = Math.max(0, rec.dayCount - 1); await send(res, 502, { error: { type: 'upstream_failed', message: String(e.message || 'The AI is unavailable right now.').slice(0, 200) } }); }
    return true;
  }

  const ours = p.startsWith('/api/share/') || p.startsWith('/api/referral/') || p.startsWith('/api/devkeys');
  if (!ours) return false;
  if (!me) { await send(res, 401, { message: 'Sign in first.' }); return true; }

  // ---- chat sharing (owner) ---------------------------------------------------------------------------------------
  if (p === '/api/share/create' && method === 'POST') {
    const convo = db.conversations.find((x) => x.id === String(data.conversationId || '') && (x.userId === me.id || x.owner_id === me.id || x.client_id === me.id));
    if (!convo) { await send(res, 404, { message: 'Chat not found.' }); return true; }
    const msgs = snapshotMessages(db.messages.filter((m) => m.conversation_id === convo.id).sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || ''))));
    if (!msgs.length) { await send(res, 400, { message: 'This chat has no messages to share yet.' }); return true; }
    if (db.shares.filter((s) => s.userId === me.id && !s.revoked).length >= 100) { await send(res, 429, { message: 'You have 100 active shared links. Remove some first.' }); return true; }
    const title = String(convo.title || convo.name || 'Shared chat').slice(0, 100);
    const s = { token: rand(14), userId: me.id, conversationId: convo.id, title, messages: msgs, created_date: now(), views: 0 };
    db.shares.unshift(s); await save();
    await send(res, 200, { token: s.token, path: `/s/${s.token}` });
    return true;
  }
  if (p === '/api/share/mine' && method === 'GET') {
    await send(res, 200, { shares: db.shares.filter((s) => s.userId === me.id && !s.revoked).map((s) => ({ token: s.token, title: s.title, created_date: s.created_date, views: s.views || 0, count: s.messages.length })) });
    return true;
  }
  if (p === '/api/share/revoke' && method === 'POST') {
    const s = db.shares.find((x) => x.token === String(data.token || '') && x.userId === me.id);
    if (!s) { await send(res, 404, { message: 'Link not found.' }); return true; }
    s.revoked = true; s.messages = []; await save();
    await send(res, 200, { ok: true });
    return true;
  }

  // ---- referral ---------------------------------------------------------------------------------------------------
  const days = num('REFERRAL_DAYS', 3), maxInv = num('REFERRAL_MAX', 10);
  if (p === '/api/referral/me' && method === 'GET') {
    const mine = db.referrals.filter((r) => r.referrerId === me.id);
    await send(res, 200, { code: refCodeFor(me), invited: mine.length, rewarded: Math.min(mine.length, maxInv), daysPerInvite: days, maxInvites: maxInv, daysEarned: Math.min(mine.length, maxInv) * days });
    return true;
  }
  if (p === '/api/referral/claim' && method === 'POST') {
    const code = String(data.code || '').trim().toUpperCase().slice(0, 12);
    if (db.referrals.some((r) => r.inviteeId === me.id)) { await send(res, 200, { ok: false, reason: 'already_claimed' }); return true; }
    if (Date.now() - Date.parse(me.created_date || 0) > 48 * 3600 * 1000) { await send(res, 200, { ok: false, reason: 'account_too_old' }); return true; }
    const referrer = code && db.users.find((u) => u.id !== me.id && !u.banned && refCodeFor(u) === code);
    if (!referrer) { await send(res, 200, { ok: false, reason: 'invalid_code' }); return true; }
    if (db.referrals.filter((r) => r.referrerId === referrer.id).length >= maxInv) { await send(res, 200, { ok: false, reason: 'referrer_full' }); return true; }
    db.referrals.push({ id: id(), referrerId: referrer.id, inviteeId: me.id, created_date: now() });
    grantDays(c, me.id, days, 'referral'); grantDays(c, referrer.id, days, 'referral');
    if (c.addCoins) { const n = Number(process.env.REFERRAL_COINS) || 5; c.addCoins(me, n, 'referral', 'Joined with an invite'); c.addCoins(referrer, n, 'referral', 'A friend joined with your invite'); }
    await save();
    await send(res, 200, { ok: true, days });
    return true;
  }

  // ---- developer keys ---------------------------------------------------------------------------------------------
  if (p === '/api/devkeys' && method === 'GET') {
    const premium = admin(me) || isPremiumUser(me);
    await send(res, 200, { premium, dailyLimit: premium ? num('API_PREMIUM_DAILY', 3000) : num('API_FREE_DAILY', 100), perMinute: premium ? num('API_PREMIUM_PER_MIN', 40) : num('API_FREE_PER_MIN', 6), keys: db.apiKeys.filter((k) => k.userId === me.id && !k.revoked).map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, created_date: k.created_date, lastUsed: k.lastUsed || null, calls: k.totalCalls || 0, today: k.dayKey === today() ? k.dayCount || 0 : 0 })) });
    return true;
  }
  if (p === '/api/devkeys/create' && method === 'POST') {
    if (db.apiKeys.filter((k) => k.userId === me.id && !k.revoked).length >= 5) { await send(res, 403, { message: 'You can have up to 5 API keys. Revoke one first.' }); return true; }
    const key = 'xy_live_' + crypto.randomBytes(24).toString('hex');
    const rec = { id: id(), userId: me.id, name: String(data.name || '').trim().slice(0, 40) || 'My key', hash: sha(key), prefix: key.slice(0, 12) + '…' + key.slice(-4), created_date: now() };
    db.apiKeys.unshift(rec); await save();
    await send(res, 200, { key, id: rec.id, name: rec.name }); // shown once; only a hash is stored
    return true;
  }
  if (p === '/api/devkeys/revoke' && method === 'POST') {
    const k = db.apiKeys.find((x) => x.id === String(data.id || '') && x.userId === me.id);
    if (!k) { await send(res, 404, { message: 'Key not found.' }); return true; }
    k.revoked = true; await save();
    await send(res, 200, { ok: true });
    return true;
  }
  await send(res, 404, { message: 'Not found.' });
  return true;
}
