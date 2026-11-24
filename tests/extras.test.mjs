import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const { handleExtras, snapshotMessages } = await import('../extras.mjs');

const mk = () => {
  const db = { users: [{ id: 'u1', created_date: '2020-01-01T00:00:00Z' }, { id: 'u2', created_date: new Date().toISOString() }], conversations: [{ id: 'c1', userId: 'u1', title: 'Trip plan' }], messages: [], subscriptions: [], shares: [], referrals: [], apiKeys: [] };
  db.messages.push({ conversation_id: 'c1', role: 'user', content: 'hi', file_urls: ['/api/files/secret'], created_date: '1' }, { conversation_id: 'c1', role: 'assistant', content: 'hello', created_date: '2' }, { conversation_id: 'c2', role: 'user', content: 'other chat', created_date: '3' });
  const out = [];
  const base = { db, save: async () => {}, id: () => crypto.randomUUID(), now: () => new Date().toISOString(), isPremiumUser: () => false, admin: () => false,
    send: async (res, status, body, headers) => { out.push({ status, body, headers }); }, res: {}, ai: async (m) => 'AI says ' + m[m.length - 1].content };
  const call = async (over) => { out.length = 0; const handled = await handleExtras({ ...base, data: {}, req: { url: over.p, headers: {} }, ...over }); return { handled, ...(out[0] || {}) }; };
  return { db, call };
};

test('sharing: snapshot has text only; public view needs no login; revoke kills the link', async () => {
  assert.deepEqual(snapshotMessages([{ role: 'user', content: 'a', file_urls: ['x'] }, { role: 'system', content: 'no' }, { role: 'assistant', content: '  ' }]), [{ role: 'user', content: 'a' }]);
  const { db, call } = mk(); const u1 = db.users[0], u2 = db.users[1];
  assert.equal((await call({ p: '/api/share/create', method: 'POST', me: null })).status, 401);
  assert.equal((await call({ p: '/api/share/create', method: 'POST', me: u2, data: { conversationId: 'c1' } })).status, 404);   // not the owner
  const made = await call({ p: '/api/share/create', method: 'POST', me: u1, data: { conversationId: 'c1' } });
  assert.equal(made.status, 200);
  const view = await call({ p: '/api/share/view', method: 'GET', me: null, req: { url: `/api/share/view?token=${made.body.token}`, headers: {} } });
  assert.equal(view.status, 200); assert.equal(view.body.messages.length, 2); assert.equal(view.body.title, 'Trip plan');
  assert.ok(!JSON.stringify(view.body).includes('secret') && !JSON.stringify(view.body).includes('u1'));
  assert.match(view.headers['X-Robots-Tag'], /noindex/);
  assert.equal((await call({ p: '/api/share/revoke', method: 'POST', me: u2, data: { token: made.body.token } })).status, 404);   // only the owner can revoke
  assert.equal((await call({ p: '/api/share/revoke', method: 'POST', me: u1, data: { token: made.body.token } })).status, 200);
  assert.equal((await call({ p: '/api/share/view', method: 'GET', me: null, req: { url: `/api/share/view?token=${made.body.token}`, headers: {} } })).status, 404);
});

test('referral: both get Premium days, once, never self, new accounts only', async () => {
  const { db, call } = mk(); const [u1, u2] = db.users;
  const code = (await call({ p: '/api/referral/me', method: 'GET', me: u1 })).body.code;
  assert.deepEqual((await call({ p: '/api/referral/claim', method: 'POST', me: u1, data: { code } })).body, { ok: false, reason: 'account_too_old' });
  assert.equal((await call({ p: '/api/referral/claim', method: 'POST', me: u2, data: { code: 'XXXXXXX' } })).body.reason, 'invalid_code');
  const ok = await call({ p: '/api/referral/claim', method: 'POST', me: u2, data: { code } });
  assert.equal(ok.body.ok, true);
  assert.equal(db.subscriptions.length, 2);
  assert.ok(db.subscriptions.every((s) => s.tier === 'premium' && Date.parse(s.expires_at) > Date.now()));
  assert.equal((await call({ p: '/api/referral/claim', method: 'POST', me: u2, data: { code } })).body.reason, 'already_claimed');
  assert.equal((await call({ p: '/api/referral/me', method: 'GET', me: u1 })).body.invited, 1);
});

test('developer API: key shown once (hash stored), /v1/chat works, limits and revoke enforced', async () => {
  const { db, call } = mk(); const u1 = db.users[0];
  const made = await call({ p: '/api/devkeys/create', method: 'POST', me: u1, data: { name: 'site' } });
  const key = made.body.key; assert.match(key, /^xy_live_[0-9a-f]{48}$/);
  assert.ok(!JSON.stringify(db.apiKeys).includes(key), 'the key itself is never stored');
  const listed = (await call({ p: '/api/devkeys', method: 'GET', me: u1 })).body;
  assert.equal(listed.keys.length, 1); assert.ok(!JSON.stringify(listed).includes(key));
  const chat = (over = {}) => call({ p: '/v1/chat', method: 'POST', me: null, data: { input: 'Say hello' }, req: { url: '/v1/chat', headers: { authorization: 'Bearer ' + key } }, ...over });
  const r = await chat();
  assert.equal(r.status, 200); assert.equal(r.body.output, 'AI says Say hello'); assert.equal(r.body.model, 'xyron');
  assert.equal((await chat({ req: { url: '/v1/chat', headers: { authorization: 'Bearer xy_live_wrong' } } })).status, 401);
  assert.equal((await chat({ data: {} })).status, 400);
  assert.equal((await chat({ data: { messages: [{ role: 'assistant', content: 'x' }] } })).status, 400);
  for (let i = 0; i < 5; i++) await chat();                       // free plan: 6 requests per minute
  assert.equal((await chat()).status, 429);
  const id = listed.keys[0].id;
  assert.equal((await call({ p: '/api/devkeys/revoke', method: 'POST', me: u1, data: { id } })).status, 200);
  assert.equal((await chat()).status, 401);
});

test('developer API: AI failure gives 502 and does not use up the daily allowance', async () => {
  const { db, call } = mk(); const u1 = db.users[0];
  const key = (await call({ p: '/api/devkeys/create', method: 'POST', me: u1, data: {} })).body.key;
  const bad = await call({ p: '/v1/chat', method: 'POST', me: null, data: { input: 'x' }, req: { url: '/v1/chat', headers: { authorization: 'Bearer ' + key } }, ai: async () => { throw new Error('boom'); } });
  assert.equal(bad.status, 502);
  assert.equal(db.apiKeys[0].dayCount, 0);
});
