import React, { useCallback, useEffect, useState } from "react";
import { Coins, Gift } from "lucide-react";
import { api } from "../../api/client";
import { DEFAULT_WORMX_CONFIG, loadWormxConfig, openUpgrade } from "../../lib/wormxConfig";
import CoinPacks from "./CoinPacks";

const WHY = { spend: "Reply", refund: "Refund", daily: "Daily claim", admin: "Admin", referral: "Invite" };

// Settings: coin balance, daily claim, coin packs and the history of every coin that came in or went out.
export default function CoinsCard({ user }) {
  const [cfg, setCfg] = useState(DEFAULT_WORMX_CONFIG);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const load = useCallback(async () => { try { setInfo(await api.premium.coinsHistory()); } catch { /* signed out */ } }, []);
  useEffect(() => { loadWormxConfig(api).then(setCfg); if (user) load(); }, [user, load]);
  if (!user) return null;

  const unlimited = info ? info.unlimited : user.coinsUnlimited === true || user.role === "admin";
  const coins = info && Number.isFinite(info.coins) ? info.coins : Number.isFinite(user.coins) ? user.coins : null;
  const claim = async () => {
    setBusy(true); setNote("");
    try { const r = await api.premium.claimCoins(); setNote(r?.ok ? `+${r.added} coins added${r.streak > 1 ? ` (day ${r.streak} streak)` : ""}.` : r?.message || ""); await load(); window.dispatchEvent(new Event("wormx:coins")); window.dispatchEvent(new Event("wormx:coins-changed")); } catch { setNote("Could not claim right now."); }
    setBusy(false);
  };
  const rows = (info?.history || []).slice(0, 15);

  return (
    <div className="mb-4 rounded-2xl border border-red-600/30 bg-black p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-full bg-red-600/15 text-red-500"><Coins className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{unlimited ? "Unlimited replies" : coins === null ? "Coins" : `${coins} coin${coins === 1 ? "" : "s"} left`}</p>
          <p className="text-xs text-neutral-500">{unlimited ? "Your plan doesn't use coins." : "Each reply costs 1 coin."}</p>
        </div>
        {!unlimited && <button type="button" onClick={() => openUpgrade(api, cfg.upgradeUrl)} className="flex-none rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500 active:scale-95">Upgrade Coin</button>}
      </div>
      {!unlimited && info?.canClaim && (
        <button type="button" onClick={claim} disabled={busy} className="mt-3 flex items-center gap-1.5 rounded-full border border-red-600/50 px-4 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-600 hover:text-white disabled:opacity-50"><Gift className="h-3.5 w-3.5" /> Claim {info.dailyCoins} free coins today{info.nextStreak > 1 ? ` · day ${info.nextStreak} streak` : ""}</button>
      )}
      {!unlimited && info?.streak > 0 && <p className="mt-2 text-xs text-neutral-500">{info.streak}-day streak. Each day in a row adds 1 more coin, up to 4 extra.</p>}
      {note && <p className="mt-2 text-xs text-neutral-400">{note}</p>}
      {!unlimited && <CoinPacks packs={cfg.packs} url={cfg.upgradeUrl} />}
      {rows.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">Coin history</p>
          <ul className="divide-y divide-white/5 text-xs">
            {rows.map((h, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5">
                <span className={`w-9 flex-none text-right font-semibold ${h.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-300">{WHY[h.type] || h.type}: {h.note}</span>
                <span className="flex-none text-neutral-600">{new Date(h.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
