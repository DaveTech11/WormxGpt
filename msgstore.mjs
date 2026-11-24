// Chat messages in their own Postgres table (xyron_messages).
//
// Before: every save wrote ONE giant JSON blob holding users, chats, orders AND every message.
// Now:    the blob holds everything except messages; messages live one row each, and a save only
//         writes the rows that actually changed (new / edited / deleted messages).
//
// The server still works on the in-memory array db.messages exactly as before; only the storage changed.
// Safety rules (see MESSAGES-TABLE.txt):
//  - the blob carries a marker `messagesInBlob`: true = the blob holds the messages (old format or fallback),
//    false = the messages are in the table. Blobs saved by older versions have no marker and count as "in blob",
//    so the first save after updating moves everything into the table automatically.
//  - if the table cannot be written, the save falls back to the old full-blob format, so a save never loses chats.
//  - a save that would delete ALL messages while many exist is refused for the table (falls back to the blob).

import { createHash } from 'node:crypto';

export const MSG_SQL = [
  `create table if not exists xyron_messages (
    id text primary key,
    seq bigserial,
    user_id text,
    conversation_id text,
    data jsonb not null,
    updated_at timestamptz not null default now()
  )`,
  'create index if not exists xyron_messages_convo_idx on xyron_messages (conversation_id)',
];

export const MASS_DELETE_GUARD = 20;
const CHUNK_ROWS = 200;
const CHUNK_BYTES = 4 * 1024 * 1024;

// Map(id -> JSON text). Throws when a message has no usable id (then the caller falls back to the blob).
export function snapshotMessages(messages) {
  const snap = new Map();
  for (const m of messages) {
    if (!m || typeof m.id !== 'string' || !m.id) throw new Error('a message has no id');
    if (snap.has(m.id)) throw new Error('duplicate message id ' + m.id);
    snap.set(m.id, JSON.stringify(m));
  }
  return snap;
}

const hashOf = (json) => createHash('sha1').update(json).digest('base64');
// Map(id -> short hash). Kept per database instead of the full text, so memory stays small.
export const hashAll = (snap) => new Map([...snap].map(([id, json]) => [id, hashOf(json)]));

// Splits a state object into the two JSON texts a save can write.
//  stripped: everything but messages, marker messagesInBlob:false
//  full():   the old format, marker messagesInBlob:true (built only if it is needed)
//  snap:     Map(id -> JSON) of the messages for the table, or null when they cannot go in the table
//  hashes:   Map(id -> hash) of the same, used to find what changed
export function buildPayload(state) {
  // eslint-disable-next-line no-unused-vars
  const { messages, messagesInBlob, ...rest } = state || {};
  const list = Array.isArray(messages) ? messages : [];
  const inner = JSON.stringify(rest).slice(1, -1);
  const tail = inner ? ',' + inner : '';
  let snap = null;
  try { snap = snapshotMessages(list); } catch (e) { console.error('Messages stay in the main state this save:', e.message); }
  return {
    snap,
    hashes: snap ? hashAll(snap) : null,
    stripped: `{"messagesInBlob":false${tail}}`,
    full: () => {
      const body = snap ? [...snap.values()].join(',') : list.map((m) => JSON.stringify(m)).join(',');
      return `{"messagesInBlob":true,"messages":[${body}]${tail}}`;
    },
  };
}

// Writes only what changed. prev = hashes the database already has, snap/hashes = what we want it to have.
// Oldest first, so row order (seq) follows message age.
export async function syncMessages(pool, prev, snap, hashes) {
  const upserts = [];
  for (const [id, json] of snap) if (prev.get(id) !== hashes.get(id)) upserts.push([id, json]);
  const deletes = [];
  for (const id of prev.keys()) if (!snap.has(id)) deletes.push(id);
  if (!upserts.length && !deletes.length) return;
  if (snap.size === 0 && prev.size > MASS_DELETE_GUARD) throw new Error('refusing to delete every message');

  upserts.reverse(); // db.messages is newest-first (unshift); insert oldest first
  let batch = [], bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const ids = [], us = [], cs = [], ds = [];
    for (const [id, json] of batch) {
      let m = {};
      try { m = JSON.parse(json) || {}; } catch { /* keep empty */ }
      ids.push(id); us.push(m.userId == null ? null : String(m.userId));
      cs.push(m.conversation_id == null ? null : String(m.conversation_id)); ds.push(json);
    }
    await pool.query(
      `insert into xyron_messages (id, user_id, conversation_id, data)
       select i, u, c, d::jsonb from unnest($1::text[], $2::text[], $3::text[], $4::text[]) as t(i, u, c, d)
       on conflict (id) do update set user_id = excluded.user_id, conversation_id = excluded.conversation_id,
         data = excluded.data, updated_at = now()`,
      [ids, us, cs, ds]
    );
    batch = []; bytes = 0;
  };
  for (const row of upserts) {
    batch.push(row); bytes += row[1].length;
    if (batch.length >= CHUNK_ROWS || bytes >= CHUNK_BYTES) await flush();
  }
  await flush();
  for (let i = 0; i < deletes.length; i += 1000) {
    await pool.query('delete from xyron_messages where id = any($1::text[])', [deletes.slice(i, i + 1000)]);
  }
}

// All messages, newest first (the order the server's array used).
export async function loadMessages(pool) {
  const r = await pool.query(`select data from xyron_messages order by coalesce(data->>'created_date', '') desc, seq desc`);
  return r.rows.map((x) => x.data);
}

// Map(id -> '') of what the table holds. The empty text never equals a real hash, so the first save
// after (re)connecting rewrites every row and removes rows the server no longer has.
export async function tableIds(pool) {
  const r = await pool.query('select id from xyron_messages');
  return new Map(r.rows.map((x) => [x.id, '']));
}

// true: this saved state holds the messages itself (old format, fallback save, or a brand-new state).
export function blobHoldsMessages(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.messagesInBlob === true) return true;
  return data.messagesInBlob === undefined && Array.isArray(data.messages);
}

// The state object the server gets: marker removed, messages filled in.
export function withMessages(data, messages) {
  // eslint-disable-next-line no-unused-vars
  const { messagesInBlob, messages: _old, ...rest } = data;
  return { ...rest, messages };
}
