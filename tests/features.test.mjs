import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const F = await import('../features.mjs');
const { handleFeatures, totpCode, totpCheck, b32encode, b32decode, makeTotpSecret, mfaRequired, twofaMethods, sessionHandle, weekKey, weekStart, passes } = F;
const { encToken } = await import('../userbots.mjs');

const mk = () => {
  const db = {
    users: [
      { id: 'u1', full_name: 'Ada Obi', email: 'ada@example.com', created_date: '2020-01-01T00:00:00Z', telegramChatId: '555' },
      { id: 'u2', full_name: 'Bayo Lawal', email: 'bayo@example.com', created_date: '2020-01-01T00:00:00Z' },
      { id: 'u3', full_name: 'Chi Eze', email: 'chi@example.com', created_date: '2020-01-01T00:00:00Z' },
    ],
    sessions: [], conversations: [{ id: 'c1', userId: 'u1', title: 'Trip plan' }], subscriptions: [], orders: [], memories: [], hosted: [{ id: 's1', userId: 'u1', name: 'My site', files: [{}, {}] }],
    userBots: [{ id: 'b1', userId: 'u1', name: 'Helper', username: 'helper_bot', persona: 'Be kind', token: 'SECRET-TOKEN', secret: 'HOOK-SECRET' }],
    messages: [{ conversation_id: 'c1', role: 'user', content: 'hi', created_date: '1' }, { conversation_id: 'c1', role: 'assistant', content: 'hello', created_date: '2' }],
  };
  const wallets = {}; const sent = []; const out = [];
  const walletOf = (uid) => wallets[uid] || (wallets[uid] = { balance: 0, ledger: [] });
  const base = {
    db, save: async () => {}, saveSoon: async () => {}, id: () => crypto.randomUUID(), now: () => new Date().toISOString(), admin: (u) => u && u.role === 'admin', isPremiumUser: () => false,
    send: async (res, status, body, headers) => { out.push({ status, body, headers }); }, res: { writeHead() {}, end(x) { out.push({ status: 200, raw: x }); } },
    ip: '1.2.3.4', cookies: {}, safeUser: (u) => ({ id: u.id, email: u.email }), walletOf, tgReady: true,
    tgSend: async (chat, text) => { sent.push({ chat, text }); }, emailReceipt: null,
  };
  const call = async (over) => { out.length = 0; const handled = await handleFeatures({ ...base, data: {}, req: { url: over.p, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36' } }, ...over }); return { handled, ...(out[0] || {}) }; };
  return { db, call, walletOf, sent };
};

test('TOTP matches the RFC 6238 test vector and base32 round-trips', () => {
  const secret = b32encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totpCode(secret, 1), '287082');                 // t=59s  -> 94287082, last 6 digits
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30)), '081804');
  assert.deepEqual(b32decode(secret), Buffer.from('12345678901234567890'));
  const s = makeTotpSecret(); assert.match(s, /^[A-Z2-7]{32}$/);
});

test('TOTP: a code works once, a neighbouring step is tolerated, garbage is refused', () => {
  const secret = makeTotpSecret(), now = Date.now(), step = Math.floor(now / 30000);
  const good = totpCode(secret, step);
  assert.equal(totpCheck(secret, good, 0, now), step);
  assert.equal(totpCheck(secret, good, step, now), 0);           // replay of the same step is refused
  assert.equal(totpCheck(secret, totpCode(secret, step - 1), 0, now), step - 1); // 30 s of clock drift is fine
  assert.equal(totpCheck(secret, totpCode(secret, step - 5), 0, now), 0);
  for (const bad of ['', '12345', 'abcdef', '1234567', null]) assert.equal(totpCheck(secret, bad, 0, now), 0);
});

