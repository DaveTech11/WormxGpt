import React, { useCallback, useEffect, useState } from "react";
import { Coins, Infinity as InfinityIcon, Gift, AlertTriangle } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../lib/AuthContext";
import { DEFAULT_WORMX_CONFIG, loadWormxConfig, openUpgrade } from "../../lib/wormxConfig";

// Left sidebar: coin icon + coins left. Amber "running low" at 3 or fewer, red at 0, a Claim button for the daily coins,
// and infinity for Premium/admins. Refreshes after every chat reply ("wormx:coins" event), on tab focus and every 30 seconds.
export default function SidebarCoins() {
  const { user: authUser, isAuthenticated } = useAuth();
  const [info, setInfo] = useState(null);
  const [url, setUrl] = useState(DEFAULT_WORMX_CONFIG.upgradeUrl);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const refresh = useCallback(async () => {
    try { setInfo(await api.premium.coinsHistory()); } catch { /* keep showing the last number */ }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    refresh();
    loadWormxConfig(api).then((c) => setUrl(c.upgradeUrl));
    const onFocus = () => { if (!document.hidden) refresh(); };
    window.addEventListener("wormx:coins", refresh);
    window.addEventListener("focus", onFocus);
    const t = setInterval(onFocus, 30000);
    return () => { window.removeEventListener("wormx:coins", refresh); window.removeEventListener("focus", onFocus); clearInterval(t); };
  }, [isAuthenticated, refresh]);

  const claim = async () => {
    setBusy(true);
    try {
      const r = await api.premium.claimCoins();
      setFlash(r?.ok ? `+${r.added} coins${r.streak > 1 ? ` · day ${r.streak} streak` : ""}` : r?.message || "");
      await refresh();
      window.dispatchEvent(new Event("wormx:coins-changed"));
      setTimeout(() => setFlash(""), 3500);
    } catch { /* try again later */ }
    setBusy(false);
  };

  if (!isAuthenticated) return null;
  const unlimited = info ? info.unlimited : authUser?.coinsUnlimited === true;
  const coins = info && Number.isFinite(info.coins) ? info.coins : Number.isFinite(authUser?.coins) ? authUser.coins : null;
  if (!unlimited && coins === null) return null;
  const lowAt = info?.lowAt ?? 3;
  const empty = !unlimited && coins <= 0;
  const low = !unlimited && !empty && coins <= lowAt;
  const tone = empty ? "border-red-600/60 bg-red-600/10" : low ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-white/[0.04]";
  const iconTone = low ? "bg-amber-500/15 text-amber-400" : "bg-red-600/15 text-red-500";

  return (
    <div className={`mx-3 mt-2 rounded-2xl border px-3 py-2.5 ${tone}`} title="Coins left. Each reply costs 1 coin." aria-label={unlimited ? "Unlimited coins" : `${coins} coins left`}>
      <div className="flex items-center gap-3">
        <div className={`grid h-8 w-8 flex-none place-items-center rounded-full ${iconTone}`}>{low || empty ? <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Coins className="h-[18px] w-[18px]" strokeWidth={1.8} />}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1 text-[15px] font-semibold text-white">{unlimited ? <InfinityIcon className="h-5 w-5" strokeWidth={2} /> : coins}</p>
          <p className="text-[11px] text-neutral-400">{unlimited ? "Unlimited" : empty ? "Out of coins" : low ? "Running low" : coins === 1 ? "coin left" : "coins left"}</p>
        </div>
        {!unlimited && (empty || low) && (
          <button type="button" onClick={() => openUpgrade(api, url)} className="flex-none rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-500 active:scale-95">Upgrade</button>
        )}
      </div>
      {!unlimited && info?.canClaim && (
        <button type="button" onClick={claim} disabled={busy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-600/50 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-600 hover:text-white disabled:opacity-50">
          <Gift className="h-3.5 w-3.5" /> Claim {info.dailyCoins} free coins{info.nextStreak > 1 ? ` · day ${info.nextStreak}` : ""}
        </button>
      )}
      {flash && <p className="mt-1.5 text-center text-[11px] text-emerald-400">{flash}</p>}
    </div>
  );
}
