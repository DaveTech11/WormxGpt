import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Plus, Loader2, Trash2, ExternalLink, Check, X, Power, RefreshCw, Pencil, Terminal, Send, Download, Upload, BarChart3, Wrench, Webhook, Mic } from "lucide-react";
import { api } from "../../api/client";

const field =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-white/25";
const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl";
const btnLight =
  "inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40";
const btnGhost =
  "inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 disabled:opacity-40";

const TOOLS = [
  ["web_search", "Web search", "Look up fresh facts and news"],
  ["read_page", "Read links", "Open a page someone sends"],
  ["calculator", "Calculator", "Exact maths"],
  ["time", "Clock", "Date and time in any time zone"],
  ["remind", "Reminders", "Message the chat again later"],
  ["notes", "Notes", "Remember facts about each person"],
  ["weather", "Weather", "Live weather and 3-day forecast"],
  ["currency", "Currency", "Live exchange rates (incl. NGN)"],
  ["github", "GitHub", "Look up any public repository"],
];
const blankCmd = () => ({ name: "", description: "", prompt: "" });
const blankHook = () => ({ name: "", description: "", url: "", secret: "", enabled: true });
const DEFAULT_VOICE = { enabled: false, voice: "lessac", speed: "medium" };

// Webhook tools: your own HTTPS API, exposed to the bot as a tool it can call (orders, bookings, stock, anything).
function WebhooksEditor({ value, onChange }) {
  const list = value || [];
  const set = (i, patch) => onChange(list.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="flex items-center gap-1.5 text-sm text-neutral-200"><Webhook className="h-3.5 w-3.5 text-emerald-300" /> Webhook tools</span>
          <span className="block text-xs text-neutral-500">Let the bot call your own API. It sends <span className="font-mono">POST</span> JSON with the fields the AI chose; your reply goes back to the AI. Signed with <span className="font-mono">X-Wormx-Signature</span> (HMAC-SHA256) when you set a secret. HTTPS only.</span>
        </span>
        <button type="button" disabled={list.length >= 5} onClick={() => onChange([...list, blankHook()])} className={btnGhost}><Plus className="h-3.5 w-3.5" /> Add</button>
      </div>
      {list.map((h, i) => (
        <div key={i} className="mt-3 space-y-2 rounded-lg bg-white/[0.03] p-2.5">
          <div className="flex gap-2">
            <input value={h.name} onChange={(e) => set(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() })} maxLength={32} placeholder="tool name (e.g. check_order)" className={`${field} font-mono`} />
            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-neutral-400"><input type="checkbox" checked={h.enabled !== false} onChange={() => set(i, { enabled: h.enabled === false })} className="h-3.5 w-3.5 accent-emerald-400" /> On</label>
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className={btnGhost} aria-label="Remove webhook"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <input value={h.description} onChange={(e) => set(i, { description: e.target.value })} maxLength={200} placeholder='What it does and what to send, e.g. Look up an order. Send {"order_id": string}.' className={field} />
          <input value={h.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://api.yourshop.com/bot/check-order" className={field} spellCheck={false} />
          <input value={h.secret || ""} onChange={(e) => set(i, { secret: e.target.value })} type="password" autoComplete="off" placeholder={h.hasSecret ? "Secret saved - type a new one to replace it" : "Signing secret (optional)"} className={field} />
        </div>
      ))}
    </div>
  );
}

