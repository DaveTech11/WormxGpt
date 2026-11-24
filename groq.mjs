// Groq is the only AI provider. Up to 4 chat models ("slots") are tried in order: slot 1 first, and if it fails
// or times out the next slot answers. Set the key and (optionally) the models in .env:
//   GROQ_API_KEY=gsk_...
//   GROQ_MODEL_1=llama-3.3-70b-versatile
//   GROQ_MODEL_2=openai/gpt-oss-120b
//   GROQ_MODEL_3=meta-llama/llama-4-scout-17b-16e-instruct
//   GROQ_MODEL_4=llama-3.1-8b-instant
//   GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct   (used when a picture is sent)
// Groq's model list changes, so check https://console.groq.com/docs/models if a model name stops working.
const GROQ_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";
const DEFAULTS = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.1-8b-instant",
];
export const MAX_SLOTS = 4;

export const groqConfigured = () => Boolean(process.env.GROQ_API_KEY);
export const visionModel = () => process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

// The four slots, in order. Empty slots fall back to the default for that slot; duplicates are dropped.
export function groqModels() {
  const out = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const m = (process.env[`GROQ_MODEL_${i}`] || DEFAULTS[i - 1] || "").trim();
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

const down = new Map(); // model -> time it may be tried again
const healthy = (m) => (down.get(m) || 0) <= Date.now();

function toMessages(messages, system, imageUrl) {
  const msgs = [];
  if (system) msgs.push({ role: "system", content: String(system) });
  const list = (Array.isArray(messages) ? messages : []).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
  if (imageUrl && list.length) {
    // attach the picture to the newest user message
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].role === "user") {
        list[i] = { role: "user", content: [{ type: "text", text: list[i].content || "Describe this image." }, { type: "image_url", image_url: { url: imageUrl } }] };
        break;
      }
    }
  }
  return msgs.concat(list);
}

async function callOne(model, msgs, { signal, onToken, timeoutMs, maxTokens }) {
  const key = process.env.GROQ_API_KEY;
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let sent = 0;
  try {
    const stream = typeof onToken === "function";
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: msgs, stream, max_tokens: maxTokens, temperature: 0.7 }),
      signal: ctl.signal,
    });
    if (!r.ok) {
      const raw = await r.text().catch(() => "");
      throw Error(`Groq ${model} error ${r.status}: ${raw.slice(0, 200)}`);
    }
    if (!stream) {
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content;
      if (!text || !String(text).trim()) throw Error(`Groq ${model} returned an empty reply`);
      return String(text);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let j; try { j = JSON.parse(payload); } catch { continue; }
        const t = j?.choices?.[0]?.delta?.content;
        if (t) { full += t; sent += t.length; onToken(t); }
      }
    }
    if (!full.trim()) throw Error(`Groq ${model} returned an empty reply`);
    return full;
  } catch (e) {
    if (sent > 0) e.partial = true; // text already reached the person: never start another model
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

// Try slot 1..4 in order. A model that just failed is skipped for a minute.
export async function callGroq(messages, system = "", { signal, onToken, timeoutMs = 45000, maxTokens = 4096, imageUrl = "" } = {}) {
  if (!groqConfigured()) throw Error("GROQ_API_KEY is not set on the server.");
  const msgs = toMessages(messages, system, imageUrl);
  const all = imageUrl ? [visionModel()] : groqModels();
  const live = all.filter(healthy);
  const order = live.length ? live : all;
  const errs = [];
  for (const model of order) {
    if (signal?.aborted) throw Error("aborted");
    try {
      return await callOne(model, msgs, { signal, onToken, timeoutMs, maxTokens });
    } catch (e) {
      if (signal?.aborted || e?.partial) throw e;
      down.set(model, Date.now() + 60000);
      errs.push(e.message);
      console.warn("Groq model failed, trying the next slot:", e.message);
    }
  }
  throw Error(errs.join(" | ") || "No Groq model answered.");
}