test('two-factor setup with an authenticator app, then sign-in gate, backup codes and disable', async () => {
  const { db, call } = mk(); const u1 = db.users[0];
  assert.equal((await call({ p: '/api/2fa/status', method: 'GET', me: null })).status, 401);
  const begin = await call({ p: '/api/2fa/totp/begin', method: 'POST', me: u1 });
  assert.equal(begin.status, 200); assert.match(begin.body.uri, /^otpauth:\/\/totp\//);
  assert.ok(!JSON.stringify(db.security).includes(begin.body.secret), 'the secret is stored encrypted, never in clear text');
  assert.ok(!JSON.stringify(u1).includes(begin.body.secret), 'and never on the user object that /api/auth/me returns');
  assert.equal((await call({ p: '/api/2fa/totp/confirm', method: 'POST', me: u1, data: { code: '000000' } })).status, 401);
  assert.equal(mfaRequired(db, u1), false);
  const conf = await call({ p: '/api/2fa/totp/confirm', method: 'POST', me: u1, data: { code: totpCode(begin.body.secret, Math.floor(Date.now() / 30000)) } });
  assert.equal(conf.status, 200); assert.equal(conf.body.backupCodes.length, 8); assert.match(conf.body.backupCodes[0], /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  assert.ok(!JSON.stringify(db.security).includes(conf.body.backupCodes[0].replace('-', '')), 'backup codes are stored hashed');
  assert.equal(mfaRequired(db, u1), true);
  assert.deepEqual(twofaMethods(db, u1).sort(), ['backup', 'totp']);

  // a pending sign-in: cookie belongs to a session that is waiting for the second factor
  db.sessions.push({ id: 'SID1', userId: 'u1', created_date: new Date().toISOString(), mfaPending: true, mfaExpires: Date.now() + 60000, ip: '9.9.9.9', ua: 'x' });
  const st = await call({ p: '/api/auth/2fa/state', method: 'GET', me: null, cookies: { xyron_session: 'SID1' } });
  assert.equal(st.body.pending, true); assert.ok(st.body.methods.includes('totp')); assert.equal(st.body.email, 'a***@example.com');
  assert.equal((await call({ p: '/api/auth/2fa/verify', method: 'POST', me: null, cookies: { xyron_session: 'SID1' }, data: { code: '111111' } })).status, 401);
  assert.equal(db.sessions[0].mfaPending, true);
  const backup = conf.body.backupCodes[0];
  const ok = await call({ p: '/api/auth/2fa/verify', method: 'POST', me: null, cookies: { xyron_session: 'SID1' }, data: { method: 'backup', code: backup } });
  assert.equal(ok.status, 200); assert.equal(ok.body.user.id, 'u1'); assert.equal(db.sessions[0].mfaPending, undefined);
  // the same backup code never works twice
  db.sessions.push({ id: 'SID2', userId: 'u1', created_date: new Date().toISOString(), mfaPending: true, mfaExpires: Date.now() + 60000 });
  assert.equal((await call({ p: '/api/auth/2fa/verify', method: 'POST', me: null, cookies: { xyron_session: 'SID2' }, data: { method: 'backup', code: backup } })).status, 401);
  // no pending cookie => nothing to verify
  assert.equal((await call({ p: '/api/auth/2fa/state', method: 'GET', me: null, cookies: { xyron_session: 'nope' } })).body.pending, false);

  // turning it off needs a valid code
  assert.equal((await call({ p: '/api/2fa/disable', method: 'POST', me: u1, data: { code: '123456' } })).status, 401);
  const off = await call({ p: '/api/2fa/disable', method: 'POST', me: u1, data: { code: conf.body.backupCodes[1] } });
  assert.equal(off.status, 200); assert.equal(mfaRequired(db, u1), false);
});

test('pending sign-in: too many wrong codes ends the sign-in; expired sign-ins are refused', async () => {
  const { db, call } = mk(); const u1 = db.users[0];
  db.security = { u1: { totp: { enc: encToken(makeTotpSecret()), enabled: true } } };
  db.sessions.push({ id: 'S', userId: 'u1', created_date: new Date().toISOString(), mfaPending: true, mfaExpires: Date.now() + 60000 });
  let last; for (let i = 0; i < 9; i++) last = await call({ p: '/api/auth/2fa/verify', method: 'POST', me: null, cookies: { xyron_session: 'S' }, data: { code: '000000' } });
  assert.equal(last.status, 429); assert.equal(db.sessions.length, 0);
  db.sessions.push({ id: 'OLD', userId: 'u1', created_date: new Date().toISOString(), mfaPending: true, mfaExpires: Date.now() - 1 });
  assert.equal((await call({ p: '/api/auth/2fa/state', method: 'GET', me: null, cookies: { xyron_session: 'OLD' } })).status, 401);
  assert.ok(u1);
});

test('Telegram second factor: code is sent to the linked chat, hashed, single-use; needs a linked chat', async () => {
  const { db, call, sent } = mk(); const [u1, u2] = db.users;
  assert.equal((await call({ p: '/api/2fa/telegram/begin', method: 'POST', me: u2 })).status, 400);   // no Telegram linked
  assert.equal((await call({ p: '/api/2fa/telegram/begin', method: 'POST', me: u1 })).status, 200);
  assert.equal(sent.length, 1); assert.equal(sent[0].chat, '555');
  const code = sent[0].text.match(/\b(\d{6})\b/)[1];
  assert.ok(!JSON.stringify(db.security).includes(code));
  assert.equal((await call({ p: '/api/2fa/telegram/confirm', method: 'POST', me: u1, data: { code: '000000' } })).status, 401);
  const conf = await call({ p: '/api/2fa/telegram/confirm', method: 'POST', me: u1, data: { code } });
  assert.equal(conf.status, 200); assert.equal(conf.body.telegram, true); assert.equal(mfaRequired(db, u1), true);
  assert.equal((await call({ p: '/api/2fa/telegram/confirm', method: 'POST', me: u1, data: { code } })).status, 401); // single-use
  // rate limit: 3 codes per 10 minutes
  await call({ p: '/api/2fa/challenge', method: 'POST', me: u1 }); await call({ p: '/api/2fa/challenge', method: 'POST', me: u1 });
  assert.equal((await call({ p: '/api/2fa/challenge', method: 'POST', me: u1 })).status, 429);
});

test('devices: list never leaks the real session id; revoke one / all others; not other people\'s', async () => {
  const { db, call } = mk(); const [u1, u2] = db.users; const t = new Date().toISOString();
  db.sessions.push({ id: 'MINE', userId: 'u1', created_date: t, lastSeen: t, ip: '1.1.1.1', ua: 'Mozilla/5.0 (iPhone) Safari/605' }, { id: 'LAPTOP', userId: 'u1', created_date: t, lastSeen: '2020-01-01T00:00:00Z', ip: '2.2.2.2', ua: 'Mozilla/5.0 (Windows NT 10) Chrome/120 Safari/537' }, { id: 'THEIRS', userId: 'u2', created_date: t });
  const list = await call({ p: '/api/sessions', method: 'GET', me: u1, cookies: { xyron_session: 'MINE' } });
  assert.equal(list.body.sessions.length, 2); assert.ok(!JSON.stringify(list.body).includes('LAPTOP') && !JSON.stringify(list.body).includes('MINE'));
  assert.equal(list.body.sessions.find((s) => s.current).device, 'Safari on iPhone/iPad');
  assert.equal(list.body.sessions.find((s) => !s.current).device, 'Chrome on Windows');
  assert.equal((await call({ p: '/api/sessions/revoke', method: 'POST', me: u1, cookies: { xyron_session: 'MINE' }, data: { handle: sessionHandle('MINE') } })).status, 400); // not this device
  assert.equal((await call({ p: '/api/sessions/revoke', method: 'POST', me: u1, cookies: { xyron_session: 'MINE' }, data: { handle: sessionHandle('THEIRS') } })).status, 404); // someone else's
  assert.equal((await call({ p: '/api/sessions/revoke', method: 'POST', me: u1, cookies: { xyron_session: 'MINE' }, data: { handle: sessionHandle('LAPTOP') } })).status, 200);
  assert.deepEqual(db.sessions.map((s) => s.id), ['MINE', 'THEIRS']);
  db.sessions.push({ id: 'X', userId: 'u1', created_date: t });
  const all = await call({ p: '/api/sessions/revoke-others', method: 'POST', me: u1, cookies: { xyron_session: 'MINE' } });
  assert.equal(all.body.signedOut, 1); assert.deepEqual(db.sessions.map((s) => s.id).sort(), ['MINE', 'THEIRS']);
  F.logLogin(db, () => t, { userId: 'u1', ip: '1.1.1.1', ua: 'Chrome/1 Windows', method: 'password', result: 'ok' });
  const h = await call({ p: '/api/login-history', method: 'GET', me: u1 }); assert.equal(h.body.events.length, 1); assert.equal(h.body.events[0].result, 'ok');
  assert.equal((await call({ p: '/api/login-history', method: 'GET', me: u2 })).body.events.length, 0);
});

test('prompt gallery: create, validate, like, copy counts once, report hides, only owner/admin delete', async () => {
  const { db, call } = mk(); const [u1, u2, u3] = db.users;
  assert.equal((await call({ p: '/api/prompts/create', method: 'POST', me: null, data: {} })).status, 401);
  assert.equal((await call({ p: '/api/prompts/create', method: 'POST', me: u1, data: { title: 'x', text: 'long enough prompt text' } })).status, 400);
  const made = await call({ p: '/api/prompts/create', method: 'POST', me: u1, data: { title: 'Study buddy', text: 'Act as a patient tutor and quiz me.', category: 'Study' } });
  assert.equal(made.status, 200);
  assert.equal((await call({ p: '/api/prompts/create', method: 'POST', me: u1, data: { title: 'Study buddy', text: 'Act as a patient tutor and quiz me.' } })).status, 409);
  const pub = await call({ p: '/api/prompts', method: 'GET', me: null }); // public, no sign-in
  assert.equal(pub.body.prompts.length, 1); assert.equal(pub.body.prompts[0].author, 'Ada'); assert.ok(!JSON.stringify(pub.body).includes('u1') && !JSON.stringify(pub.body).includes('ada@'));
  const id = made.body.id;
  assert.equal((await call({ p: '/api/prompts/like', method: 'POST', me: u2, data: { id } })).body.likes, 1);
  assert.equal((await call({ p: '/api/prompts/like', method: 'POST', me: u2, data: { id } })).body.likes, 0);   // toggles
  await call({ p: '/api/prompts/copy', method: 'POST', me: u2, data: { id } }); const c2 = await call({ p: '/api/prompts/copy', method: 'POST', me: u2, data: { id } });
  assert.equal(c2.body.copies, 1);                                                                                  // same person counts once
  assert.equal((await call({ p: '/api/prompts/delete', method: 'POST', me: u2, data: { id } })).status, 403);
  for (const u of [u1, u2, u3]) await call({ p: '/api/prompts/report', method: 'POST', me: u, data: { id } });
  assert.equal((await call({ p: '/api/prompts', method: 'GET', me: null })).body.prompts.length, 0);               // hidden after 3 reports
  assert.equal((await call({ p: '/api/prompts/delete', method: 'POST', me: { ...u2, role: 'admin' }, data: { id } })).status, 200);
});

test('leaderboard: weekly totals, caps per game, rate limit, names are first names only', async () => {
  const { db, call } = mk(); const [u1, u2] = db.users;
  assert.equal((await call({ p: '/api/games/score', method: 'POST', me: u1, data: { game: 'hack', points: 5 } })).status, 400);
  assert.equal((await call({ p: '/api/games/score', method: 'POST', me: u1, data: { game: 'ttt', points: 0 } })).status, 400);
  const a = await call({ p: '/api/games/score', method: 'POST', me: u1, data: { game: 'ttt', points: 999999 } });
  assert.equal(a.body.added, 10);                                                    // capped
  assert.equal((await call({ p: '/api/games/score', method: 'POST', me: u1, data: { game: 'ttt', points: 10 } })).body.reason, 'too_fast');
  await call({ p: '/api/games/score', method: 'POST', me: u2, data: { game: 'ludo', points: 30 } });
  const lb = await call({ p: '/api/games/leaderboard', method: 'GET', me: u1 });
  assert.equal(lb.body.top[0].name, 'Bayo'); assert.equal(lb.body.top[0].points, 30); assert.equal(lb.body.me.rank, 2);
  assert.ok(!JSON.stringify(lb.body).includes('Obi') && !JSON.stringify(lb.body).includes('@'));
  const one = await call({ p: '/api/games/leaderboard', method: 'GET', me: null, req: { url: '/api/games/leaderboard?game=ttt', headers: {} } });
  assert.equal(one.body.top.length, 1); assert.equal(one.body.me, null);
  assert.equal(weekStart(Date.parse('2026-11-08T12:00:00Z')).toISOString().slice(0, 10), '2026-11-02'); // Sunday belongs to the week that began Monday 2 Nov
  assert.equal(weekKey(Date.parse('2026-11-09T00:00:01Z')), '2026-11-09');
});

test('team workspaces: create/join by code, share chat+project+bot (no secrets), roles enforced, leave/remove clean up', async () => {
  const { db, call } = mk(); const [u1, u2, u3] = db.users;
  const made = await call({ p: '/api/teams/create', method: 'POST', me: u1, data: { name: 'Design crew' } }); const tid = made.body.id;
  const ws = (await call({ p: '/api/teams/get', method: 'GET', me: u1, req: { url: `/api/teams/get?id=${tid}`, headers: {} } })).body.team;
  assert.equal(ws.role, 'owner'); assert.ok(ws.code);
  assert.equal((await call({ p: '/api/teams/get', method: 'GET', me: u2, req: { url: `/api/teams/get?id=${tid}`, headers: {} } })).status, 404);  // not a member
  assert.equal((await call({ p: '/api/teams/join', method: 'POST', me: u2, data: { code: 'WRONG' } })).status, 404);
  assert.equal((await call({ p: '/api/teams/join', method: 'POST', me: u2, data: { code: ws.code } })).status, 200);
  const member = (await call({ p: '/api/teams/get', method: 'GET', me: u2, req: { url: `/api/teams/get?id=${tid}`, headers: {} } })).body.team;
  assert.equal(member.code, undefined); assert.equal(member.members.length, 2);                                       // only the owner sees the invite code
  assert.equal((await call({ p: '/api/teams/share', method: 'POST', me: u1, data: { teamId: tid, type: 'chat', refId: 'c1' } })).status, 200);
  assert.equal((await call({ p: '/api/teams/share', method: 'POST', me: u1, data: { teamId: tid, type: 'project', refId: 's1' } })).status, 200);
  assert.equal((await call({ p: '/api/teams/share', method: 'POST', me: u1, data: { teamId: tid, type: 'bot', refId: 'b1' } })).status, 200);
  assert.equal((await call({ p: '/api/teams/share', method: 'POST', me: u2, data: { teamId: tid, type: 'chat', refId: 'c1' } })).status, 404);  // cannot share someone else's chat
  assert.ok(!JSON.stringify(db.workspaces).includes('SECRET-TOKEN') && !JSON.stringify(db.workspaces).includes('HOOK-SECRET'), 'bot token/secret never leave the owner');
  const items = (await call({ p: '/api/teams/get', method: 'GET', me: u2, req: { url: `/api/teams/get?id=${tid}`, headers: {} } })).body.team.items;
  assert.equal(items.length, 3); assert.equal(items.find((i) => i.type === 'chat').count, 2);
  const chat = items.find((i) => i.type === 'chat');
  const view = await call({ p: '/api/teams/item', method: 'GET', me: u2, req: { url: `/api/teams/item?teamId=${tid}&itemId=${chat.id}`, headers: {} } });
  assert.equal(view.body.item.payload.messages.length, 2);
  assert.equal((await call({ p: '/api/teams/unshare', method: 'POST', me: u2, data: { teamId: tid, itemId: chat.id } })).status, 403); // not the sharer, not owner
  assert.equal((await call({ p: '/api/teams/remove-member', method: 'POST', me: u2, data: { teamId: tid, userId: 'u1' } })).status, 403);
  assert.equal((await call({ p: '/api/teams/new-code', method: 'POST', me: u2, data: { teamId: tid } })).status, 403);
  assert.equal((await call({ p: '/api/teams/leave', method: 'POST', me: u1, data: { teamId: tid } })).status, 400);       // owner cannot just leave
  assert.equal((await call({ p: '/api/teams/remove-member', method: 'POST', me: u1, data: { teamId: tid, userId: 'u2' } })).status, 200);
  assert.equal((await call({ p: '/api/teams', method: 'GET', me: u2 })).body.teams.length, 0);
  assert.equal((await call({ p: '/api/teams/delete', method: 'POST', me: u3, data: { teamId: tid } })).status, 404);
  assert.equal((await call({ p: '/api/teams/delete', method: 'POST', me: u1, data: { teamId: tid } })).status, 200);
});

test('credits: day pass is paid from the wallet, extends Premium, refuses without money, makes a receipt', async () => {
  const { db, call, walletOf } = mk(); const u1 = db.users[0];
  const info = (await call({ p: '/api/credits', method: 'GET', me: u1 })).body; assert.equal(info.balanceNgn, 0); assert.equal(info.passes.length, passes().length);
  const poor = await call({ p: '/api/credits/buy-pass', method: 'POST', me: u1, data: { passId: 'day1' } });
  assert.equal(poor.status, 402); assert.equal(poor.body.needNgn, 300);
  assert.equal((await call({ p: '/api/credits/buy-pass', method: 'POST', me: u1, data: { passId: 'nope' } })).status, 400);
  walletOf('u1').balance = 2000;
  const bought = await call({ p: '/api/credits/buy-pass', method: 'POST', me: u1, data: { passId: 'week1' } });
  assert.equal(bought.status, 200); assert.equal(bought.body.balanceNgn, 500);
  const sub = db.subscriptions[0]; assert.equal(sub.tier, 'premium'); assert.ok(Math.abs(Date.parse(sub.expires_at) - Date.now() - 7 * 86400000) < 5000);
  const again = await call({ p: '/api/credits/buy-pass', method: 'POST', me: u1, data: { passId: 'day1' } });  // extends, not duplicates
  assert.equal(again.status, 200); assert.equal(db.subscriptions.length, 1); assert.ok(Date.parse(db.subscriptions[0].expires_at) - Date.now() > 7.9 * 86400000);
  assert.equal(walletOf('u1').ledger.filter((l) => l.type === 'pass').length, 2);
  assert.equal(db.receipts.length, 2);
  db.subscriptions[0].tier = 'premium_plus';
  assert.equal((await call({ p: '/api/credits/buy-pass', method: 'POST', me: u1, data: { passId: 'day1' } })).status, 409);
});

test('receipts + payment history: paid orders get one (idempotent), history shows paid/pending/failed, private to the owner', async () => {
  const { db, call } = mk(); const [u1, u2] = db.users; const helpers = { id: () => crypto.randomUUID(), now: () => new Date().toISOString() };
  const paid = { id: 'o1', userId: 'u1', kind: 'topup', packageId: 'ngn_1500', method: 'flutterwave', channel: 'bank_transfer', reference: 'XYR-AAA', amount: 1500, usd: 0, credit: 1500, status: 'paid', paid_date: '2026-11-01T10:00:00.000Z', created_date: '2026-11-01T09:59:00.000Z' };
  db.orders.push(paid, { id: 'o2', userId: 'u1', kind: 'plan', tier: 'premium', method: 'opay', reference: 'XYR-BBB', amount: 5000, status: 'pending', created_date: '2026-11-02T00:00:00.000Z' }, { id: 'o3', userId: 'u2', kind: 'topup', method: 'crypto', reference: 'XYR-CCC', usd: 1, status: 'paid', paid_date: '2026-11-03T00:00:00.000Z', created_date: '2026-11-03T00:00:00.000Z' });
  const r1 = F.receiptForOrder(db, helpers, paid), r2 = F.receiptForOrder(db, helpers, paid);
  assert.equal(r1.id, r2.id); assert.equal(db.receipts.length, 1);
  assert.equal(r1.channel, 'Bank transfer'); assert.equal(r1.methodLabel, 'Flutterwave'); assert.match(r1.no, /^RCT-20261101-[0-9A-F]{6}$/);
  const hist = (await call({ p: '/api/payments/history', method: 'GET', me: u1 })).body;
  assert.equal(hist.items.length, 2); assert.deepEqual(hist.items.map((i) => i.status).sort(), ['paid', 'pending']); assert.equal(hist.totalPaidNgn, 1500);
  assert.equal(hist.items.find((i) => i.status === 'pending').hasReceipt, false);
  const got = await call({ p: '/api/payments/receipt', method: 'GET', me: u1, req: { url: `/api/payments/receipt?id=${r1.id}`, headers: {} } });
  assert.equal(got.status, 200); assert.equal(got.body.receipt.customer.email, 'ada@example.com');
  assert.equal((await call({ p: '/api/payments/receipt', method: 'GET', me: u2, req: { url: `/api/payments/receipt?id=${r1.id}`, headers: {} } })).status, 404);
  const hist2 = (await call({ p: '/api/payments/history', method: 'GET', me: u2 })).body; assert.equal(hist2.items.length, 1); assert.equal(hist2.items[0].no.startsWith('RCT-20261103'), true);
});

test('export: only my chats, JSON and Markdown, rate limited', async () => {
  const { db, call } = mk(); const [u1, u2] = db.users;
  db.conversations.push({ id: 'c2', userId: 'u2', title: 'Private' }); db.messages.push({ conversation_id: 'c2', role: 'user', content: 'secret of bayo', created_date: '1' });
  assert.equal((await call({ p: '/api/export', method: 'GET', me: null })).status, 401);
  const j = await call({ p: '/api/export', method: 'GET', me: u1 });
  assert.equal(j.status, 200); assert.match(j.headers['Content-Disposition'], /attachment; filename="xyron-chats-/);
  assert.equal(j.body.chatCount, 1); assert.equal(j.body.chats[0].messages.length, 2); assert.ok(!JSON.stringify(j.body).includes('bayo'));
  const md = await call({ p: '/api/export', method: 'GET', me: u1, req: { url: '/api/export?format=md', headers: {} } });
  assert.match(md.raw, /## Trip plan/); assert.match(md.raw, /\*\*You:\*\*/);
  for (let i = 0; i < 4; i++) await call({ p: '/api/export', method: 'GET', me: u1 });
  assert.equal((await call({ p: '/api/export', method: 'GET', me: u1 })).status, 429);
  assert.ok(u2);
});

test('unrelated paths are ignored so the rest of the server keeps working', async () => {
  const { call } = mk();
  for (const p of ['/api/chat', '/api/auth/login', '/api/wallet', '/api/payments/webhook/opay', '/api/promptsX']) assert.equal((await call({ p, method: 'POST', me: null })).handled, false);
});