// Voice replies: the bot also sends its answer as a Telegram voice note (Vortyx Pulse voices).
function VoiceSettings({ value, onChange, available }) {
  const v = value || DEFAULT_VOICE;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={!!v.enabled} onChange={() => onChange({ ...v, enabled: !v.enabled })} className="mt-0.5 h-4 w-4 accent-pink-400" />
        <span>
          <span className="flex items-center gap-1.5 text-sm text-neutral-200"><Mic className="h-3.5 w-3.5 text-pink-300" /> Voice replies</span>
          <span className="block text-xs text-neutral-500">Also send every answer as a voice note. People can send /voice to switch it off for themselves.{available === false && " (Voice isn't set up on this server yet.)"}</span>
        </span>
      </label>
      {v.enabled && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select value={v.voice} onChange={(e) => onChange({ ...v, voice: e.target.value })} className={field}>
            {["lessac", "amy", "cori", "jenny", "ryan", "joe", "alan"].map((x) => <option key={x} value={x} className="bg-neutral-900">{x}</option>)}
          </select>
          <select value={v.speed} onChange={(e) => onChange({ ...v, speed: e.target.value })} className={field}>
            {["slow", "medium", "fast"].map((x) => <option key={x} value={x} className="bg-neutral-900">{x}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// Custom slash commands: /name text -> your prompt, with {{input}} replaced by what the person typed.
function CommandsEditor({ value, onChange }) {
  const list = value || [];
  const set = (i, patch) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between">
        <span>
          <span className="block text-sm text-neutral-200">Custom commands</span>
          <span className="block text-xs text-neutral-500">Make your own /commands. Use <span className="font-mono">{"{{input}}"}</span> where the person&apos;s text should go.</span>
        </span>
        <button type="button" disabled={list.length >= 12} onClick={() => onChange([...list, blankCmd()])} className={btnGhost}><Plus className="h-3.5 w-3.5" /> Add</button>
      </div>
      {list.map((c, i) => (
        <div key={i} className="mt-3 space-y-2 rounded-lg bg-white/[0.03] p-2.5">
          <div className="flex gap-2">
            <input value={c.name} onChange={(e) => set(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() })} maxLength={32} placeholder="command (e.g. summarize)" className={`${field} font-mono`} />
            <input value={c.description} onChange={(e) => set(i, { description: e.target.value })} maxLength={60} placeholder="Short description" className={field} />
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className={btnGhost} aria-label="Remove command"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <textarea value={c.prompt} onChange={(e) => set(i, { prompt: e.target.value })} rows={2} maxLength={800} placeholder="Summarize this in 3 bullet points: {{input}}" className={field} />
        </div>
      ))}
    </div>
  );
}

// Playground: chat with the bot right here and see every tool it used (nothing is sent to Telegram).
function Playground({ bot }) {
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = React.useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [turns, busy]);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const history = turns.map((x) => ({ role: x.role, content: x.text }));
    setTurns((p) => [...p, { role: "user", text: t }]);
    setText(""); setBusy(true);
    try {
      const r = await api.bots.test(bot.id, t, history);
      setTurns((p) => [...p, { role: "assistant", text: r.reply, trace: r.trace || [], ms: r.ms }]);
    } catch (e) {
      setTurns((p) => [...p, { role: "assistant", text: e.message || "Test failed.", error: true }]);
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold text-neutral-200"><Terminal className="h-3.5 w-3.5 text-sky-300" /> Playground</p>
        {turns.length > 0 && <button type="button" onClick={() => setTurns([])} className="text-[11px] text-neutral-500 hover:text-neutral-300">Clear</button>}
      </div>
      <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
        {turns.length === 0 && <p className="text-[11px] text-neutral-600">Try it without Telegram. Ask for the weather, a GitHub repo, or run one of your /commands. Tool calls show up under each answer.</p>}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-xs ${t.role === "user" ? "bg-white/10 text-neutral-100" : t.error ? "bg-red-500/10 text-red-300" : "bg-white/[0.04] text-neutral-200"}`}>{t.text}</div>
            {t.trace?.length > 0 && (
              <div className="mt-1 space-y-1 text-left">
                {t.trace.map((x, k) => (
                  <details key={k} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px]">
                    <summary className="cursor-pointer text-neutral-400"><Wrench className="mr-1 inline h-3 w-3" /><span className={x.ok ? "text-emerald-300" : "text-red-300"}>{x.tool}</span> <span className="text-neutral-600">{x.ms}ms</span></summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-neutral-500">{JSON.stringify(x.args)}{"\n→ "}{x.result}</pre>
                  </details>
                ))}
              </div>
            )}
            {t.ms != null && <p className="mt-0.5 text-[10px] text-neutral-700">{t.ms}ms{t.trace?.length ? ` · ${t.trace.length} tool call${t.trace.length > 1 ? "s" : ""}` : ""}</p>}
          </div>
        ))}
        {busy && <p className="text-[11px] text-neutral-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Thinking…</p>}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Message your bot…" maxLength={2000} className={field} />
        <button type="button" onClick={send} disabled={busy || !text.trim()} className={btnLight} aria-label="Send"><Send className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

// Last 14 days of replies, top tools, response time.
function Analytics({ stats }) {
  if (!stats) return null;
  const max = Math.max(1, ...stats.series.map((x) => x.m));
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-neutral-200"><BarChart3 className="h-3.5 w-3.5 text-violet-300" /> Analytics · last 30 days</p>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[["Replies", stats.messages30d], ["People", stats.users], ["Avg time", stats.avgMs ? `${(stats.avgMs / 1000).toFixed(1)}s` : "-"], ["Errors", stats.errors30d]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-white/[0.04] py-1.5"><p className="text-sm font-semibold text-neutral-100">{v}</p><p className="text-[10px] text-neutral-600">{l}</p></div>
        ))}
      </div>
      <div className="mt-3 flex h-12 items-end gap-1" role="img" aria-label="Replies per day, last 14 days">
        {stats.series.map((x) => <div key={x.d} title={`${x.d}: ${x.m}`} className="flex-1 rounded-sm bg-violet-400/70" style={{ height: `${Math.max(4, (x.m / max) * 100)}%`, opacity: x.m ? 1 : 0.2 }} />)}
      </div>
      {stats.tools.length > 0 && (
        <p className="mt-2 text-[11px] text-neutral-500">Top tools: {stats.tools.map((t) => `${t.name} ×${t.n}`).join(" · ")}</p>
      )}
    </div>
  );
}

const DEFAULT_AGENT = { enabled: true, tools: Object.fromEntries(TOOLS.map(([k]) => [k, true])) };

// Agent mode: the bot can use tools and take several steps before it answers.
function AgentSettings({ value, onChange }) {
  const agent = value || DEFAULT_AGENT;
  const setTool = (k) => onChange({ ...agent, tools: { ...agent.tools, [k]: !agent.tools[k] } });
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={agent.enabled} onChange={() => onChange({ ...agent, enabled: !agent.enabled })} className="mt-0.5 h-4 w-4 accent-sky-400" />
        <span>
          <span className="block text-sm text-neutral-200">Agent mode</span>
          <span className="block text-xs text-neutral-500">The bot can think in steps and use tools before it replies. Replies may take a little longer.</span>
        </span>
      </label>
      {agent.enabled && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {TOOLS.map(([k, label, hint]) => (
            <label key={k} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2">
              <input type="checkbox" checked={agent.tools[k] !== false} onChange={() => setTool(k)} className="mt-0.5 h-3.5 w-3.5 accent-sky-400" />
              <span>
                <span className="block text-xs text-neutral-200">{label}</span>
                <span className="block text-[11px] text-neutral-600">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Settings -> Bots. Connect your own Telegram bot (token from @BotFather) and Wormx GPT AI answers it.
export default function BotsPanel({ user }) {
  const [bots, setBots] = useState(null);
  const [limit, setLimit] = useState(2);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ token: "", name: "", persona: "", greeting: "", agent: DEFAULT_AGENT, commands: [], webhooks: [], voice: DEFAULT_VOICE });
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ name: "", persona: "", greeting: "", agent: DEFAULT_AGENT, commands: [] });
  const [busy, setBusy] = useState("");
  const [openPg, setOpenPg] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const r = await api.bots.list();
      setBots(r.bots || []);
      setLimit(r.limit || 2);
    } catch (e) {
      setBots([]);
      setErr(e.message || "Could not load your bots.");
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const run = async (key, fn, okMsg) => {
    setErr(""); setMsg(""); setBusy(key);
    try { await fn(); if (okMsg) setMsg(okMsg); await load(); return true; }
    catch (e) { setErr(e.message || "Something went wrong."); return false; }
    finally { setBusy(""); }
  };

  const create = async () => {
    const ok = await run("create", () => api.bots.create(form), "Bot connected. Open it in Telegram and say hi.");
    if (ok) { setForm({ token: "", name: "", persona: "", greeting: "", agent: DEFAULT_AGENT, commands: [] }); setAdding(false); }
  };

  const startEdit = (b) => {
    setEditId(b.id);
    setEdit({ name: b.name, persona: b.persona, greeting: b.greeting, agent: b.agent || DEFAULT_AGENT, commands: b.commands || [], webhooks: b.webhooks || [], voice: b.voice || DEFAULT_VOICE });
  };

  const saveEdit = async () => {
    const ok = await run("save", () => api.bots.update(editId, edit), "Saved.");
    if (ok) setEditId(null);
  };

  // Share or back up a bot's setup as a small JSON file (no token, no private data).
  const exportBot = (b) => {
    const cfg = { xyronBot: 1, name: b.name, persona: b.persona, greeting: b.greeting, agent: b.agent, commands: b.commands || [], webhooks: (b.webhooks || []).map(({ name, description, url, enabled }) => ({ name, description, url, enabled })), voice: b.voice };
    const url = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${(b.username || b.name || "bot").replace(/[^\w-]/g, "_")}.xyronbot.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const importBot = async (b, file) => {
    if (!file) return;
    try {
      const cfg = JSON.parse(await file.text());
      if (!cfg || cfg.xyronBot !== 1) throw new Error("not a Wormx GPT bot file");
      await run("imp" + b.id, () => api.bots.update(b.id, { name: cfg.name, persona: cfg.persona, greeting: cfg.greeting, agent: cfg.agent, commands: cfg.commands, webhooks: cfg.webhooks, voice: cfg.voice }), "Imported. The bot now uses that setup.");
    } catch (e) { setErr(`Could not import that file: ${e.message}`); }
  };

  const remove = (b) => {
    if (!window.confirm(`Disconnect @${b.username}? It will stop answering messages.`)) return;
    run("del" + b.id, () => api.bots.remove(b.id), "Bot disconnected.");
  };

  if (!user) {
    return (
      <div className={card}>
        <p className="text-sm text-neutral-200">Bots</p>
        <p className="mt-1 text-xs text-neutral-500">Sign in to connect a bot.</p>
        <Link to="/login" className="mt-3 inline-block text-sm text-violet-300 hover:text-violet-200">Sign in →</Link>
      </div>
    );
  }

  const full = bots && bots.length >= limit;

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-sky-500/15 p-2"><Bot className="h-4 w-4 text-sky-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Your bots</p>
            <p className="mt-1 text-xs text-neutral-500">
              Connect your own Telegram bot and Wormx GPT AI will answer the people who message it, with the name and
              personality you choose. Works in private chats.
            </p>
            <p className="mt-1 text-[11px] text-neutral-600">{bots ? bots.length : 0} of {limit} bots used</p>
          </div>
          {!adding && (
            <button type="button" disabled={full || bots === null} onClick={() => { setAdding(true); setErr(""); setMsg(""); }} className={btnLight}>
              <Plus className="h-3.5 w-3.5" /> Add bot
            </button>
          )}
        </div>
        {full && !adding && (
          <p className="mt-3 text-xs text-amber-300">
            You have reached your bot limit. Disconnect one, or <Link to="/premium" className="underline">upgrade</Link> for more.
          </p>
        )}
        {msg && <p className="mt-3 text-xs text-emerald-300">{msg}</p>}
        {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
      </div>

      {adding && (
        <div className={card}>
          <p className="text-sm text-neutral-200">Connect a Telegram bot</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-neutral-500">
            <li>In Telegram, open <span className="text-neutral-300">@BotFather</span> and send <span className="font-mono text-neutral-300">/newbot</span>.</li>
            <li>Pick a name and username, then copy the token it gives you.</li>
            <li>Paste the token below.</li>
          </ol>
          <div className="mt-4 space-y-3">
            <input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="Bot token, e.g. 123456789:AAH..." className={field} autoComplete="off" spellCheck={false} />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Display name (optional)" maxLength={40} className={field} />
            <textarea value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} rows={3} maxLength={1500} placeholder="Personality / instructions, e.g. You are a friendly support agent for my shop. Keep answers short." className={field} />
            <input value={form.greeting} onChange={(e) => setForm({ ...form, greeting: e.target.value })} placeholder="Welcome message for /start (optional)" maxLength={500} className={field} />
            <AgentSettings value={form.agent} onChange={(agent) => setForm({ ...form, agent })} />
            <CommandsEditor value={form.commands} onChange={(commands) => setForm({ ...form, commands })} />
            <WebhooksEditor value={form.webhooks} onChange={(webhooks) => setForm({ ...form, webhooks })} />
            <VoiceSettings value={form.voice} onChange={(voice) => setForm({ ...form, voice })} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={create} disabled={busy === "create" || !form.token.trim()} className={btnLight}>
                {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Connect bot
              </button>
              <button type="button" onClick={() => setAdding(false)} className={btnGhost}><X className="h-3.5 w-3.5" /> Cancel</button>
            </div>
            <p className="text-[11px] text-neutral-600">Your token is stored encrypted and is never shown again. Keep it private.</p>
          </div>
        </div>
      )}

      {bots === null && (
        <div className={card}><Loader2 className="h-4 w-4 animate-spin text-neutral-500" /></div>
      )}

      {bots && bots.length === 0 && !adding && (
        <div className={`${card} text-center`}>
          <p className="text-sm text-neutral-300">No bots yet</p>
          <p className="mt-1 text-xs text-neutral-500">Press “Add bot” to connect your first one.</p>
        </div>
      )}

      {bots && bots.map((b) => (
        <div key={b.id} className={card}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-white/10 p-2"><Bot className="h-4 w-4 text-neutral-200" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm text-neutral-200">{b.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${b.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-neutral-400"}`}>
                  {b.enabled ? "Live" : "Paused"}
                </span>
                {b.agent?.enabled && (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">
                    Agent · {Object.values(b.agent.tools || {}).filter(Boolean).length} tools
                  </span>
                )}
              </div>
              {b.link && (
                <a href={b.link} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
                  @{b.username} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <p className="mt-1 text-[11px] text-neutral-600">
                {b.messages} replies in total · {b.today}/{b.dailyLimit} today
              </p>
              {b.lastError && <p className="mt-1 text-[11px] text-amber-300">Last problem: {b.lastError}</p>}

              {editId === b.id ? (
                <div className="mt-3 space-y-3">
                  <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={40} className={field} placeholder="Display name" />
                  <textarea value={edit.persona} onChange={(e) => setEdit({ ...edit, persona: e.target.value })} rows={3} maxLength={1500} className={field} placeholder="Personality / instructions" />
                  <input value={edit.greeting} onChange={(e) => setEdit({ ...edit, greeting: e.target.value })} maxLength={500} className={field} placeholder="Welcome message" />
                  <AgentSettings value={edit.agent} onChange={(agent) => setEdit({ ...edit, agent })} />
                  <CommandsEditor value={edit.commands} onChange={(commands) => setEdit({ ...edit, commands })} />
                  <WebhooksEditor value={edit.webhooks} onChange={(webhooks) => setEdit({ ...edit, webhooks })} />
                  <VoiceSettings value={edit.voice} onChange={(voice) => setEdit({ ...edit, voice })} available={b.voiceAvailable} />
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEdit} disabled={busy === "save"} className={btnLight}>
                      {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                    </button>
                    <button type="button" onClick={() => setEditId(null)} className={btnGhost}>Cancel</button>
                  </div>
                </div>
              ) : (
                b.persona && <p className="mt-2 line-clamp-2 text-xs text-neutral-500">{b.persona}</p>
              )}

              {editId !== b.id && b.commands?.length > 0 && (
                <p className="mt-2 text-[11px] text-neutral-500">Commands: {b.commands.map((c) => `/${c.name}`).join(" ")}</p>
              )}
              {editId !== b.id && <Analytics stats={b.stats} />}
              {editId !== b.id && openPg === b.id && <Playground bot={b} />}

              {editId !== b.id && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(b)} className={btnGhost}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  <button type="button" onClick={() => setOpenPg(openPg === b.id ? null : b.id)} className={btnGhost}><Terminal className="h-3.5 w-3.5" /> Playground</button>
                  <button type="button" onClick={() => exportBot(b)} className={btnGhost}><Download className="h-3.5 w-3.5" /> Export</button>
                  <label className={`${btnGhost} cursor-pointer`}><Upload className="h-3.5 w-3.5" /> Import<input type="file" accept="application/json" className="hidden" onChange={(e) => { importBot(b, e.target.files?.[0]); e.target.value = ""; }} /></label>
                  <button type="button" disabled={busy === "pw" + b.id} onClick={() => run("pw" + b.id, () => api.bots.update(b.id, { enabled: !b.enabled }))} className={btnGhost}>
                    <Power className="h-3.5 w-3.5" /> {b.enabled ? "Pause" : "Resume"}
                  </button>
                  <button type="button" disabled={busy === "rc" + b.id} onClick={() => run("rc" + b.id, () => api.bots.update(b.id, { reconnect: true }), "Reconnected.")} className={btnGhost}>
                    {busy === "rc" + b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reconnect
                  </button>
                  <button type="button" disabled={busy === "del" + b.id} onClick={() => remove(b)} className={`${btnGhost} text-red-300 hover:text-red-200`}>
                    <Trash2 className="h-3.5 w-3.5" /> Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
