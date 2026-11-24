import React, { useEffect, useState } from "react";
import { Check, Loader2, Send, ShieldCheck } from "lucide-react";
import { REQUIRED_CHANNELS as DEFAULT_CHANNELS } from "../../lib/wormxConfig";
import { api } from "../../api/client";

// Shown once, the first time a person sends a message: join three channels, tap Verify on each, then continue.
// Each row goes Join -> Verify -> Verified. Continue unlocks when all three are verified.
export default function JoinChannelsGate({ open, onDone, channels = DEFAULT_CHANNELS }) {
  const REQUIRED_CHANNELS = channels;
  const [state, setState] = useState({}); // id -> "joined" | "checking" | "verified"

  useEffect(() => { if (open) setState({}); }, [open]);
  if (!open) return null;

  const join = (c) => {
    try { window.open(c.url, "_blank", "noopener,noreferrer"); } catch { /* popup blocked: the Verify button still appears */ }
    setState((s) => ({ ...s, [c.id]: "joined" }));
  };
  const [msg, setMsg] = useState("");
  // The server really checks Telegram when the bot is set up and the person linked their Telegram; otherwise it trusts the tap.
  const verify = async (c) => {
    setMsg("");
    setState((s) => ({ ...s, [c.id]: "checking" }));
    const started = Date.now();
    let ok = true, note = "";
    try { const r = await api.premium.verifyChannel(c.id); ok = r?.verified !== false; note = r?.message || ""; } catch { ok = true; /* server unreachable: don't block the person */ }
    await new Promise((res) => setTimeout(res, Math.max(0, 900 - (Date.now() - started))));
    if (!ok) setMsg(note || "We could not find you in that channel. Join it, then tap Verify again.");
    setState((s) => ({ ...s, [c.id]: ok ? "verified" : "joined" }));
  };

  const verifiedCount = REQUIRED_CHANNELS.filter((c) => state[c.id] === "verified").length;
  const allDone = verifiedCount === REQUIRED_CHANNELS.length;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md sm:p-4" role="dialog" aria-modal="true" aria-labelledby="wormx-join-title">
      <div className="relative my-auto w-full max-w-[420px] overflow-hidden rounded-[24px] border border-red-600/40 bg-black p-4 shadow-[0_0_60px_-10px_rgba(220,38,38,0.55)]">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-red-600/25 blur-3xl" />
        <div className="relative sm:p-2">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-red-500/40 bg-red-600/15 text-red-500">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 id="wormx-join-title" className="mt-4 text-xl font-semibold text-white">Join our channels to continue</h2>
          <p className="mt-1.5 text-sm leading-6 text-neutral-400">Join all three channels, then tap Verify on each one. You only do this once.</p>

          {msg && <p className="mt-3 rounded-xl border border-red-600/40 bg-red-600/10 px-3 py-2 text-xs text-red-300">{msg}</p>}
          <ul className="mt-5 space-y-2.5">
            {REQUIRED_CHANNELS.map((c) => {
              const st = state[c.id];
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-red-600/15 text-red-500"><Send className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{c.name}</p>
                    <p className="truncate text-xs text-neutral-500">{c.blurb}</p>
                  </div>
                  {st === "verified" ? (
                    <span className="flex h-9 flex-none items-center gap-1 rounded-full bg-red-600/15 px-3 text-xs font-semibold text-red-400"><Check className="h-4 w-4" /> Verified</span>
                  ) : st === "checking" ? (
                    <span className="flex h-9 flex-none items-center gap-1.5 rounded-full border border-red-600/40 px-3 text-xs font-semibold text-red-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking</span>
                  ) : st === "joined" ? (
                    <button type="button" onClick={() => verify(c)} className="h-9 flex-none rounded-full bg-red-600 px-4 text-xs font-semibold text-white transition hover:bg-red-500 active:scale-95">Verify</button>
                  ) : (
                    <button type="button" onClick={() => join(c)} className="h-9 flex-none rounded-full border border-red-600/60 px-4 text-xs font-semibold text-red-400 transition hover:bg-red-600/15 active:scale-95">Join</button>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            disabled={!allDone}
            onClick={onDone}
            className="mt-5 w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
          >
            {allDone ? "Continue" : `Verified ${verifiedCount}/${REQUIRED_CHANNELS.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
