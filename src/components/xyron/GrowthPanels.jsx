import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Link2, Copy, Check, Loader2, Trash2, KeyRound, Plus, Code2 } from "lucide-react";
import { api } from "../../api/client";
import { copyToClipboard } from "../../lib/clipboard";

const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl";
const field = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-white/25";
const btnLight = "inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40";
const btnGhost = "inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 disabled:opacity-40";

function CopyBtn({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btnGhost} onClick={async () => { try { await copyToClipboard(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />} {done ? "Copied" : label}
    </button>
  );
}

// Settings -> Invite & share: referral link (both people get free Premium days) and the chats you shared publicly.
export function InvitePanel({ user }) {
  const [ref, setRef] = useState(null);
  const [shares, setShares] = useState(null);
  const [err, setErr] = useState("");
  const load = async () => {
    try {
      const [r, s] = await Promise.all([api.referral.me(), api.share.mine()]);
      setRef(r); setShares(s.shares || []);
    } catch (e) { setErr(e.message || "Could not load."); setShares([]); }
  };
  useEffect(() => { if (user) load(); }, [user]);

  if (!user) {
    return <div className={card}><p className="text-sm text-neutral-200">Invite & share</p><p className="mt-1 text-xs text-neutral-500">Sign in to get your invite link.</p><Link to="/login" className="mt-3 inline-block text-sm text-violet-300">Sign in →</Link></div>;
  }
  const link = ref ? `${window.location.origin}/register?ref=${ref.code}` : "";
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-pink-500/15 p-2"><Gift className="h-4 w-4 text-pink-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Invite a friend, you both get free Premium</p>
            <p className="mt-1 text-xs text-neutral-500">
              When someone signs up with your link, you and your friend each get {ref?.daysPerInvite ?? 3} days of Premium. Up to {ref?.maxInvites ?? 10} friends count.
            </p>
            {ref && (
              <>
                <div className="mt-3 flex gap-2"><input readOnly value={link} className={field} onFocus={(e) => e.target.select()} /><CopyBtn text={link} /></div>
                <p className="mt-2 text-[11px] text-neutral-500">{ref.invited} joined · {ref.daysEarned} Premium days earned</p>
              </>
            )}
            {!ref && !err && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}
            {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-sky-500/15 p-2"><Link2 className="h-4 w-4 text-sky-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Shared chats</p>
            <p className="mt-1 text-xs text-neutral-500">Use “Share link” in a chat&apos;s menu. People with the link see a read-only copy of the text (no files, no name). Remove a link and it stops working.</p>
            {shares === null && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}
            {shares && shares.length === 0 && <p className="mt-3 text-xs text-neutral-600">No shared chats yet.</p>}
            {shares && shares.map((s) => (
              <div key={s.token} className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
                <div className="min-w-0 flex-1"><p className="truncate text-xs text-neutral-200">{s.title}</p><p className="text-[11px] text-neutral-600">{s.count} messages · {s.views} views</p></div>
                <CopyBtn text={`${window.location.origin}/s/${s.token}`} label="Link" />
                <button type="button" className={`${btnGhost} text-red-300`} aria-label="Remove link" onClick={async () => { await api.share.revoke(s.token).catch(() => {}); load(); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Settings -> Developer API: personal keys + a ready-to-copy example for POST /v1/chat.
export function DevApiPanel({ user }) {
  const [info, setInfo] = useState(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = async () => { try { setInfo(await api.devkeys.list()); } catch (e) { setErr(e.message || "Could not load keys."); } };
  useEffect(() => { if (user) load(); }, [user]);

  if (!user) {
    return <div className={card}><p className="text-sm text-neutral-200">Developer API</p><p className="mt-1 text-xs text-neutral-500">Sign in to create an API key.</p><Link to="/login" className="mt-3 inline-block text-sm text-violet-300">Sign in →</Link></div>;
  }
  const create = async () => {
    setBusy(true); setErr("");
    try { const r = await api.devkeys.create(name); setFresh(r.key); setName(""); await load(); }
    catch (e) { setErr(e.message || "Could not create the key."); } finally { setBusy(false); }
  };
  const base = window.location.origin;
  const curl = `curl ${base}/v1/chat \\\n  -H "Authorization: Bearer ${fresh || "xy_live_YOUR_KEY"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"input": "Say hello"}'`;
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-emerald-500/15 p-2"><Code2 className="h-4 w-4 text-emerald-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Developer API</p>
            <p className="mt-1 text-xs text-neutral-500">Call Wormx GPT from your own code. Keep keys on your server, never in a website or app. {info && `Your plan: ${info.perMinute} requests/min, ${info.dailyLimit}/day.`}</p>
            <div className="mt-3 flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Key name (e.g. my-website)" className={field} />
              <button type="button" onClick={create} disabled={busy || (info && info.keys.length >= 5)} className={btnLight}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create key</button>
            </div>
            {fresh && (
              <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-200">Copy your key now. It is shown only once.</p>
                <div className="mt-2 flex gap-2"><input readOnly value={fresh} className={`${field} font-mono`} onFocus={(e) => e.target.select()} /><CopyBtn text={fresh} /></div>
              </div>
            )}
            {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
          </div>
        </div>
      </div>

      <div className={card}>
        <p className="flex items-center gap-2 text-sm text-neutral-200"><KeyRound className="h-4 w-4 text-neutral-400" /> Your keys</p>
        {!info && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}
        {info && info.keys.length === 0 && <p className="mt-2 text-xs text-neutral-600">No keys yet.</p>}
        {info && info.keys.map((k) => (
          <div key={k.id} className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
            <div className="min-w-0 flex-1"><p className="truncate text-xs text-neutral-200">{k.name} <span className="font-mono text-neutral-500">{k.prefix}</span></p><p className="text-[11px] text-neutral-600">{k.calls} calls · {k.today} today{k.lastUsed ? ` · last used ${new Date(k.lastUsed).toLocaleDateString()}` : " · never used"}</p></div>
            <button type="button" className={`${btnGhost} text-red-300`} onClick={async () => { if (window.confirm(`Revoke "${k.name}"? Apps using it stop working immediately.`)) { await api.devkeys.revoke(k.id).catch(() => {}); load(); } }}><Trash2 className="h-3.5 w-3.5" /> Revoke</button>
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between"><p className="text-sm text-neutral-200">Quickstart</p><CopyBtn text={curl} /></div>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-neutral-300">{curl}</pre>
        <p className="mt-3 text-[11px] text-neutral-500">Body: <span className="font-mono">input</span> (string) or <span className="font-mono">messages</span> [{"{role, content}"}] ending with a user message; optional <span className="font-mono">system</span>. Response: <span className="font-mono">{`{ "id", "model", "output", "usage" }`}</span>. Errors: 401 bad key, 429 rate/daily limit, 502 AI unavailable.</p>
      </div>
    </div>
  );
}
