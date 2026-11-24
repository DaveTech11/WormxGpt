import React, { useEffect, useState } from "react";
import { Send, Loader2, RefreshCw, Trash2, Clock } from "lucide-react";
import { api } from "../../api/client";

// Admin -> "Sign-in codes".
// Shows the verification codes currently outstanding, and whether Telegram
// delivery is live. Codes are stored only as a salted hash, so this panel lists
// which emails have a live code (and how long is left) rather than the digits:
// the digits themselves travel to Telegram (or the user's inbox) only.
export default function AdminCodesPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.premium.codes();
      setData(r);
    } catch (e) {
      setErr(e.message || "Could not load codes.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const clearAll = async () => {
    setBusy(true); setErr(""); setNote("");
    try {
      const r = await api.premium.clearCodes();
      setNote(`Cleared ${r?.cleared ?? 0} code(s).`);
      await load();
    } catch (e) { setErr(e.message || "Could not clear."); }
    finally { setBusy(false); }
  };

  const codes = data?.codes || [];
  const tg = data?.telegram;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-sky-300" />
            <p className="text-sm text-neutral-200">Sign-in codes</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-neutral-200 hover:bg-white/20 disabled:opacity-40">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </button>
            <button type="button" onClick={clearAll} disabled={busy || !codes.length}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-neutral-200 hover:bg-white/20 disabled:opacity-40">
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          </div>
        </div>

        {tg && (
          <p className="mt-2 text-xs text-neutral-500">
            Telegram delivery:{" "}
            {tg.configured ? (
              <span className="text-emerald-300">
                on{tg.operatorChat ? " — unlinked emails go to the operator chat" : " — set XYRON_CODE_CHAT_ID for unlinked emails"}
              </span>
            ) : (
              <span className="text-amber-300">off</span>
            )}
          </p>
        )}

        <p className="mt-2 text-[11px] text-neutral-600">
          Codes are stored as salted hashes only, so the digits are not shown here — they are delivered
          to the user (or the operator chat). This list shows which emails have a live code.
        </p>

        <div className="mt-4 space-y-2">
          {codes.length === 0 && !busy && (
            <p className="text-xs text-neutral-500">No codes waiting.</p>
          )}
          {codes.map((c) => (
            <div key={c.email}
                 className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-neutral-200">{c.email}</p>
                <p className="text-[11px] text-neutral-600">
                  {c.tries ? `${c.tries} wrong attempt${c.tries > 1 ? "s" : ""}` : "no attempts yet"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-neutral-400">
                <Clock className="h-3 w-3" />
                {Math.floor(c.secondsLeft / 60)}m {String(c.secondsLeft % 60).padStart(2, "0")}s left
              </div>
            </div>
          ))}
        </div>

        {note && <p className="mt-3 text-xs text-emerald-300">{note}</p>}
        {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
      </div>
    </div>
  );
}
