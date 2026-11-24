import React, { useEffect, useState } from "react";
import { Loader2, ShieldCheck, BarChart3 } from "lucide-react";
import { api } from "../../api/client";
import { DEFAULT_WORMX_CONFIG, loadWormxConfig } from "../../lib/wormxConfig";

// Admin -> "Join popup & Upgrade Coin". Turn the first-message popup on/off, edit its three channels,
// and set the link the red "Upgrade Coin" button opens.
export default function AdminWormxPanel() {
  const [cfg, setCfg] = useState(DEFAULT_WORMX_CONFIG);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const [stats, setStats] = useState(null);
  useEffect(() => { loadWormxConfig(api).then(setCfg); api.premium.wormxStats().then(setStats).catch(() => {}); }, []);
  const setPack = (i, key, value) => setCfg((c) => ({ ...c, packs: c.packs.map((p, j) => (j === i ? { ...p, [key]: value } : p)) }));

  const setChannel = (i, key, value) => setCfg((c) => ({ ...c, channels: c.channels.map((ch, j) => (j === i ? { ...ch, [key]: value } : ch)) }));

  const save = async () => {
    setBusy(true); setErr(""); setNote("");
    try { setCfg(await api.premium.saveWormxConfig(cfg)); setNote("Saved."); }
    catch (e) { setErr(e.message || "Could not save."); }
    finally { setBusy(false); }
  };

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-red-500/60";
  return (
    <div className="rounded-2xl border border-red-600/30 bg-white/[0.03] p-5 backdrop-blur-xl space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-red-500" />
        <p className="text-sm text-neutral-200">Join popup &amp; Upgrade Coin</p>
      </div>
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        <input type="checkbox" checked={cfg.gateEnabled} onChange={(e) => setCfg({ ...cfg, gateEnabled: e.target.checked })} className="accent-red-600" />
        Ask free users to join the channels on their first message
      </label>
      {cfg.channels.map((ch, i) => (
        <div key={ch.id || i} className="grid gap-2 sm:grid-cols-2">
          <input className={field} placeholder={`Channel ${i + 1} name`} value={ch.name} onChange={(e) => setChannel(i, "name", e.target.value)} />
          <input className={field} placeholder="https://t.me/..." value={ch.url} onChange={(e) => setChannel(i, "url", e.target.value)} />
        </div>
      ))}
      <p className="pt-1 text-xs text-neutral-400">Coin packs (shown in the Upgrade Coin box and Settings). Leave the price empty to show only the coin amount.</p>
      {(cfg.packs || []).map((p, i) => (
        <div key={p.id || i} className="grid grid-cols-2 gap-2">
          <input className={field} type="number" min="1" placeholder="Coins" value={p.coins} onChange={(e) => setPack(i, "coins", e.target.value)} />
          <input className={field} placeholder="Price, e.g. ₦1,500" value={p.price} onChange={(e) => setPack(i, "price", e.target.value)} />
        </div>
      ))}
      <input className={field} placeholder="Upgrade Coin link (https://...)" value={cfg.upgradeUrl} onChange={(e) => setCfg({ ...cfg, upgradeUrl: e.target.value })} />
      <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-40">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Save
      </button>
      {note && <p className="text-xs text-emerald-300">{note}</p>}
      {err && <p className="text-xs text-red-300">{err}</p>}
      {stats && (
        <div className="mt-2 border-t border-white/10 pt-3">
          <p className="mb-2 flex items-center gap-2 text-sm text-neutral-200"><BarChart3 className="h-4 w-4 text-red-500" /> Coins &amp; join stats</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Users", stats.totalUsers], ["Free users", stats.freeUsers], ["Joined channels", stats.verified], ["Out of coins", stats.outOfCoins], ["Running low", stats.lowCoins], ["Claimed today", stats.claimedToday], ["Upgrade taps", stats.upgradeClicks], ["Referrals", stats.referrals]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"><p className="text-lg font-semibold text-white">{v ?? 0}</p><p className="text-[11px] text-neutral-500">{k}</p></div>
            ))}
          </div>
          {Object.keys(stats.packClicks || {}).length > 0 && <p className="mt-2 text-[11px] text-neutral-500">Taps by pack: {Object.entries(stats.packClicks).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
          <p className="mt-1 text-[11px] text-neutral-500">{stats.botReady ? `Real channel check is on for the ${stats.telegramLinked} people who linked Telegram. Everyone else is trusted on tap. The bot must be an admin in each channel.` : "Telegram bot token not set, so the Verify button trusts the tap."}</p>
        </div>
      )}
    </div>
  );
}
