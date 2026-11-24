// Prexzy APIs (https://prexzyapis.com) as an image provider, called with a Bearer key from .env.
//   PREXZY_API_KEY=your_key                      (or PREXZY_API_KEYS=key1,key2 - tried in turn if one is rejected)
//   PREXZY_API_URL=https://prexzyapis.com        (optional)
//   PREXZY_IMAGE_ENDPOINTS=/ai/flux,/ai/anime    (any number of paths, tried in order until one gives an image)
//   PREXZY_PROMPT_PARAM=prompt                   (name of the prompt field the endpoint expects)
//   PREXZY_IMAGE_METHOD=GET                      (GET or POST)
// Paths that look adult or explicit (nsfw, porn, hentai, extreme, ...) are always ignored: Wormx GPT does not use them.
const BLOCKED = /nsfw|porn|xxx|hentai|explicit|extreme|adult|lewd|nude|naked|sex|erotic|18\+/i;
const base = () => (process.env.PREXZY_API_URL || 'https://prexzyapis.com').replace(/\/+$/, '');
const keys = () => String(process.env.PREXZY_API_KEYS || process.env.PREXZY_API_KEY || '').split(',').map((s) => s.trim()).filter(Boolean);
export const prexzyEndpoints = () => String(process.env.PREXZY_IMAGE_ENDPOINTS || '')
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => (s.startsWith('/') ? s : '/' + s))
  .filter((s) => /^\/[A-Za-z0-9/_.-]+$/.test(s) && !BLOCKED.test(s));
export const prexzyEnabled = () => keys().length > 0 && prexzyEndpoints().length > 0;

const TIMEOUT = () => Number(process.env.PREXZY_TIMEOUT_MS) || 40000;

// Finds an image link or base64 picture anywhere in a JSON reply.
function findImage(j, depth = 0) {
  if (!j || depth > 4) return null;
  if (typeof j === 'string') {
    if (/^https:\/\/\S+$/i.test(j)) return { url: j };
    const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(j);
    if (m) return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
    return null;
  }
  if (Array.isArray(j)) { for (const x of j) { const f = findImage(x, depth + 1); if (f) return f; } return null; }
  if (typeof j === 'object') {
    for (const k of ['url', 'image', 'image_url', 'imageUrl', 'result', 'output', 'data', 'images', 'base64', 'b64_json']) {
      const v = j[k];
      if ((k === 'base64' || k === 'b64_json') && typeof v === 'string' && v.length > 200) return { mime: 'image/png', bytes: Buffer.from(v, 'base64') };
      const f = findImage(v, depth + 1); if (f) return f;
    }
  }
  return null;
}

async function callEndpoint(path, key, prompt) {
  const param = process.env.PREXZY_PROMPT_PARAM || 'prompt';
  const post = String(process.env.PREXZY_IMAGE_METHOD || 'GET').toUpperCase() === 'POST';
  const url = `${base()}${path}${post ? '' : `?${new URLSearchParams({ [param]: prompt.slice(0, 1500) })}`}`;
  const r = await fetch(url, {
    method: post ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*,application/json', ...(post ? { 'Content-Type': 'application/json' } : {}) },
    ...(post ? { body: JSON.stringify({ [param]: prompt.slice(0, 1500) }) } : {}),
    signal: AbortSignal.timeout(TIMEOUT()),
  });
  const type = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (r.status === 401 || r.status === 403) { const e = new Error(`prexzy ${path}: key rejected (${r.status})`); e.badKey = true; throw e; }
  if (!r.ok) throw new Error(`prexzy ${path}: HTTP ${r.status}`);
  if (type.startsWith('image/')) return { mime: type, bytes: Buffer.from(await r.arrayBuffer()) };
  let j; try { j = await r.json(); } catch { throw new Error(`prexzy ${path}: unreadable reply`); }
  const found = findImage(j);
  if (!found) throw new Error(`prexzy ${path}: no image in reply`);
  if (found.bytes) return found;
  const img = await fetch(found.url, { signal: AbortSignal.timeout(TIMEOUT()) });
  const t = (img.headers.get('content-type') || '').split(';')[0].trim();
  if (!img.ok || !t.startsWith('image/')) throw new Error(`prexzy ${path}: image link did not return a picture`);
  return { mime: t, bytes: Buffer.from(await img.arrayBuffer()) };
}

// Text-to-image. Tries every endpoint in order; a rejected key moves on to the next key.
export async function prexzyImage(prompt) {
  const errs = [];
  for (const path of prexzyEndpoints()) {
    for (const key of keys()) {
      try { return await callEndpoint(path, key, prompt); }
      catch (e) { errs.push(e.message); if (!e.badKey) break; }
    }
  }
  throw new Error(errs.join(' | ') || 'Prexzy is not configured');
}
