import React, { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Smartphone, Send, KeyRound, Loader2, Download, Laptop, LogOut, Lock, Fingerprint, FileJson, FileText, History } from "lucide-react";
import { api } from "../../api/client";
import { card, field, btnLight, btnGhost, btnDanger, CopyBtn, SignInNote, when } from "./panelKit";
import {
  lockSupported, lockEnabled, getLock, setPin, checkPin, setDelay, removeLock, pinValid, LOCK_DELAYS,
  biometricAvailable, biometricEnrolled, enrollBiometric, disableBiometric,
} from "../../lib/chatLock";

const Msg = ({ err, ok }) => (err ? <p className="mt-3 text-xs text-red-300">{err}</p> : ok ? <p className="mt-3 text-xs text-emerald-300">{ok}</p> : null);

// ======================================================================================================================
// Two-factor login
// ======================================================================================================================
function BackupCodes({ codes, onDone }) {
  const text = `Wormx GPT backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "xyron-backup-codes.txt"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
      <p className="text-sm text-amber-100">Save your backup codes now</p>
      <p className="mt-1 text-xs text-amber-200/80">If you lose your phone, each of these signs you in once. They are shown only this one time.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-neutral-100">{codes.map((c) => <span key={c} className="rounded-lg bg-black/30 px-3 py-1.5 text-center">{c}</span>)}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyBtn text={codes.join("\n")} label="Copy all" />
        <button type="button" className={btnGhost} onClick={download}><Download className="h-3.5 w-3.5" /> Download</button>
        <button type="button" className={btnLight} onClick={onDone}>I saved them</button>
      </div>
    </div>
  );
}

export function TwoFactorPanel({ user }) {
  const [st, setSt] = useState(null);
  const [mode, setMode] = useState(""); // "totp" | "telegram" | "off" | "newcodes"
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [codes, setCodes] = useState(null);

  const load = useCallback(async () => { try { setSt(await api.twofa.status()); } catch (e) { setErr(e.message || "Could not load."); } }, []);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!user) return <SignInNote title="Two-factor login" />;

  const reset = () => { setMode(""); setSecret(null); setCode(""); setErr(""); setInfo(""); };
  const run = async (fn) => { setBusy(true); setErr(""); setInfo(""); try { await fn(); } catch (e) { setErr(e.message || "Something went wrong."); } finally { setBusy(false); } };

  const startTotp = () => run(async () => { const r = await api.twofa.totpBegin(); setSecret(r); setMode("totp"); setCode(""); });
  const startTelegram = () => run(async () => { await api.twofa.telegramBegin(); setMode("telegram"); setCode(""); setInfo("We sent a 6-digit code to your Telegram."); });
  const confirm = () => run(async () => {
    const r = mode === "totp" ? await api.twofa.totpConfirm(code) : await api.twofa.telegramConfirm(code);
    if (r.backupCodes) setCodes(r.backupCodes);
    reset(); await load();
  });
  const sendChallenge = () => run(async () => { await api.twofa.challenge(); setInfo("Code sent to your Telegram."); });
  const turnOff = () => run(async () => { await api.twofa.disable(code); reset(); await load(); });
  const newCodes = () => run(async () => { const r = await api.twofa.newBackupCodes(code); setCodes(r.backupCodes); reset(); await load(); });

  const codeBox = (action, label, danger) => (
    <div className="mt-3 space-y-2">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={st?.totp ? "Authenticator code or backup code" : "Code or backup code"} inputMode="text" autoComplete="one-time-code" className={field} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || code.trim().length < 6} onClick={action} className={danger ? btnDanger : btnLight}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {label}</button>
        {st?.telegram && <button type="button" disabled={busy} onClick={sendChallenge} className={btnGhost}><Send className="h-3.5 w-3.5" /> Send code to Telegram</button>}
        <button type="button" onClick={reset} className={btnGhost}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-emerald-500/15 p-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-200">Two-factor login {st?.enabled && <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">ON</span>}</p>
          <p className="mt-1 text-xs text-neutral-500">After your normal sign-in, Wormx GPT v5 also asks for a code. Even if someone learns your password or email code, they cannot get in.</p>
          {!st && !err && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}

          {codes && <BackupCodes codes={codes} onDone={() => setCodes(null)} />}

          {st && !mode && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <Smartphone className="h-4 w-4 text-neutral-400" />
                <div className="min-w-0 flex-1"><p className="text-xs text-neutral-200">Authenticator app</p><p className="text-[11px] text-neutral-500">Google Authenticator, Authy, 1Password, Microsoft Authenticator…</p></div>
                {st.totp ? <span className="text-[11px] text-emerald-300">On</span> : <button type="button" className={btnLight} disabled={busy} onClick={startTotp}>Set up</button>}
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <Send className="h-4 w-4 text-neutral-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-neutral-200">Telegram code</p>
                  <p className="text-[11px] text-neutral-500">{!st.telegramAvailable ? "Not available on this server yet." : st.telegramLinked ? "A code arrives in your linked Telegram chat." : "Link Telegram first (the “Send codes to Telegram” card below)."}</p>
                </div>
                {st.telegram ? <span className="text-[11px] text-emerald-300">On</span> : <button type="button" className={btnLight} disabled={busy || !st.telegramLinked || !st.telegramAvailable} onClick={startTelegram}>Set up</button>}
              </div>
              {st.enabled && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="mr-auto text-[11px] text-neutral-500"><KeyRound className="mr-1 inline h-3 w-3" />{st.backupLeft} backup {st.backupLeft === 1 ? "code" : "codes"} left</span>
                  <button type="button" className={btnGhost} onClick={() => { setMode("newcodes"); setCode(""); setErr(""); }}>New backup codes</button>
                  <button type="button" className={btnDanger} onClick={() => { setMode("off"); setCode(""); setErr(""); }}>Turn off</button>
                </div>
              )}
            </div>
          )}

          {mode === "totp" && secret && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-neutral-400">1. Open your authenticator app and add an account. On this phone, tap the button; on a computer, type the key in.</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="select-all rounded-lg bg-black/40 px-3 py-2 font-mono text-sm tracking-wider text-neutral-100">{secret.secret.match(/.{1,4}/g).join(" ")}</code>
                <CopyBtn text={secret.secret} label="Copy key" />
                <a href={secret.uri} className={btnGhost}><Smartphone className="h-3.5 w-3.5" /> Open in app</a>
              </div>
              <p className="text-xs text-neutral-400">2. Type the 6-digit code the app shows.</p>
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" className={`${field} max-w-[9rem] tracking-widest`} />
                <button type="button" disabled={busy || code.length !== 6} onClick={confirm} className={btnLight}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Turn on</button>
                <button type="button" onClick={reset} className={btnGhost}>Cancel</button>
              </div>
            </div>
          )}
          {mode === "telegram" && (
            <div className="mt-4 flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" className={`${field} max-w-[9rem] tracking-widest`} />
              <button type="button" disabled={busy || code.length !== 6} onClick={confirm} className={btnLight}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Turn on</button>
              <button type="button" onClick={reset} className={btnGhost}>Cancel</button>
            </div>
          )}
          {mode === "off" && <><p className="mt-4 text-xs text-neutral-400">Enter a code to confirm it is you.</p>{codeBox(turnOff, "Turn off two-factor", true)}</>}
          {mode === "newcodes" && <><p className="mt-4 text-xs text-neutral-400">Enter a code to confirm. Your old backup codes stop working.</p>{codeBox(newCodes, "Make new backup codes", false)}</>}
          <Msg err={err} ok={info} />
        </div>
      </div>
    </div>
  );
}

// ======================================================================================================================
// Devices + login history
// ======================================================================================================================
const RESULT = {
  ok: "Signed in", "2fa_pending": "Password accepted, waiting for the code", "2fa_ok": "Signed in with two-factor", "2fa_fail": "Wrong two-factor code",
  "2fa_blocked": "Blocked: too many wrong codes", "2fa_enabled_totp": "Authenticator app turned on", "2fa_enabled_telegram": "Telegram code turned on", "2fa_disabled": "Two-factor turned off",
};
const VIA = { password: "password", "email-code": "email code", phone: "phone", google: "Google", switch: "account switch", signup: "new account", settings: "settings" };

export function DevicesPanel({ user }) {
  const [list, setList] = useState(null);
  const [events, setEvents] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { const [s, h] = await Promise.all([api.sessions.list(), api.sessions.history()]); setList(s.sessions || []); setEvents(h.events || []); }
    catch (e) { setErr(e.message || "Could not load."); setList([]); setEvents([]); }
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!user) return <SignInNote title="Devices & login history" />;

  const out = async (h) => { setBusy(h); setErr(""); try { await api.sessions.revoke(h); await load(); } catch (e) { setErr(e.message); } finally { setBusy(""); } };
  const outAll = async () => {
    if (!window.confirm("Sign out of every other device? They will need to sign in again.")) return;
    setBusy("all"); setErr(""); try { await api.sessions.revokeOthers(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-sky-500/15 p-2"><Laptop className="h-4 w-4 text-sky-300" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-neutral-200">Where you are signed in</p>
              {list && list.length > 1 && <button type="button" className={btnDanger} disabled={busy === "all"} onClick={outAll}>{busy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} Sign out all others</button>}
            </div>
            <p className="mt-1 text-xs text-neutral-500">Don&apos;t recognise one? Sign it out, then change your password.</p>
            {!list && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}
            {list && list.length === 0 && <p className="mt-3 text-xs text-neutral-600">No active devices found.</p>}
            {list && list.map((s) => (
              <div key={s.handle} className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-neutral-200">{s.device} {s.current && <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">This device</span>}</p>
                  <p className="text-[11px] text-neutral-600">{s.ip ? `${s.ip} · ` : ""}active {when(s.lastSeen)} · signed in {when(s.created_date)}</p>
                </div>
                {!s.current && <button type="button" className={btnGhost} disabled={busy === s.handle} onClick={() => out(s.handle)}>{busy === s.handle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} Sign out</button>}
              </div>
            ))}
            <Msg err={err} />
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-violet-500/15 p-2"><History className="h-4 w-4 text-violet-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Recent sign-ins</p>
            {!events && <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-500" />}
            {events && events.length === 0 && <p className="mt-2 text-xs text-neutral-600">Nothing recorded yet. New sign-ins will show up here.</p>}
            {events && events.slice(0, 15).map((e) => (
              <div key={e.id} className="mt-2 flex items-center justify-between gap-3 border-b border-white/5 pb-2 text-xs last:border-0">
                <div className="min-w-0"><p className={`truncate ${e.result.includes("fail") || e.result.includes("blocked") ? "text-red-300" : "text-neutral-200"}`}>{RESULT[e.result] || e.result}</p><p className="truncate text-[11px] text-neutral-600">{e.device}{e.ip ? ` · ${e.ip}` : ""}{VIA[e.method] ? ` · ${VIA[e.method]}` : ""}</p></div>
                <span className="shrink-0 text-[11px] text-neutral-600">{when(e.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ======================================================================================================================
// Chat lock (PIN / fingerprint on this phone)
// ======================================================================================================================
export function ChatLockPanel() {
  const [on, setOn] = useState(lockEnabled);
  const [mode, setMode] = useState(""); // "set" | "change" | "off"
  const [cur, setCur] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [bioOk, setBioOk] = useState(false);
  const [bio, setBio] = useState(biometricEnrolled);
  const [delay, setDelayState] = useState(() => getLock()?.delay ?? 1);
  useEffect(() => { biometricAvailable().then(setBioOk); }, []);
  const refresh = () => { setOn(lockEnabled()); setBio(biometricEnrolled()); setDelayState(getLock()?.delay ?? 1); };
  const reset = () => { setMode(""); setCur(""); setP1(""); setP2(""); setErr(""); };

  const savePin = async () => {
    setErr(""); setOk("");
    try {
      if (!pinValid(p1)) throw new Error("Use 4 to 6 digits.");
      if (p1 !== p2) throw new Error("The two PINs are different.");
      if (mode === "change") { const r = await checkPin(cur); if (!r.ok) throw new Error(r.waitSeconds ? `Wait ${r.waitSeconds}s and try again.` : "Your current PIN is wrong."); }
      await setPin(p1, { delayMinutes: delay });
      setOk(mode === "change" ? "PIN changed." : "Chat lock is on. Wormx GPT will ask for your PIN when you come back.");
      reset(); refresh();
    } catch (e) { setErr(e.message); }
  };
  const turnOff = async () => {
    setErr("");
    const r = await checkPin(cur);
    if (!r.ok) { setErr(r.waitSeconds ? `Wait ${r.waitSeconds}s and try again.` : "That PIN is wrong."); return; }
    removeLock(); reset(); refresh(); setOk("Chat lock is off.");
  };
  const toggleBio = async () => {
    setErr(""); setOk("");
    try { if (bio) disableBiometric(); else { await enrollBiometric(); setOk("Fingerprint unlock is on."); } refresh(); }
    catch (e) { setErr(e.message || "Could not set up fingerprint."); }
  };

  const pinInput = (val, set, label) => <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={val} onChange={(e) => set(e.target.value.replace(/\D/g, ""))} placeholder={label} className={`${field} max-w-[11rem] tracking-widest`} />;

  if (!lockSupported()) return <div className={card}><p className="text-sm text-neutral-200">Chat lock</p><p className="mt-1 text-xs text-neutral-500">This browser can&apos;t protect the app with a PIN. Try Chrome, Safari or the Wormx GPT v5 app.</p></div>;
  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-amber-500/15 p-2"><Lock className="h-4 w-4 text-amber-300" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-200">Chat lock {on && <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">ON</span>}</p>
          <p className="mt-1 text-xs text-neutral-500">Ask for a PIN or fingerprint before Wormx GPT v5 opens on this phone, so nobody can read your chats if they pick it up. It is stored only on this device.</p>

          {!on && mode !== "set" && <button type="button" className={`${btnLight} mt-3`} onClick={() => { setMode("set"); setOk(""); }}>Set a PIN</button>}
          {(mode === "set" || mode === "change") && (
            <div className="mt-3 space-y-2">
              {mode === "change" && pinInput(cur, setCur, "Current PIN")}
              <div className="flex flex-wrap gap-2">{pinInput(p1, setP1, "New PIN (4–6 digits)")}{pinInput(p2, setP2, "Repeat PIN")}</div>
              <div className="flex gap-2"><button type="button" className={btnLight} onClick={savePin} disabled={!p1 || !p2}>{mode === "change" ? "Change PIN" : "Turn on"}</button><button type="button" className={btnGhost} onClick={reset}>Cancel</button></div>
            </div>
          )}

          {on && mode === "" && (
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-neutral-400">Lock again
                <select value={delay} onChange={(e) => { const m = Number(e.target.value); setDelay(m); setDelayState(m); }} className={`${field} mt-1`}>
                  {LOCK_DELAYS.map((d) => <option key={d.minutes} value={d.minutes} className="bg-neutral-900">{d.label}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <Fingerprint className="h-4 w-4 text-neutral-400" />
                <div className="min-w-0 flex-1"><p className="text-xs text-neutral-200">Fingerprint / face unlock</p><p className="text-[11px] text-neutral-500">{bioOk ? "Uses your phone's own biometric. Your PIN always works too." : "Not available on this device or browser."}</p></div>
                <button type="button" className={bio ? btnGhost : btnLight} disabled={!bioOk} onClick={toggleBio}>{bio ? "Turn off" : "Turn on"}</button>
              </div>
              <div className="flex flex-wrap gap-2"><button type="button" className={btnGhost} onClick={() => { setMode("change"); setOk(""); }}>Change PIN</button><button type="button" className={btnDanger} onClick={() => { setMode("off"); setOk(""); }}>Turn off lock</button></div>
            </div>
          )}
          {mode === "off" && (
            <div className="mt-3 space-y-2"><p className="text-xs text-neutral-400">Enter your PIN to turn the lock off.</p>{pinInput(cur, setCur, "Current PIN")}<div className="flex gap-2"><button type="button" className={btnDanger} onClick={turnOff} disabled={!cur}>Turn off</button><button type="button" className={btnGhost} onClick={reset}>Cancel</button></div></div>
          )}
          <Msg err={err} ok={ok} />
          <p className="mt-3 text-[11px] text-neutral-600">Forgot the PIN? Choose “Forgot PIN?” on the lock screen: you are signed out on this device and the lock is removed. The lock protects this phone only; it does not encrypt data and does not apply to your other devices.</p>
        </div>
      </div>
    </div>
  );
}

// ======================================================================================================================
// Data export
// ======================================================================================================================
export function ExportPanel({ user }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  if (!user) return <SignInNote title="Download your chats" />;

  // fetch + save (instead of a plain link) so a "too many downloads" or "sign in again" answer is shown as a message, not saved as a file
  const get = async (format) => {
    setBusy(format); setErr(""); setOk("");
    try {
      const r = await fetch(api.dataExport.url(format), { credentials: "include", cache: "no-store" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || `Download failed (${r.status})`); }
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || `xyron-chats.${format === "md" ? "md" : "json"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setOk(`Saved ${name}`);
    } catch (e) { setErr(e.message || "Download failed."); } finally { setBusy(""); }
  };
  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-teal-500/15 p-2"><Download className="h-4 w-4 text-teal-300" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-200">Download all your chats</p>
          <p className="mt-1 text-xs text-neutral-500">One file with every conversation and message, plus your saved memories. Pictures and uploaded files are not included (their names are). You can download up to 5 times an hour.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => get("json")} disabled={Boolean(busy)} className={btnLight}>{busy === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />} JSON (for backups)</button>
            <button type="button" onClick={() => get("md")} disabled={Boolean(busy)} className={btnGhost}>{busy === "md" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Markdown (easy to read)</button>
          </div>
          <Msg err={err} ok={ok} />
        </div>
      </div>
    </div>
  );
}
