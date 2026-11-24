import React from "react";
import { Coins, X } from "lucide-react";
import { api } from "../../api/client";
import { UPGRADE_COIN_URL, openUpgrade } from "../../lib/wormxConfig";
import CoinPacks from "./CoinPacks";

// Sits just above the chat box when the person has no coins left.
export default function CoinsUpgradeBox({ open, onClose, url = UPGRADE_COIN_URL, packs = [] }) {
  if (!open) return null;
  return (
    <div className="mb-2 max-h-[40dvh] overflow-y-auto rounded-2xl border border-red-600/40 bg-black px-3 py-3 sm:px-4 shadow-[0_0_30px_-8px_rgba(220,38,38,0.5)]" role="alert">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-red-600/15 text-red-500"><Coins className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-sm font-semibold text-white">You're out of coins</p>
          <p className="text-xs text-neutral-400">Each reply costs 1 coin. Claim your daily coins in the sidebar, or top up.</p>
        </div>
        <button type="button" onClick={() => openUpgrade(api, url)} className="flex-none rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500 active:scale-95">
          Upgrade Coin
        </button>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="grid h-8 w-8 flex-none place-items-center rounded-full text-neutral-500 transition hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <CoinPacks packs={packs} url={url} />
    </div>
  );
}
