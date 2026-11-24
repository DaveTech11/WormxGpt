import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { copyToClipboard } from "../../lib/clipboard";

// Small shared pieces for the Settings panels added with the social / safety / payment features.
export const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl";
export const field = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-white/25";
export const btnLight = "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40";
export const btnGhost = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 disabled:opacity-40";
export const btnDanger = "inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40";

export function CopyBtn({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btnGhost} onClick={async () => { try { await copyToClipboard(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />} {done ? "Copied" : label}
    </button>
  );
}

export function SignInNote({ title }) {
  return (
    <div className={card}>
      <p className="text-sm text-neutral-200">{title}</p>
      <p className="mt-1 text-xs text-neutral-500">Sign in to use this.</p>
      <a href="/login" className="mt-3 inline-block text-sm text-violet-300">Sign in →</a>
    </div>
  );
}

export const when = (iso) => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} days ago`;
  return new Date(t).toLocaleDateString();
};
export const ngn = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
