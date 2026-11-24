import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Receipt, Loader2, Printer, X, Zap } from "lucide-react";
import { api } from "../../api/client";
import { card, btnLight, btnGhost, SignInNote, ngn } from "./panelKit";

const money = (x) => (x.amountNgn ? ngn(x.amountNgn) : x.amountUsd ? `$${x.amountUsd}` : "—");
const STATUS = { paid: "text-emerald-300", pending: "text-amber-300", failed: "text-red-300" };
const day = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""; };

function ReceiptView({ id, onClose }) {
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.credits.receipt(id).then((x) => setR(x.receipt)).catch((e) => setErr(e.message)); }, [id]);
  const row = (k, v) => v ? <div className="flex justify-between gap-4 py-1.5 text-xs"><span className="text-neutral-500">{k}</span><span className="text-right text-neutral-100">{v}</span></div> : null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Receipt" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#111] p-5 text-white print:border-0 print:bg-white print:text-black" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="text-base font-semibold">Receipt</p><button type="button" aria-label="Close" onClick={onClose} className="print:hidden"><X className="h-4 w-4" /></button></div>
        {!r && !err && <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-neutral-500" />}
        {err && <p className="mt-4 text-xs text-red-300">{err}</p>}
        {r && (
          <>
            <p className="mt-1 text-[11px] text-neutral-500">{r.no}</p>
            <div className="mt-4 divide-y divide-white/10">
              {row("Item", r.title)}{row("Amount", money(r))}{r.creditNgn ? row("Added to wallet", ngn(r.creditNgn)) : null}
              {row("Paid with", r.methodLabel)}{row("Channel", r.channel)}{row("Reference", r.reference)}{row("Date", day(r.at))}
              {row("Billed to", [r.customer?.name, r.customer?.email].filter(Boolean).join(" · "))}
              {r.balanceAfterNgn != null ? row("Wallet balance after", ngn(r.balanceAfterNgn)) : null}
            </div>
            <button type="button" onClick={() => window.print()} className={`${btnLight} mt-5 w-full print:hidden`}><Printer className="h-3.5 w-3.5" /> Print or save as PDF</button>
          </>
        )}
      </div>
    </div>
  );
}

// Settings -> Credits & receipts
export function CreditsPanel({ user }) {
  const [info, setInfo] = useState(null);
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [open, setOpen] = useState("");
  const load = useCallback(async () => {
    try { const [c, h] = await Promise.all([api.credits.get(), api.credits.history()]); setInfo(c); setHist(h); }
    catch (e) { setErr(e.message || "Could not load."); }
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!user) return <SignInNote title="Credits & receipts" />;

  const buy = async (p) => {
    setBusy(p.id); setErr(""); setOk("");
    try {
      const r = await api.credits.buyPass(p.id);
      setOk(`Done! Premium is on until ${day(r.premiumUntil)}.`);
      await load();
      if (r.receiptId) setOpen(r.receiptId);
    } catch (e) { setErr(e.message || "Could not buy the pass."); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-amber-500/15 p-2"><Wallet className="h-4 w-4 text-amber-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Pay as you go</p>
            <p className="mt-1 text-xs text-neutral-500">No monthly plan needed. Top up a small amount, then spend it on Premium only on the days you need it.</p>
            {!info && !err && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}
            {info && (
              <>
                <div className="mt-3 flex items-end justify-between gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
                  <div><p className="text-[11px] text-neutral-500">Wallet balance</p><p className="text-xl font-semibold text-neutral-100">{ngn(info.balanceNgn)}</p></div>
                  <Link to="/settings?tab=projects&sub=wallet" className={btnLight}>Top up</Link>
                </div>
                {info.premiumUntil && <p className="mt-2 text-[11px] text-neutral-500">Premium active until {day(info.premiumUntil)}.</p>}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {info.passes.map((p) => (
                    <div key={p.id} className="rounded-xl border border-white/10 p-3">
                      <p className="flex items-center gap-1.5 text-xs text-neutral-200"><Zap className="h-3.5 w-3.5 text-amber-300" /> {p.label}</p>
                      <p className="mt-1 text-lg font-semibold">{ngn(p.priceNgn)}</p>
                      <button type="button" className={`${info.balanceNgn >= p.priceNgn ? btnLight : btnGhost} mt-2 w-full`} disabled={Boolean(busy) || info.tier === "premium_plus"} onClick={() => buy(p)}>
                        {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {info.balanceNgn >= p.priceNgn ? "Buy with wallet" : "Not enough balance"}
                      </button>
                    </div>
                  ))}
                </div>
                {info.tier === "premium_plus" && <p className="mt-2 text-[11px] text-neutral-500">You already have Premium+, so passes are not needed.</p>}
              </>
            )}
            {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
            {ok && <p className="mt-3 text-xs text-emerald-300">{ok}</p>}
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-emerald-500/15 p-2"><Receipt className="h-4 w-4 text-emerald-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Payment history & receipts</p>
            <p className="mt-1 text-xs text-neutral-500">A receipt is made automatically for every payment (card, bank transfer, USSD, OPay, crypto or wallet) and emailed to you when email is set up.</p>
            {!hist && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}
            {hist && hist.items.length === 0 && <p className="mt-3 text-xs text-neutral-600">No payments yet.</p>}
            {hist && hist.items.map((x) => (
              <div key={x.id} className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-neutral-200">{x.title}</p>
                  <p className="truncate text-[11px] text-neutral-600">{day(x.at)} · {x.method}{x.channel ? ` · ${x.channel}` : ""} · <span className={STATUS[x.status] || ""}>{x.status}</span></p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-neutral-100">{money(x)}</span>
                {x.hasReceipt && <button type="button" className={btnGhost} onClick={() => setOpen(x.id)}>Receipt</button>}
              </div>
            ))}
            {hist && hist.totalPaidNgn > 0 && <p className="mt-3 text-[11px] text-neutral-600">Total paid in naira: {ngn(hist.totalPaidNgn)}</p>}
          </div>
        </div>
      </div>
      {open && <ReceiptView id={open} onClose={() => setOpen("")} />}
    </div>
  );
}
