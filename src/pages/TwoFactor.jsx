import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, Send } from "lucide-react";
import { api } from "../api/client";
import AuthLayout from "../components/AuthLayout";
import { safeReturnTo } from "../lib/authReturnTo";

// Second step of signing in. Shown when the account has two-factor login on: the server already accepted the password /
// email code / Google / phone sign-in but keeps the session "pending" until the code below is right.
export default function TwoFactor() {
  const [state, setState] = useState(null); // null = loading
  const [method, setMethod] = useState("totp");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const returnTo = safeReturnTo();

  useEffect(() => {
    api.twofa.pending().then((s) => {
      if (!s.pending) { window.location.replace("/login"); return; } // nothing waiting: start again
      setState(s); setMethod(s.methods.includes("totp") ? "totp" : s.methods.includes("telegram") ? "telegram" : "backup");
    }).catch((e) => { setErr(e.message || "This sign-in expired."); setState({ methods: [], expired: true }); });
  }, []);
  useEffect(() => { input.current?.focus(); }, [method, state]);

  const sendTelegram = async () => {
    setErr(""); setInfo(""); setBusy(true);
    try { await api.twofa.sendCode(); setInfo("We sent a code to your Telegram."); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { if (state && method === "telegram" && !state.expired) sendTelegram(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [method, state && state.pending]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || code.trim().length < 6) return;
    setErr(""); setBusy(true);
    try { await api.twofa.verify(code.trim(), method); window.location.href = returnTo; }
    catch (e2) { setErr(e2.message || "That code is not right."); setCode(""); setBusy(false); }
  };

  const tabs = state ? [["totp", "Authenticator app"], ["telegram", "Telegram"], ["backup", "Backup code"]].filter(([k]) => state.methods.includes(k)) : [];
  return (
    <AuthLayout title={"One more step"} desktopTitle={"Almost\nthere"} footer={<Link to="/login">Back to sign in</Link>}>
      {!state && <Loader2 className="mx-auto h-5 w-5 animate-spin text-neutral-500" />}
      {state && state.expired && <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{err || "This sign-in expired."} <Link to="/login" className="underline">Sign in again</Link></div>}
      {state && !state.expired && (
        <form onSubmit={submit}>
          <div className="mb-4 flex items-center gap-3 text-neutral-200"><ShieldCheck className="h-5 w-5 text-emerald-300" /><p className="text-sm">Two-factor login is on for {state.email || "this account"}.</p></div>
          {tabs.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {tabs.map(([k, label]) => <button key={k} type="button" onClick={() => { setMethod(k); setCode(""); setErr(""); setInfo(""); }} className={`rounded-full px-3 py-1.5 text-xs ${method === k ? "bg-white text-black" : "bg-white/10 text-neutral-300 hover:bg-white/15"}`}>{label}</button>)}
            </div>
          )}
          <p className="mb-2 text-sm text-neutral-400">{method === "totp" ? "Enter the 6-digit code from your authenticator app." : method === "telegram" ? "Enter the 6-digit code we sent to your Telegram." : "Enter one of your backup codes (it works only once)."}</p>
          <input
            ref={input} value={code} onChange={(e) => setCode(method === "backup" ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode={method === "backup" ? "text" : "numeric"} autoComplete="one-time-code" placeholder={method === "backup" ? "xxxxx-xxxxx" : "123456"}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-lg tracking-[0.3em] text-white outline-none focus:border-white/30"
          />
          {info && <p className="mt-3 text-xs text-emerald-300">{info}</p>}
          {err && <div className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
          <button type="submit" disabled={busy || code.trim().length < 6} className="mt-4 flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and continue"}
          </button>
          {method === "telegram" && <button type="button" onClick={sendTelegram} disabled={busy} className="mt-3 inline-flex items-center gap-2 text-xs text-neutral-400 hover:text-white"><Send className="h-3.5 w-3.5" /> Send a new code</button>}
        </form>
      )}
    </AuthLayout>
  );
}
