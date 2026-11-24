// Voice replies for Telegram bots and Wormx GPT Voice: text -> speech through Groq, then (when ffmpeg is available)
// converted to OGG/Opus so Telegram shows a real round voice note. Needs GROQ_API_KEY. ffmpeg: the `ffmpeg` command, or the optional `ffmpeg-static` package.
import { spawn } from 'node:child_process';

export const VOICES = ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe'];
export const voiceConfigured = () => !!process.env.GROQ_API_KEY;

// Make a reply sound natural: no links, markdown or emoji, and short enough to speak.
export function prepareSpeech(text, max = 900) {
  let t = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>~|]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > max * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max);
  }
  return t;
}

// Groq speaks up to ~200 characters per request, so a reply is split into sentences and the WAV pieces are joined.
// Model/voices can be changed in .env: GROQ_TTS_MODEL (default canopylabs/orpheus-v1-english). Accept the model's terms once in the Groq console.
const TTS_URL = process.env.GROQ_TTS_URL || 'https://api.groq.com/openai/v1/audio/speech';
const CHUNK = 190;
function chunkText(t) {
  const parts = t.match(/[^.!?]+[.!?]*\s*/g) || [t];
  const out = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > CHUNK && cur) { out.push(cur.trim()); cur = ''; }
    let rest = p;
    while (rest.length > CHUNK) { const cut = rest.lastIndexOf(' ', CHUNK); const k = cut > 40 ? cut : CHUNK; out.push(rest.slice(0, k).trim()); rest = rest.slice(k); }
    cur += rest;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
function dataChunk(wav) { // -> {start, len} of the PCM data
  let i = 12;
  while (i + 8 <= wav.length) {
    const id = wav.toString('ascii', i, i + 4), size = wav.readUInt32LE(i + 4);
    if (id === 'data') return { start: i + 8, len: Math.min(size, wav.length - i - 8) };
    i += 8 + size + (size % 2);
  }
  throw new Error('Bad WAV from the voice engine.');
}
function joinWavs(list) {
  if (list.length === 1) return list[0];
  const first = list[0], d0 = dataChunk(first);
  const pcm = Buffer.concat(list.map((w) => { const d = dataChunk(w); return w.subarray(d.start, d.start + d.len); }));
  const head = Buffer.from(first.subarray(0, d0.start));
  head.writeUInt32LE(pcm.length, d0.start - 4);
  head.writeUInt32LE(head.length - 8 + pcm.length, 4);
  return Buffer.concat([head, pcm]);
}

// Returns a WAV Buffer. Throws an Error with .status = 429 when the voice quota/rate limit is hit.
export async function speakWav(text, { voice } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error('Voice is not set up.'), { status: 503 });
  const input = prepareSpeech(text);
  if (!input) throw Object.assign(new Error('Nothing to say.'), { status: 400 });
  const model = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
  const pieces = [];
  for (const part of chunkText(input)) {
    const r = await fetch(TTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: part, voice: VOICES.includes(voice) ? voice : VOICES[0], response_format: 'wav' }),
      signal: AbortSignal.timeout(Number(process.env.GROQ_TTS_TIMEOUT_MS) || 30000),
    });
    if (r.status === 429 || r.status === 402) throw Object.assign(new Error('Voice limit reached.'), { status: 429 });
    if (!r.ok) throw new Error(`Voice service answered ${r.status}.`);
    pieces.push(Buffer.from(await r.arrayBuffer()));
  }
  return joinWavs(pieces);
}

let ffmpegPath;
async function findFfmpeg() {
  if (ffmpegPath !== undefined) return ffmpegPath;
  try { const m = await import('ffmpeg-static'); ffmpegPath = m.default || null; } catch { ffmpegPath = null; }
  return (ffmpegPath = ffmpegPath || 'ffmpeg');
}

// WAV -> OGG/Opus. Returns null when ffmpeg is not installed or fails (the caller then sends the WAV file).
export async function toOggOpus(wav) {
  const bin = await findFfmpeg();
  return new Promise((resolve) => {
    let p;
    try { p = spawn(bin, ['-v', 'error', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch { return resolve(null); }
    const out = [];
    const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } resolve(null); }, 20000);
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.stdout.on('data', (c) => out.push(c));
    p.on('close', (code) => { clearTimeout(timer); const buf = Buffer.concat(out); resolve(code === 0 && buf.length > 200 ? buf : null); });
    p.stdin.on('error', () => {});
    p.stdin.end(wav);
  });
}
