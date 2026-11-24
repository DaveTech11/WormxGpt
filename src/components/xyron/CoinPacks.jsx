import React, { useState } from "react";
import { api } from "../../api/client";
import { openUpgrade, packLabel } from "../../lib/wormxConfig";

// Red coin-pack buttons. Tapping one opens the upgrade chat with a ready message copied to the clipboard.
export default function CoinPacks({ packs = [], url }) {
  const [copied, setCopied] = useState("");
  if (!packs.length) return null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {packs.map((p) => (
          <button key={p.id} type="button" onClick={() => { openUpgrade(api, url, p); setCopied(p.coins); }} className="rounded-full border border-red-600/60 px-3.5 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-600 hover:text-white active:scale-95">
            {packLabel(p)}
          </button>
        ))}
      </div>
      {copied && <p className="mt-1.5 text-[11px] text-neutral-500">Message copied. Paste it in the chat to order the {copied} coins pack.</p>}
    </div>
  );
}
