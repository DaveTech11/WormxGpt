import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs the real store.mjs against a tiny in-memory fake of the `pg` module, so no database is needed.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xyron-msg-'));
for (const f of ['store.mjs', 'msgstore.mjs', 'r2.mjs', 'tgfiles.mjs']) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
fs.mkdirSync(path.join(tmp, 'node_modules/pg'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'node_modules/pg/package.json'), '{"name":"pg","type":"module","main":"index.js"}');
fs.writeFileSync(path.join(tmp, 'node_modules/pg/index.js'), `
const dbs = (globalThis.__fakePg ||= new Map());
const get = (url) => { if (!dbs.has(url)) dbs.set(url, { state: null, at: 0, msgs: new Map(), seq: 0, log: [], failInsert: false, failSelectMsgs: false }); return dbs.get(url); };
class Pool {
  constructor(o) { this.db = get(o.connectionString); }
  on() {}
  async end() {}
  async query(sql, p = []) {
    const d = this.db, s = sql.replace(/\\s+/g, ' ').trim().toLowerCase();
    if (s.startsWith('create ')) return { rows: [] };
    if (s.startsWith('select data, updated_at from xyron_state')) return { rows: d.state ? [{ data: JSON.parse(d.state), updated_at: new Date(d.at) }] : [] };
    if (s.startsWith('insert into xyron_state')) { d.state = p[0]; d.at = Date.now() + (++d.seq); return { rows: [] }; }
    if (s.startsWith('select id from xyron_files')) return { rows: [] };
    if (s.startsWith('select id from xyron_messages')) return { rows: [...d.msgs.keys()].map((id) => ({ id })) };
    if (s.startsWith('select data from xyron_messages')) {
      if (d.failSelectMsgs) throw new Error('boom read');
      const rows = [...d.msgs.values()].sort((a, b) => String(b.data.created_date || '').localeCompare(String(a.data.created_date || '')) || b.seq - a.seq);
      return { rows: rows.map((r) => ({ data: r.data })) };
    }
    if (s.startsWith('insert into xyron_messages')) {
      if (d.failInsert) throw new Error('boom write');
      d.log.push('insert:' + p[0].length);
      p[0].forEach((id, i) => { const old = d.msgs.get(id); d.msgs.set(id, { data: JSON.parse(p[3][i]), user: p[1][i], convo: p[2][i], seq: old ? old.seq : ++d.seq }); });
      return { rows: [] };
    }
    if (s.startsWith('delete from xyron_messages')) { d.log.push('delete:' + p[0].length); p[0].forEach((id) => d.msgs.delete(id)); return { rows: [] }; }
    throw new Error('fake pg: unhandled sql ' + s.slice(0, 60));
  }
}
export default { Pool };
`);

let run = 0;
async function boot(urls = ['postgres://render.example/x']) {
  process.env.DATABASE_URL = urls[0];
  if (urls[1]) process.env.SUPABASE_DB_URL = urls[1]; else delete process.env.SUPABASE_DB_URL;
  const store = await import(pathToFileURL(path.join(tmp, 'store.mjs')).href + '?run=' + ++run);
  await store.storeInit();
  return store;
}
const fake = (url = 'postgres://render.example/x') => globalThis.__fakePg.get(url);
const reset = () => { globalThis.__fakePg?.clear(); };
const mk = (n, extra = {}) => ({ id: 'm' + n, conversation_id: 'c1', userId: 'u1', role: 'user', content: 'hello ' + n, created_date: '2026-01-01T00:00:' + String(n).padStart(2, '0') + '.000Z', ...extra });
// newest first, like the server's unshift
const list = (n) => Array.from({ length: n }, (_, i) => mk(n - i));

test('old-format state (messages inside) moves into the table on the first save and reloads identically', async () => {
  reset();
  let s = await boot();
  const msgs = list(5);
  fake().state = JSON.stringify({ users: [{ id: 'u1' }], messages: msgs }); fake().at = 1;
  const loaded = await s.storeLoad();
  assert.deepEqual(loaded.messages, msgs);
  assert.equal(loaded.messagesInBlob, undefined);
  await s.storeSave(loaded);
  const blob = JSON.parse(fake().state);
  assert.equal(blob.messagesInBlob, false);
  assert.equal('messages' in blob, false);
  assert.equal(fake().msgs.size, 5);
  s = await boot();
  const again = await s.storeLoad();
  assert.deepEqual(again.messages, msgs);
  assert.deepEqual(again.users, [{ id: 'u1' }]);
});

