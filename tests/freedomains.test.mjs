import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSub, cleanGithub, cleanPrUrl, instructions, pointsAt, handleFreeDomains } from '../freedomains.mjs';

test('names: valid ones pass, reserved / odd ones are refused', () => {
  assert.equal(cleanSub(' MyApp '), 'myapp');
  assert.equal(cleanSub('my-app-2'), 'my-app-2');
  for (const bad of ['ab', '-abc', 'abc-', 'a--b', 'www', 'admin', 'xyron', 'has space', 'dots.in.name', 'a'.repeat(40), '', null]) assert.equal(cleanSub(bad), '', String(bad));
  assert.equal(cleanGithub('@Dave-Tech'), 'Dave-Tech');
  assert.equal(cleanGithub('bad name'), '');
});

test('pull request links must belong to the right project', () => {
  assert.equal(cleanPrUrl('is-a.dev', 'https://github.com/is-a-dev/register/pull/123'), 'https://github.com/is-a-dev/register/pull/123');
  assert.equal(cleanPrUrl('is-a.dev', 'https://github.com/is-a-dev/register/pull/123#issuecomment-1'), 'https://github.com/is-a-dev/register/pull/123');
  assert.equal(cleanPrUrl('is-a.dev', 'https://github.com/someone/else/pull/1'), '');
  assert.equal(cleanPrUrl('js.org', 'https://github.com/is-a-dev/register/pull/1'), '');
  assert.equal(cleanPrUrl('js.org', 'https://evil.example/js-org/js.org/pull/1'), '');
});

test('the request text points at the project and never contains the user email', () => {
  const g = instructions({ provider: 'is-a.dev', sub: 'myapp', target: 'myapp.onrender.com' }, 'dave');
  assert.equal(g.file, 'domains/myapp.json');
  assert.deepEqual(JSON.parse(g.content), { owner: { username: 'dave', email: 'YOUR_EMAIL' }, records: { CNAME: 'myapp.onrender.com' } });
  assert.ok(g.openUrl.startsWith('https://github.com/is-a-dev/register/new/main?filename=domains%2Fmyapp.json&value='));
  const j = instructions({ provider: 'js.org', sub: 'myapp', target: 'myapp.onrender.com' });
  assert.equal(j.content, '"myapp": "myapp.onrender.com", // Wormx GPT project\n');
});

test('DNS check', async () => {
  assert.equal(await pointsAt('a.is-a.dev', 'x.onrender.com', { resolveCname: async () => ['X.onrender.com.'] }), true);
  assert.equal(await pointsAt('a.is-a.dev', 'x.onrender.com', { resolveCname: async () => ['other.com'] }), false);
  assert.equal(await pointsAt('a.is-a.dev', 'x.onrender.com', { resolveCname: async () => { throw new Error('ENOTFOUND'); } }), false);
});

// A small fake of what server.mjs passes in.
function world() {
  const db = {}; let n = 0; let out = null; let cname = [];
  const me = { id: 'u1' };
  const call = async (p, method, data = {}, who = me) => {
    await handleFreeDomains({
      p, method, data, me: who, db, save: async () => {}, id: () => 'id' + (++n), now: () => new Date().toISOString(),
      send: async (_r, code, body) => { out = { code, body }; }, res: {},
      hostFor: async (_u, sid) => (sid === 'srv-bad' ? Promise.reject(Object.assign(new Error('That service is not yours.'), { status: 403 })) : 'myapp-' + sid.slice(4) + '.onrender.com'),
      resolver: { resolveCname: async () => cname },
    });
    return out;
  };
  return { db, call, setCname: (v) => { cname = v; } };
}
const req = (name, extra = {}) => ({ provider: 'is-a.dev', name, github: 'dave', serviceId: 'srv-abc1', ...extra });

test('two free names per person, a third is refused, cancelling frees a spot', async () => {
  const w = world();
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('first'))).code, 200);
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('second', { provider: 'js.org' }))).code, 200);
  const third = await w.call('/api/free-domains/request', 'POST', req('third'));
  assert.equal(third.code, 429);
  const list = (await w.call('/api/free-domains', 'GET')).body;
  assert.equal(list.used, 2); assert.equal(list.limit, 2);
  await w.call('/api/free-domains/cancel', 'POST', { id: list.items[0].id });
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('third'))).code, 200);
});

test('a name can only be requested once, and bad input is refused', async () => {
  const w = world();
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('taken'))).code, 200);
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('taken'), { id: 'u2' })).code, 409);
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('www'), { id: 'u2' })).code, 400);
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('okname', { provider: 'evil.com' }), { id: 'u2' })).code, 400);
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('okname', { github: '' }), { id: 'u2' })).code, 400);
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('okname', { serviceId: 'nope' }), { id: 'u2' })).code, 400);
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('okname', { serviceId: 'srv-bad' }), { id: 'u2' })).code, 403);
});

test('someone else cannot touch my request; DNS decides when it is active', async () => {
  const w = world();
  const r = (await w.call('/api/free-domains/request', 'POST', req('mine'))).body.item;
  assert.equal((await w.call('/api/free-domains/check', 'POST', { id: r.id }, { id: 'u2' })).code, 404);
  assert.equal((await w.call('/api/free-domains/cancel', 'POST', { id: r.id }, { id: 'u2' })).code, 404);
  assert.equal((await w.call('/api/free-domains/submitted', 'POST', { id: r.id, prUrl: 'https://example.com/x' })).code, 400);
  const s = await w.call('/api/free-domains/submitted', 'POST', { id: r.id, prUrl: 'https://github.com/is-a-dev/register/pull/9' });
  assert.equal(s.body.item.status, 'submitted');
  let c = await w.call('/api/free-domains/check', 'POST', { id: r.id });
  assert.equal(c.body.live, false); assert.equal(c.body.item.status, 'submitted');
  w.setCname(['myapp-abc1.onrender.com']);
  c = await w.call('/api/free-domains/check', 'POST', { id: r.id });
  assert.equal(c.body.live, true); assert.equal(c.body.item.status, 'active');
  assert.equal(c.body.item.guide, undefined, 'no instructions once active');
});

test('lifetime cap stops name-farming', async () => {
  const w = world();
  for (let i = 0; i < 6; i++) {
    const r = await w.call('/api/free-domains/request', 'POST', req('name' + i + 'x'));
    assert.equal(r.code, 200, 'request ' + i);
    await w.call('/api/free-domains/cancel', 'POST', { id: r.body.item.id });
  }
  assert.equal((await w.call('/api/free-domains/request', 'POST', req('lastone'))).code, 429);
});

test('signed-out people get 401', async () => {
  const w = world();
  assert.equal((await w.call('/api/free-domains', 'GET', {}, null)).code, 401);
});
