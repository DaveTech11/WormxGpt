import React, { useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { api } from "../../api/client";

// Admin -> "Coins". Give a user coins by email, either a level preset or a custom amount.
// Free users start with 10 coins and every AI reply costs 1. Premium users and admins are not charged.
export default function AdminCoinsPanel() {
  const [levels, setLevels] = useState({});
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("add");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    api.premium.coinLevels().then((r) => setLevels(r?.levels || {})).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true); setErr(""); setNote("");
    try {
      const r = await api.premium.grantCoins({ email, level, amount: Number(amount) || 0, mode });
      setNote(`${r.email}: ${r.before} → ${r.coins} coins`);
    } catch (e) {
      setErr(e.message || "Could not update coins.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-white/30";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl space-y-3">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-amber-300" />
        <p className="text-sm text-neutral-200">Give coins</p>
      </div>
      <input className={field} type="email" placeholder="User email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <select className={field} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Custom amount</option>
          {Object.entries(levels).map(([k, v]) => (
            <option key={k} value={k}>{k} ({v} coins)</option>
          ))}
        </select>
        <input className={field} type="number" min="0" placeholder="Amount" value={amount}
               disabled={!!level} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex gap-2">
        {["add", "set"].map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-1.5 text-xs ${mode === m ? "bg-white/20 text-white" : "bg-white/5 text-neutral-400"}`}>
            {m === "add" ? "Add to balance" : "Set balance"}
          </button>
        ))}
      </div>
      <button type="button" onClick={submit} disabled={busy || !email}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs text-neutral-100 hover:bg-white/20 disabled:opacity-40">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Apply
      </button>
      {note && <p className="text-xs text-emerald-300">{note}</p>}
      {err && <p className="text-xs text-red-300">{err}</p>}
    </div>
  );
}