test('a save writes only the messages that changed, and removes deleted ones', async () => {
  reset();
  const s = await boot();
  const state = { users: [], messages: list(30) };
  await s.storeSave(state);
  assert.equal(fake().msgs.size, 30);
  fake().log.length = 0;
  await s.storeSave(state);
  assert.deepEqual(fake().log, [], 'nothing changed, nothing written');
  state.messages.unshift(mk(31));
  state.messages[5].content = 'edited';
  await s.storeSave(state);
  assert.deepEqual(fake().log, ['insert:2']);
  fake().log.length = 0;
  state.messages = state.messages.filter((m) => m.id !== 'm3');
  await s.storeSave(state);
  assert.deepEqual(fake().log, ['delete:1']);
  assert.equal(fake().msgs.has('m3'), false);
  const back = await (await boot()).storeLoad();
  assert.equal(back.messages.length, 30);
  assert.equal(back.messages[0].id, 'm31', 'newest first');
});

test('if the messages table cannot be written, the save falls back to the old format and nothing is lost', async () => {
  reset();
  let s = await boot();
  const state = { users: [{ id: 'u1' }], messages: list(3) };
  await s.storeSave(state);
  fake().failInsert = true;
  state.messages.unshift(mk(4));
  await s.storeSave(state);
  const blob = JSON.parse(fake().state);
  assert.equal(blob.messagesInBlob, true);
  assert.equal(blob.messages.length, 4);
  s = await boot();
  assert.equal((await s.storeLoad()).messages.length, 4);
  // recovery: table works again, the next save catches the table up and goes back to the new format
  fake().failInsert = false;
  s = await boot();
  const st = await s.storeLoad();
  await s.storeSave(st);
  assert.equal(JSON.parse(fake().state).messagesInBlob, false);
  assert.equal(fake().msgs.size, 4);
});

test('a save that would wipe every message is refused for the table and cannot resurrect old ones', async () => {
  reset();
  let s = await boot();
  const state = { users: [], messages: list(25) };
  await s.storeSave(state);
  state.messages = [];
  await s.storeSave(state);
  const blob = JSON.parse(fake().state);
  assert.equal(blob.messagesInBlob, true);
  assert.deepEqual(blob.messages, []);
  assert.equal(fake().msgs.size, 25, 'table left alone');
  s = await boot();
  assert.deepEqual((await s.storeLoad()).messages, [], 'old rows are not brought back');
});

test('a message without an id keeps messages in the main state for that save', async () => {
  reset();
  const s = await boot();
  const state = { users: [], messages: [mk(1), { role: 'user', content: 'no id' }] };
  await s.storeSave(state);
  const blob = JSON.parse(fake().state);
  assert.equal(blob.messagesInBlob, true);
  assert.equal(blob.messages.length, 2);
});

test('start-up fails (and is retried) instead of silently losing chats when the messages table cannot be read', async () => {
  reset();
  let s = await boot();
  await s.storeSave({ users: [], messages: list(3) });
  fake().failSelectMsgs = true;
  s = await boot();
  await assert.rejects(() => s.storeLoad(), /Messages could not be read/);
});

test('the second (mirror) database gets the messages too, and a fresh mirror is filled from the main one', async () => {
  reset();
  const urls = ['postgres://render.example/x', 'postgres://supabase.example/y'];
  let s = await boot(urls);
  const state = { users: [], messages: list(4) };
  await s.storeSave(state);
  await s.storeIdle();
  assert.equal(fake(urls[1]).msgs.size, 4);
  // new empty mirror
  fake(urls[1]).msgs.clear(); fake(urls[1]).state = null;
  s = await boot(urls);
  const loaded = await s.storeLoad();
  assert.equal(loaded.messages.length, 4);
  await s.storeIdle();
  assert.equal(fake(urls[1]).msgs.size, 4);
  assert.equal(JSON.parse(fake(urls[1]).state).messagesInBlob, false);
});
