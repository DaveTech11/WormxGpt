// Social, trust & safety and payment features that sit AROUND the AI and never change it:
//   Social    prompt gallery · weekly game leaderboard · team workspaces
//   Safety    two-factor login (authenticator app / Telegram code) · login history + device sign-out · data export
//   Payments  pay-as-you-go day passes bought from the wallet · automatic receipts + payment history
// (The chat lock is 100% on the phone/browser - see src/lib/chatLock.js.)
//
// Env (all optional): PASS_DAY_NGN (300), PASS_WEEK_NGN (1500), PROMPTS_PER_DAY (10), TEAM_MAX_OWNED (5), TEAM_MAX_MEMBERS (25),
//                     GAME_MAX_PER_DAY (150), TWOFA_ISSUER (Wormx GPT)
// Secrets for 2FA are encrypted with the same key the bot tokens use (BOT_TOKEN_KEY / SESSION_SECRET).
import crypto from 'node:crypto';
import { encToken, decToken } from './userbots.mjs';

const num = (k, d) => Number(process.env[k]) || d;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n) => crypto.randomBytes(n).toString('base64url');
const DAY = 86400000;
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const firstName = (u) => String((u && u.full_name) || '').trim().split(/\s+/)[0].slice(0, 20) || 'Member';
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// ======================================================================================================================
// TOTP (RFC 6238: HMAC-SHA1, 30 s steps, 6 digits) - works with Google Authenticator, Authy, 1Password, Microsoft Authenticator...
// ======================================================================================================================
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const byte of buf) { val = (val << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function b32decode(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totpCode(secretB32, step) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secretB32)).update(buf).digest();
  const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
// Returns the step that matched (so it can be remembered and never accepted twice), or 0.
export function totpCheck(secretB32, code, lastStep = 0, nowMs = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return 0;
  const cur = Math.floor(nowMs / 30000);
  for (const d of [0, -1, 1]) { const s = cur + d; if (s > lastStep && safeEq(totpCode(secretB32, s), c)) return s; }
  return 0;
}
export const makeTotpSecret = () => b32encode(crypto.randomBytes(20));
export const otpauthUri = (secret, account) => {
  const issuer = process.env.TWOFA_ISSUER || 'Wormx GPT';
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
};

// ======================================================================================================================
// Security records (kept OUT of the user object on purpose: /api/auth/me returns the user, so secrets must never live there)
// ======================================================================================================================
const secOf = (db, uid) => { db.security = db.security || {}; return db.security[uid] || (db.security[uid] = {}); };
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const normBackup = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function newBackupCodes(sec) {
  const salt = rand(8), codes = [];
  for (let i = 0; i < 8; i++) { let c = ''; for (let j = 0; j < 10; j++) c += BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)]; codes.push(c); }
  sec.backup = { salt, list: codes.map((c) => ({ h: sha(salt + c), used: false })) };
  return codes.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`);
}
const backupLeft = (sec) => (sec.backup ? sec.backup.list.filter((x) => !x.used).length : 0);
function useBackup(sec, code) {
  const c = normBackup(code);
  if (c.length !== 10 || !sec.backup) return false;
  const h = sha(sec.backup.salt + c);
  const hit = sec.backup.list.find((x) => !x.used && safeEq(x.h, h));
  if (!hit) return false;
  hit.used = true; return true;
}
export function twofaMethods(db, u) {
  const sec = (db.security || {})[u.id];
  if (!sec) return [];
  const m = [];
  if (sec.totp && sec.totp.enabled) m.push('totp');
  if (sec.telegram && sec.telegram.enabled && u.telegramChatId) m.push('telegram');
  if (m.length && backupLeft(sec) > 0) m.push('backup');
  return m;
}
export const mfaRequired = (db, u) => twofaMethods(db, u).some((m) => m !== 'backup');

// Telegram one-time code (used to enable Telegram 2FA, to sign in, and to confirm sensitive changes).
async function sendTgCode(c, u, why) {
  const { db, tgSend, tgReady } = c;
  if (!tgReady) return { error: 'Telegram codes are not set up on this server yet.', status: 501 };
  if (!u.telegramChatId) return { error: 'Link your Telegram first (Settings → Security → Send codes to Telegram).', status: 400 };
  const sec = secOf(db, u.id), t = Date.now();
  sec.tgSends = (sec.tgSends || []).filter((x) => t - x < 600000);
  if (sec.tgSends.length >= 3) return { error: 'Too many codes requested. Wait a few minutes.', status: 429 };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), salt = rand(8);
  sec.tgCode = { h: sha(salt + code), salt, exp: t + 5 * 60000, tries: 0 };
  sec.tgSends.push(t);
  try { await tgSend(u.telegramChatId, `Your Wormx GPT ${why} code is ${code}. It expires in 5 minutes. If this was not you, ignore this message and change your password.`); }
  catch { return { error: 'Could not send the Telegram message. Make sure you have not blocked the Wormx GPT bot.', status: 502 }; }
  return { ok: true };
}
function checkTgCode(sec, code) {
  const x = sec.tgCode, c = String(code || '').replace(/\s/g, '');
  if (!x || Date.now() > x.exp || !/^\d{6}$/.test(c)) return false;
  if (x.tries >= 5) { sec.tgCode = null; return false; }
  x.tries++;
  if (!safeEq(sha(x.salt + c), x.h)) return false;
  sec.tgCode = null; return true;
}
// Accepts ANY valid second factor: authenticator code, Telegram code or a backup code.
function verifySecond(db, u, code, method) {
  const sec = secOf(db, u.id), m = twofaMethods(db, u);
  if ((method === 'totp' || !method) && m.includes('totp')) { const s = totpCheck(decToken(sec.totp.enc), code, sec.totp.lastStep || 0); if (s) { sec.totp.lastStep = s; return true; } }
  if ((method === 'telegram' || !method) && m.includes('telegram') && checkTgCode(sec, code)) return true;
  if ((method === 'backup' || !method) && m.includes('backup') && useBackup(sec, code)) return true;
  return false;
}

// ======================================================================================================================
// Sessions & login history
// ======================================================================================================================
export const sessionHandle = (sid) => sha('xyron-session:' + sid).slice(0, 20); // the real session id is the cookie value and is NEVER sent to the browser
export function describeDevice(ua) {
  const s = String(ua || '');
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iOS/i.test(s) ? 'iPhone/iPad' : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'Mac' : /Linux/i.test(s) ? 'Linux' : 'Unknown device';
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /XyronApp|wv\)/.test(s) ? 'Wormx GPT app' : 'Browser';
  return `${br} on ${os}`;
}
export function sessionMeta(req, ip) { return { ip: clip(ip || '', 64), ua: clip((req && req.headers && req.headers['user-agent']) || '', 300) }; }
export function logLogin(db, now, rec) {
  db.loginLog = db.loginLog || [];
  db.loginLog.push({ id: crypto.randomUUID(), at: now(), ...rec });
  let mine = 0;
  for (let i = db.loginLog.length - 1; i >= 0; i--) if (db.loginLog[i].userId === rec.userId && ++mine > 30) db.loginLog.splice(i, 1);
  if (db.loginLog.length > 5000) db.loginLog.splice(0, db.loginLog.length - 5000);
}
export function touchSession(db, sid, req, ip, now) {
  const s = db.sessions.find((x) => x.id === sid);
  if (!s || s.mfaPending) return false;
  const t = Date.now();
  if (s.lastSeen && t - Date.parse(s.lastSeen) < 300000) return false; // at most every 5 minutes
  s.lastSeen = now(); if (ip) s.ip = clip(ip, 64);
  if (!s.ua && req && req.headers) s.ua = clip(req.headers['user-agent'] || '', 300);
  return true;
}

// ======================================================================================================================
// Receipts
// ======================================================================================================================
const CHANNELS = { card: 'Card', bank_transfer: 'Bank transfer', banktransfer: 'Bank transfer', ussd: 'USSD', account: 'Bank account', mobilemoney: 'Mobile money', opay: 'OPay wallet (mobile money)', crypto: 'Crypto', wallet: 'Wormx GPT wallet' };
const METHOD_LABEL = { flutterwave: 'Flutterwave', opay: 'OPay', crypto: 'Crypto', wallet: 'Wormx GPT wallet' };
const channelLabel = (m, ch) => { const k = String(ch || '').toLowerCase().replace(/[\s-]/g, '_'); return CHANNELS[k] || (k.startsWith('mobile') ? 'Mobile money' : '') || CHANNELS[m] || ''; };
const receiptNo = (id, at) => `RCT-${String(at).slice(0, 10).replace(/-/g, '')}-${sha(id).slice(0, 6).toUpperCase()}`;
const planTitle = (order) => (order.kind === 'topup' ? 'Wallet top-up' : order.tier === 'premium_plus' ? 'Premium+ plan (30 days)' : 'Premium plan (30 days)');
export function issueReceipt(db, helpers, rec) {
  db.receipts = db.receipts || [];
  const { id, now } = helpers;
  if (rec.orderId && db.receipts.some((r) => r.orderId === rec.orderId)) return db.receipts.find((r) => r.orderId === rec.orderId);
  const at = rec.at || now(), rid = id();
  const r = { id: rid, no: receiptNo(rid, at), status: 'paid', at, ...rec };
  db.receipts.unshift(r);
  if (db.receipts.length > 20000) db.receipts.length = 20000;
  return r;
}
export function receiptForOrder(db, helpers, order) {
  return issueReceipt(db, helpers, {
    userId: order.userId, orderId: order.id, kind: order.kind === 'topup' ? 'topup' : 'plan', title: planTitle(order),
    amountNgn: order.amount || 0, amountUsd: order.usd || 0, creditNgn: order.kind === 'topup' ? Number(order.credit) || 0 : 0,
    method: order.method, methodLabel: METHOD_LABEL[order.method] || order.method, channel: channelLabel(order.method, order.channel),
    reference: order.reference, at: order.paid_date || helpers.now(),
  });
}
const publicReceipt = (r, user) => ({ ...r, customer: user ? { name: user.full_name || '', email: user.email || '' } : undefined });

// ======================================================================================================================
// Games
// ======================================================================================================================
const GAME_MAX = { ttt: 10, memory: 15, blackjack: 10, war: 20, ludo: 30, chess: 40, riddles: 10, trivia: 20, guess: 15 };
export const weekStart = (t = Date.now()) => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; };
export const weekKey = (t) => weekStart(t).toISOString().slice(0, 10);
const lastScoreAt = new Map();

// ======================================================================================================================
// Passes (pay-as-you-go)
// ======================================================================================================================
export const passes = () => [
  { id: 'day1', days: 1, priceNgn: num('PASS_DAY_NGN', 300), label: '1-day Premium pass' },
  { id: 'week1', days: 7, priceNgn: num('PASS_WEEK_NGN', 1500), label: '7-day Premium pass' },
];
function grantDays(c, userId, days, provider) {
  const { db, id, now } = c; const t = Date.now();
  const cur = db.subscriptions.find((s) => (s.userId === userId || s.client_id === userId) && s.status === 'active' && s.expires_at && Date.parse(s.expires_at) > t);
  if (cur) { cur.expires_at = new Date(Date.parse(cur.expires_at) + days * DAY).toISOString(); cur.updated_date = now(); return cur; }
  const sub = { id: id(), userId, client_id: userId, tier: 'premium', status: 'active', provider, created_date: now(), updated_date: now(), expires_at: new Date(t + days * DAY).toISOString() };
  db.subscriptions.unshift(sub); return sub;
}
const buying = new Set();

// ======================================================================================================================
// The router.  c = { p, method, data, me, req, res, db, save, saveSoon, send, id, now, admin, isPremiumUser, ip, cookies, safeUser,
//                    walletOf, tgSend, tgReady, emailReceipt }   ->  true when handled
// ======================================================================================================================
export async function handleFeatures(c) {
  const { p, method, data, me, req, res, db, save, saveSoon, send, id, now, admin } = c;
  const sub = (pre) => p === pre || p.startsWith(pre + '/');
  const mine = sub('/api/prompts') || sub('/api/games') || sub('/api/teams') || sub('/api/2fa') || sub('/api/sessions') || p === '/api/login-history'
    || p === '/api/export' || sub('/api/credits') || sub('/api/payments/history') || sub('/api/payments/receipt') || sub('/api/auth/2fa');
  if (!mine) return false;
  const q = new URL(req.url, 'http://x').searchParams;
  const fail = (status, message) => send(res, status, { message }).then(() => true);
  const ok = (body, headers) => send(res, 200, body, headers).then(() => true);

  // ---- public reads (no sign-in) -----------------------------------------------------------------------------------
  if (p === '/api/prompts' && method === 'GET') {
    db.prompts = db.prompts || [];
    const sort = q.get('sort') === 'new' ? 'new' : 'top', cat = clip(q.get('category') || '', 30), term = clip(q.get('q') || '', 60).toLowerCase();
    let list = db.prompts.filter((x) => !x.hidden);
    if (q.get('mine') === '1' && me) list = db.prompts.filter((x) => x.userId === me.id);
    if (cat && cat !== 'all') list = list.filter((x) => x.category === cat);
    if (term) list = list.filter((x) => (x.title + ' ' + x.text).toLowerCase().includes(term));
    list = list.slice().sort((a, b) => (sort === 'new' ? String(b.created_date).localeCompare(String(a.created_date)) : ((b.likes || []).length * 3 + (b.copies || 0)) - ((a.likes || []).length * 3 + (a.copies || 0)) || String(b.created_date).localeCompare(String(a.created_date))));
    const page = Math.max(0, Number(q.get('page')) || 0), per = 24;
    return ok({
      total: list.length, page,
      prompts: list.slice(page * per, page * per + per).map((x) => ({ id: x.id, title: x.title, text: x.text, category: x.category, author: x.authorName, likes: (x.likes || []).length, copies: x.copies || 0, liked: Boolean(me && (x.likes || []).includes(me.id)), mine: Boolean(me && x.userId === me.id), created_date: x.created_date })),
    });
  }
  if (p === '/api/games/leaderboard' && method === 'GET') {
    const game = clip(q.get('game') || 'all', 20), wk = weekKey();
    const rows = (db.gameScores || []).filter((x) => x.week === wk && (game === 'all' || x.game === game));
    const by = new Map();
    for (const r of rows) { const e = by.get(r.userId) || { userId: r.userId, points: 0, plays: 0 }; e.points += r.points; e.plays += r.plays; by.set(r.userId, e); }
    const ranked = [...by.values()].sort((a, b) => b.points - a.points || a.plays - b.plays).map((e, i) => ({ ...e, rank: i + 1 }));
    const nameOf = (uid) => firstName(db.users.find((u) => u.id === uid));
    const mineRow = me ? ranked.find((e) => e.userId === me.id) : null;
    return ok({ game, week: wk, endsAt: new Date(weekStart().getTime() + 7 * DAY).toISOString(), top: ranked.slice(0, 10).map((e) => ({ rank: e.rank, name: nameOf(e.userId), points: e.points, plays: e.plays, me: Boolean(me && e.userId === me.id) })), me: mineRow ? { rank: mineRow.rank, points: mineRow.points, plays: mineRow.plays } : null, players: ranked.length });
  }

  // ---- everything below: pending-sign-in 2FA (cookie holds a "pending" session, no user yet) ----------------------------
  if (sub('/api/auth/2fa')) {
    const sid = (c.cookies || {}).xyron_session, s = sid && db.sessions.find((x) => x.id === sid && x.mfaPending);
    if (!s) return ok({ pending: false });
    const u = db.users.find((x) => x.id === s.userId);
    if (!u || u.banned || Date.now() > (s.mfaExpires || 0)) { db.sessions = db.sessions.filter((x) => x !== s); await save(); return fail(401, 'This sign-in expired. Please sign in again.'); }
    const methods = twofaMethods(db, u);
    if (p === '/api/auth/2fa/state' && method === 'GET') return ok({ pending: true, methods, email: u.email ? u.email.replace(/^(.).*(@.*)$/, '$1***$2') : '' });
    if (p === '/api/auth/2fa/send' && method === 'POST') {
      if (!methods.includes('telegram')) return fail(400, 'Telegram codes are not turned on for this account.');
      const r = await sendTgCode(c, u, 'sign-in'); await save();
      return r.error ? fail(r.status, r.error) : ok({ ok: true });
    }
    if (p === '/api/auth/2fa/verify' && method === 'POST') {
      s.mfaTries = (s.mfaTries || 0) + 1;
      if (s.mfaTries > 8) { db.sessions = db.sessions.filter((x) => x !== s); logLogin(db, now, { userId: u.id, ip: c.ip, ua: s.ua, method: s.via || 'login', result: '2fa_blocked' }); await save(); return fail(429, 'Too many wrong codes. Please sign in again.'); }
      const good = verifySecond(db, u, data.code, ['totp', 'telegram', 'backup'].includes(data.method) ? data.method : '');
      if (!good) { logLogin(db, now, { userId: u.id, ip: c.ip, ua: s.ua, method: s.via || 'login', result: '2fa_fail' }); await save(); return fail(401, 'That code is not right. Try again.'); }
      delete s.mfaPending; delete s.mfaExpires; delete s.mfaTries; s.lastSeen = now();
      logLogin(db, now, { userId: u.id, ip: s.ip, ua: s.ua, method: s.via || 'login', result: '2fa_ok' });
      await save();
      return ok({ user: c.safeUser(u), backupLeft: backupLeft(secOf(db, u.id)) });
    }
    return fail(404, 'Not found.');
  }

  if (!me) return fail(401, 'Sign in first.');

  // ---- prompt gallery -----------------------------------------------------------------------------------------------
  if (sub('/api/prompts')) {
    db.prompts = db.prompts || [];
    if (p === '/api/prompts/create' && method === 'POST') {
      const title = clip(data.title, 80).trim(), text = clip(data.text, 4000).trim(), cat = clip(data.category || 'general', 30).trim().toLowerCase() || 'general';
      if (title.length < 3) return fail(400, 'Give your prompt a title (at least 3 letters).');
      if (text.length < 10) return fail(400, 'The prompt is too short.');
      if (db.prompts.some((x) => x.userId === me.id && x.text === text)) return fail(409, 'You already shared this prompt.');
      const today = db.prompts.filter((x) => x.userId === me.id && Date.now() - Date.parse(x.created_date) < DAY).length;
      if (today >= num('PROMPTS_PER_DAY', 10) && !admin(me)) return fail(429, 'You shared a lot today. Try again tomorrow.');
      const pr = { id: id(), userId: me.id, authorName: firstName(me), title, text, category: cat, likes: [], copies: 0, reports: [], created_date: now() };
      db.prompts.unshift(pr); await save();
      return ok({ ok: true, id: pr.id });
    }
    const pr = db.prompts.find((x) => x.id === clip(data.id, 80));
    if (!pr) return fail(404, 'Prompt not found.');
    if (p === '/api/prompts/like' && method === 'POST') {
      pr.likes = pr.likes || []; const i = pr.likes.indexOf(me.id);
      if (i >= 0) pr.likes.splice(i, 1); else pr.likes.push(me.id);
      await saveSoon(); return ok({ liked: i < 0, likes: pr.likes.length });
    }
    if (p === '/api/prompts/copy' && method === 'POST') {
      // one count per person per prompt, so nobody can inflate the ranking by pressing Copy repeatedly
      pr.copiedBy = pr.copiedBy || [];
      if (!pr.copiedBy.includes(me.id)) { pr.copiedBy.push(me.id); pr.copies = (pr.copies || 0) + 1; await saveSoon(); }
      return ok({ copies: pr.copies || 0 });
    }
    if (p === '/api/prompts/report' && method === 'POST') {
      pr.reports = pr.reports || [];
      if (!pr.reports.includes(me.id)) pr.reports.push(me.id);
      if (pr.reports.length >= 3) pr.hidden = true; // hidden until an admin looks at it
      await save(); return ok({ ok: true });
    }
    if (p === '/api/prompts/delete' && method === 'POST') {
      if (pr.userId !== me.id && !admin(me)) return fail(403, 'You can only delete your own prompts.');
      db.prompts = db.prompts.filter((x) => x !== pr); await save(); return ok({ ok: true });
    }
    return fail(404, 'Not found.');
  }

  // ---- game scores ---------------------------------------------------------------------------------------------------
  if (p === '/api/games/score' && method === 'POST') {
    const game = clip(data.game, 20), pts = Math.floor(Number(data.points));
    if (!GAME_MAX[game]) return fail(400, 'Unknown game.');
    if (!Number.isFinite(pts) || pts < 1) return fail(400, 'Nothing to score.');
    const t = Date.now(), last = lastScoreAt.get(me.id) || 0;
    if (t - last < 4000) return ok({ ok: false, reason: 'too_fast' }); // a real round takes longer than this
    lastScoreAt.set(me.id, t); if (lastScoreAt.size > 5000) lastScoreAt.delete(lastScoreAt.keys().next().value);
    db.gameScores = db.gameScores || [];
    const wk = weekKey(), mineRows = db.gameScores.filter((x) => x.userId === me.id && x.week === wk);
    if (mineRows.reduce((n, r) => n + r.plays, 0) >= num('GAME_MAX_PER_DAY', 150) * 7) return ok({ ok: false, reason: 'limit' });
    const add = Math.min(pts, GAME_MAX[game]);
    let row = mineRows.find((x) => x.game === game);
    if (!row) { row = { userId: me.id, week: wk, game, points: 0, plays: 0, best: 0 }; db.gameScores.push(row); }
    row.points += add; row.plays += 1; row.best = Math.max(row.best, add); row.updated = now();
    const keep = weekKey(t - 6 * 7 * DAY); db.gameScores = db.gameScores.filter((x) => x.week >= keep); // keep 6 weeks
    await saveSoon();
    return ok({ ok: true, added: add });
  }

  // ---- team workspaces ------------------------------------------------------------------------------------------------
  if (sub('/api/teams')) {
    db.workspaces = db.workspaces || [];
    const maxOwned = num('TEAM_MAX_OWNED', 5), maxMembers = num('TEAM_MAX_MEMBERS', 25), maxItems = 100;
    const memberOf = (ws) => ws.members.find((m) => m.userId === me.id);
    const nameOf = (uid) => { const u = db.users.find((x) => x.id === uid); return u ? (u.full_name || firstName(u)) : 'Former member'; };
    const view = (ws, full) => ({
      id: ws.id, name: ws.name, role: memberOf(ws).role, ownerName: nameOf(ws.ownerId), created_date: ws.created_date,
      code: memberOf(ws).role === 'owner' ? ws.code : undefined,
      members: ws.members.map((m) => ({ userId: m.userId, name: nameOf(m.userId), role: m.role, you: m.userId === me.id })),
      items: full ? ws.items.map((i) => ({ id: i.id, type: i.type, title: i.title, sharedBy: nameOf(i.sharedBy), mine: i.sharedBy === me.id, at: i.at, count: i.type === 'chat' ? (i.payload.messages || []).length : undefined, url: i.type === 'project' ? i.payload.url : undefined })) : undefined,
    });
    if (p === '/api/teams' && method === 'GET') return ok({ teams: db.workspaces.filter((w) => memberOf(w)).map((w) => ({ id: w.id, name: w.name, role: memberOf(w).role, members: w.members.length, items: w.items.length })) });
    if (p === '/api/teams/create' && method === 'POST') {
      const name = clip(data.name, 50).trim();
      if (name.length < 2) return fail(400, 'Give the team a name.');
      if (db.workspaces.filter((w) => w.ownerId === me.id).length >= maxOwned) return fail(403, `You can own up to ${maxOwned} teams.`);
      const ws = { id: id(), name, ownerId: me.id, code: rand(6).replace(/[-_]/g, 'x').slice(0, 8).toUpperCase(), members: [{ userId: me.id, role: 'owner', joined: now() }], items: [], created_date: now() };
      db.workspaces.unshift(ws); await save(); return ok({ id: ws.id });
    }
    if (p === '/api/teams/join' && method === 'POST') {
      const code = clip(data.code, 12).trim().toUpperCase();
      const ws = code && db.workspaces.find((w) => safeEq(w.code, code));
      if (!ws) return fail(404, 'That invite code is not valid. Ask the team owner for a new one.');
      if (memberOf(ws)) return ok({ id: ws.id, already: true });
      if (ws.members.length >= maxMembers) return fail(403, 'This team is full.');
      ws.members.push({ userId: me.id, role: 'member', joined: now() }); await save(); return ok({ id: ws.id });
    }
    const ws = db.workspaces.find((w) => w.id === clip(data.id || data.teamId || q.get('id') || q.get('teamId'), 80));
    if (!ws || !memberOf(ws)) return fail(404, 'Team not found.');
    const owner = memberOf(ws).role === 'owner';
    if (p === '/api/teams/get' && method === 'GET') return ok({ team: view(ws, true) });
    if (p === '/api/teams/item' && method === 'GET') {
      const it = ws.items.find((i) => i.id === clip(q.get('itemId'), 80));
      if (!it) return fail(404, 'Item not found.');
      return ok({ item: { id: it.id, type: it.type, title: it.title, sharedBy: nameOf(it.sharedBy), at: it.at, payload: it.payload } });
    }
    if (p === '/api/teams/leave' && method === 'POST') {
      if (owner) return fail(400, 'You own this team. Delete it instead, or remove the other members first.');
      ws.members = ws.members.filter((m) => m.userId !== me.id); ws.items = ws.items.filter((i) => i.sharedBy !== me.id); await save(); return ok({ ok: true });
    }
    if (p === '/api/teams/remove-member' && method === 'POST') {
      if (!owner) return fail(403, 'Only the owner can remove people.');
      const uid = clip(data.userId, 80);
      if (uid === me.id) return fail(400, 'You cannot remove yourself.');
      ws.members = ws.members.filter((m) => m.userId !== uid); ws.items = ws.items.filter((i) => i.sharedBy !== uid); await save(); return ok({ ok: true });
    }
    if (p === '/api/teams/new-code' && method === 'POST') { if (!owner) return fail(403, 'Only the owner can do this.'); ws.code = rand(6).replace(/[-_]/g, 'x').slice(0, 8).toUpperCase(); await save(); return ok({ code: ws.code }); }
    if (p === '/api/teams/rename' && method === 'POST') { if (!owner) return fail(403, 'Only the owner can do this.'); const n = clip(data.name, 50).trim(); if (n.length < 2) return fail(400, 'Give the team a name.'); ws.name = n; await save(); return ok({ ok: true }); }
    if (p === '/api/teams/delete' && method === 'POST') { if (!owner) return fail(403, 'Only the owner can delete the team.'); db.workspaces = db.workspaces.filter((w) => w !== ws); await save(); return ok({ ok: true }); }
    if (p === '/api/teams/share' && method === 'POST') {
      const type = clip(data.type, 10), refId = clip(data.refId, 120);
      let payload, title;
      if (type === 'chat') {
        const convo = db.conversations.find((x) => x.id === refId && (x.userId === me.id || x.owner_id === me.id || x.client_id === me.id));
        if (!convo) return fail(404, 'Chat not found.');
        const msgs = db.messages.filter((m) => m.conversation_id === convo.id).sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')))
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-200).map((m) => ({ role: m.role, content: clip(m.content, 20000) }));
        if (!msgs.length) return fail(400, 'This chat has no messages to share yet.');
        title = clip(convo.title || convo.name || 'Shared chat', 100); payload = { messages: msgs };
      } else if (type === 'project') {
        const site = (db.hosted || []).find((x) => x.userId === me.id && x.id === refId);
        if (!site) return fail(404, 'Project not found.');
        title = clip(site.name, 100); payload = { siteId: site.id, url: `/p/${site.id}/`, files: (site.files || []).length };
      } else if (type === 'bot') {
        const bot = (db.userBots || []).find((x) => x.userId === me.id && x.id === refId);
        if (!bot) return fail(404, 'Bot not found.');
        // never the Telegram token, secret or webhook: only what is needed to see and reuse the personality
        title = clip(bot.name, 100); payload = { name: bot.name, username: bot.username || '', link: bot.username ? `https://t.me/${bot.username}` : '', persona: clip(bot.persona, 3000), greeting: clip(bot.greeting, 500) };
      } else return fail(400, 'You can share a chat, a project or a bot.');
      const old = ws.items.find((i) => i.type === type && i.refId === refId && i.sharedBy === me.id);
      if (old) { old.title = title; old.payload = payload; old.at = now(); }
      else { if (ws.items.length >= maxItems) return fail(403, 'This team already has 100 shared items. Remove some first.'); ws.items.unshift({ id: id(), type, refId, title, sharedBy: me.id, at: now(), payload }); }
      await save(); return ok({ ok: true, updated: Boolean(old) });
    }
    if (p === '/api/teams/unshare' && method === 'POST') {
      const it = ws.items.find((i) => i.id === clip(data.itemId, 80));
      if (!it) return fail(404, 'Item not found.');
      if (it.sharedBy !== me.id && !owner) return fail(403, 'Only the person who shared it, or the owner, can remove it.');
      ws.items = ws.items.filter((i) => i !== it); await save(); return ok({ ok: true });
    }
    return fail(404, 'Not found.');
  }

  // ---- two-factor management -------------------------------------------------------------------------------------------
  if (sub('/api/2fa')) {
    const sec = secOf(db, me.id);
    const status = () => ({ enabled: mfaRequired(db, me), totp: Boolean(sec.totp && sec.totp.enabled), telegram: Boolean(sec.telegram && sec.telegram.enabled && me.telegramChatId), telegramLinked: Boolean(me.telegramChatId), telegramAvailable: Boolean(c.tgReady), backupLeft: backupLeft(sec) });
    if (p === '/api/2fa/status' && method === 'GET') return ok(status());
    if (p === '/api/2fa/totp/begin' && method === 'POST') {
      if (sec.totp && sec.totp.enabled) return fail(409, 'The authenticator app is already on.');
      const secret = makeTotpSecret(); sec.totpPending = { enc: encToken(secret), at: Date.now() }; await save();
      return ok({ secret, uri: otpauthUri(secret, me.email || me.full_name || 'account') });
    }
    if (p === '/api/2fa/totp/confirm' && method === 'POST') {
      const pend = sec.totpPending;
      if (!pend || Date.now() - pend.at > 15 * 60000) return fail(400, 'Start again: this setup expired.');
      const step = totpCheck(decToken(pend.enc), data.code);
      if (!step) return fail(401, 'That code is not right. Check your phone clock and try again.');
      sec.totp = { enc: pend.enc, enabled: true, lastStep: step, since: now() }; delete sec.totpPending;
      const codes = backupLeft(sec) ? null : newBackupCodes(sec);
      logLogin(db, now, { userId: me.id, ip: c.ip, ua: (req.headers['user-agent'] || '').slice(0, 300), method: 'settings', result: '2fa_enabled_totp' });
      await save(); return ok({ ok: true, backupCodes: codes, ...status() });
    }
    if (p === '/api/2fa/telegram/begin' && method === 'POST') {
      const r = await sendTgCode(c, me, 'two-factor setup'); await save();
      return r.error ? fail(r.status, r.error) : ok({ ok: true });
    }
    if (p === '/api/2fa/telegram/confirm' && method === 'POST') {
      if (!checkTgCode(sec, data.code)) { await save(); return fail(401, 'That code is not right or it expired.'); }
      sec.telegram = { enabled: true, since: now() };
      const codes = backupLeft(sec) ? null : newBackupCodes(sec);
      logLogin(db, now, { userId: me.id, ip: c.ip, ua: (req.headers['user-agent'] || '').slice(0, 300), method: 'settings', result: '2fa_enabled_telegram' });
      await save(); return ok({ ok: true, backupCodes: codes, ...status() });
    }
    // For turning things off the person must prove they hold a second factor. If Telegram is the only one, they ask for a code first.
    if (p === '/api/2fa/challenge' && method === 'POST') {
      const r = await sendTgCode(c, me, 'security'); await save();
      return r.error ? fail(r.status, r.error) : ok({ ok: true });
    }
    if (p === '/api/2fa/disable' && method === 'POST') {
      if (!mfaRequired(db, me)) return fail(400, 'Two-factor login is not on.');
      if (!verifySecond(db, me, data.code, '')) { await save(); return fail(401, 'That code is not right.'); }
      delete sec.totp; delete sec.totpPending; delete sec.telegram; delete sec.backup; delete sec.tgCode;
      logLogin(db, now, { userId: me.id, ip: c.ip, ua: (req.headers['user-agent'] || '').slice(0, 300), method: 'settings', result: '2fa_disabled' });
      await save(); return ok({ ok: true, ...status() });
    }
    if (p === '/api/2fa/backup/regenerate' && method === 'POST') {
      if (!mfaRequired(db, me)) return fail(400, 'Turn on two-factor login first.');
      if (!verifySecond(db, me, data.code, '')) { await save(); return fail(401, 'That code is not right.'); }
      const codes = newBackupCodes(sec); await save(); return ok({ ok: true, backupCodes: codes, ...status() });
    }
    return fail(404, 'Not found.');
  }

  // ---- devices + login history ------------------------------------------------------------------------------------------
  if (sub('/api/sessions') || p === '/api/login-history') {
    const cur = (c.cookies || {}).xyron_session;
    if (p === '/api/sessions' && method === 'GET') {
      const list = db.sessions.filter((s) => s.userId === me.id && !s.mfaPending).sort((a, b) => String(b.lastSeen || b.created_date).localeCompare(String(a.lastSeen || a.created_date)));
      return ok({ sessions: list.map((s) => ({ handle: sessionHandle(s.id), device: describeDevice(s.ua), ip: s.ip || '', created_date: s.created_date, lastSeen: s.lastSeen || s.created_date, current: s.id === cur })) });
    }
    if (p === '/api/sessions/revoke' && method === 'POST') {
      const h = clip(data.handle, 40), s = db.sessions.find((x) => x.userId === me.id && sessionHandle(x.id) === h);
      if (!s) return fail(404, 'That device is already signed out.');
      if (s.id === cur) return fail(400, 'That is this device. Use Log out instead.');
      db.sessions = db.sessions.filter((x) => x !== s); await save(); return ok({ ok: true });
    }
    if (p === '/api/sessions/revoke-others' && method === 'POST') {
      const before = db.sessions.length;
      db.sessions = db.sessions.filter((x) => x.userId !== me.id || x.id === cur);
      await save(); return ok({ ok: true, signedOut: before - db.sessions.length });
    }
    if (p === '/api/login-history' && method === 'GET') {
      return ok({ events: (db.loginLog || []).filter((e) => e.userId === me.id).slice(-30).reverse().map((e) => ({ id: e.id, at: e.at, device: describeDevice(e.ua), ip: e.ip || '', method: e.method, result: e.result })) });
    }
    return fail(404, 'Not found.');
  }

  // ---- data export --------------------------------------------------------------------------------------------------------
  if (p === '/api/export' && method === 'GET') {
    db.exportHits = db.exportHits || {};
    const t = Date.now(), hits = (db.exportHits[me.id] || []).filter((x) => t - x < 3600000);
    if (hits.length >= 5) return fail(429, 'You downloaded your data a few times already. Try again in an hour.');
    hits.push(t); db.exportHits[me.id] = hits;
    const convos = db.conversations.filter((x) => x.userId === me.id || x.owner_id === me.id || x.client_id === me.id);
    const ids = new Set(convos.map((x) => x.id)), byConvo = new Map();
    for (const m of db.messages) if (ids.has(m.conversation_id)) (byConvo.get(m.conversation_id) || byConvo.set(m.conversation_id, []).get(m.conversation_id)).push(m);
    const chats = convos.map((cv) => ({
      id: cv.id, title: cv.title || cv.name || 'Untitled chat', created: cv.created_date, updated: cv.updated_date,
      messages: (byConvo.get(cv.id) || []).sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || ''))).map((m) => ({ role: m.role, at: m.created_date, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''), attachments: Array.isArray(m.files) ? m.files.map((f) => f && (f.name || f.file_name)).filter(Boolean) : undefined })),
    })).sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    const stamp = new Date().toISOString().slice(0, 10);
    if (q.get('format') === 'md') {
      let md = `# Wormx GPT chats - ${me.email || me.full_name || ''}\n\nExported ${new Date().toISOString()}\n\n`;
      for (const ch of chats) { md += `\n---\n\n## ${ch.title}\n\n_${ch.created || ''}_\n\n`; for (const m of ch.messages) md += `**${m.role === 'user' ? 'You' : 'Wormx GPT'}:**\n\n${m.content}\n\n`; }
      await save();
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="xyron-chats-${stamp}.md"`, 'Cache-Control': 'no-store' }); res.end(md); return true;
    }
    await save();
    return ok({ exportedAt: now(), account: { name: me.full_name || '', email: me.email || '', created: me.created_date }, chatCount: chats.length, chats, memories: db.memories.filter((x) => x.userId === me.id).map((x) => ({ text: x.content || x.text || x.memory || '', created: x.created_date })) },
      { 'Content-Disposition': `attachment; filename="xyron-chats-${stamp}.json"`, 'Cache-Control': 'no-store' });
  }

  // ---- pay-as-you-go credits (day passes paid from the wallet) -------------------------------------------------------------
  if (sub('/api/credits')) {
    const w = c.walletOf(me.id);
    if (p === '/api/credits' && method === 'GET') {
      const cur = db.subscriptions.find((s) => (s.userId === me.id || s.client_id === me.id) && s.status === 'active' && (!s.expires_at || Date.parse(s.expires_at) > Date.now()));
      return ok({ balanceNgn: w.balance, passes: passes(), premiumUntil: cur ? cur.expires_at || null : null, tier: cur ? cur.tier : null });
    }
    if (p === '/api/credits/buy-pass' && method === 'POST') {
      const pass = passes().find((x) => x.id === clip(data.passId, 20));
      if (!pass) return fail(400, 'Choose a pass.');
      const cur = db.subscriptions.find((s) => (s.userId === me.id || s.client_id === me.id) && s.status === 'active' && (!s.expires_at || Date.parse(s.expires_at) > Date.now()));
      if (cur && cur.tier !== 'premium') return fail(409, 'You already have a higher plan, so a Premium pass would add nothing.');
      if (cur && !cur.expires_at) return fail(409, 'Your Premium has no end date, so a pass would add nothing.');
      if (buying.has(me.id)) return fail(429, 'A purchase is already in progress.');
      buying.add(me.id);
      try {
        if (w.balance < pass.priceNgn) return send(res, 402, { message: `You need ₦${(pass.priceNgn - w.balance).toLocaleString('en-NG')} more in your wallet. Top up first.`, needNgn: pass.priceNgn - w.balance, balanceNgn: w.balance }).then(() => true);
        w.balance -= pass.priceNgn; // take the money before anything slow, so two tabs can never spend the same balance
        w.ledger.unshift({ id: id(), type: 'pass', amount: -pass.priceNgn, note: pass.label, at: now() }); w.ledger = w.ledger.slice(0, 100);
        const sub2 = grantDays(c, me.id, pass.days, 'wallet');
        const r = issueReceipt(db, { id, now }, { userId: me.id, kind: 'pass', title: pass.label, amountNgn: pass.priceNgn, amountUsd: 0, creditNgn: 0, method: 'wallet', methodLabel: 'Wormx GPT wallet', channel: '', reference: 'PASS-' + sha(id()).slice(0, 10).toUpperCase(), balanceAfterNgn: w.balance });
        await save();
        if (c.emailReceipt) c.emailReceipt(me, r).catch(() => {});
        return ok({ ok: true, balanceNgn: w.balance, premiumUntil: sub2.expires_at, receiptId: r.id });
      } finally { buying.delete(me.id); }
    }
    return fail(404, 'Not found.');
  }

  // ---- payment history + receipts -----------------------------------------------------------------------------------------
  if (p === '/api/payments/history' && method === 'GET') {
    // Orders paid before receipts existed get one now (dated when they were paid), so the history is complete.
    for (const o of db.orders.filter((x) => x.userId === me.id && x.status === 'paid')) receiptForOrder(db, { id, now }, o);
    const receipts = (db.receipts || []).filter((r) => r.userId === me.id);
    const items = receipts.map((r) => ({ id: r.id, no: r.no, title: r.title, kind: r.kind, status: 'paid', amountNgn: r.amountNgn || 0, amountUsd: r.amountUsd || 0, method: r.methodLabel || r.method, channel: r.channel || '', at: r.at, hasReceipt: true }));
    for (const o of db.orders.filter((x) => x.userId === me.id && x.status !== 'paid')) items.push({ id: o.id, no: '', title: planTitle(o), kind: o.kind === 'topup' ? 'topup' : 'plan', status: o.status, amountNgn: o.amount || 0, amountUsd: o.usd || 0, method: METHOD_LABEL[o.method] || o.method, channel: '', at: o.created_date, hasReceipt: false });
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    await save();
    return ok({ items: items.slice(0, 200), totalPaidNgn: receipts.filter((r) => r.kind !== 'pass').reduce((n, r) => n + (r.amountNgn || 0), 0) });
  }
  if (p === '/api/payments/receipt' && method === 'GET') {
    const r = (db.receipts || []).find((x) => x.id === clip(q.get('id'), 80) && x.userId === me.id);
    if (!r) return fail(404, 'Receipt not found.');
    return ok({ receipt: publicReceipt(r, me) });
  }
  return fail(404, 'Not found.');
}
