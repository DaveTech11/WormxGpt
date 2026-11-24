import React, { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Fingerprint, Delete, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { lockEnabled, lockEvents, getLock, checkPin, biometricEnrolled, unlockWithBiometric, removeLock } from "../../lib/chatLock";

// Wraps the whole app. When a chat lock exists on this device the app starts locked, and locks again when the person
// leaves the app for longer than their chosen delay. The app underneath stays mounted (so a reply that is still streaming
// is not lost) but is hidden and made unreachable until the PIN or fingerprint is accepted.
export default function ChatLockGate({ children }) {
  const [enabled, setEnabled] = useState(lockEnabled);
  const [locked, setLocked] = useState(lockEnabled);
  const hiddenAt = useRef(0);
  const isPublicPage = typeof window !== "undefined" && window.location.pathname.startsWith("/s/");

  useEffect(() => {
    const on = () => { const e = lockEnabled(); setEnabled(e); if (!e) setLocked(false); };
    lockEvents.addEventListener("change", on);
    return () => lockEvents.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      if (!hiddenAt.current) return;
      const minutes = getLock()?.delay ?? 1;
      if (Date.now() - hiddenAt.current >= minutes * 60000) setLocked(true);
      hiddenAt.current = 0;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);

  const active = enabled && locked && !isPublicPage;
  return (
    <>
      <div style={{ display: "contents", visibility: active ? "hidden" : "visible" }} aria-hidden={active || undefined} inert={active ? "" : undefined}>
        {children}
      </div>
      {active && <LockScreen onUnlock={() => setLocked(false)} />}
    </>
  );
}

function LockScreen({ onUnlock }) {
  const len = getLock()?.len || 6;
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const bio = biometricEnrolled();
  const tried = useRef(false);

  const submit = useCallback(async (value) => {
    setBusy(true);
    try {
      const r = await checkPin(value);
      if (r.ok) { onUnlock(); return; }
      setShake(true); setTimeout(() => setShake(false), 400);
      setPin("");
      setMsg(r.waitSeconds ? `Too many wrong tries. Wait ${r.waitSeconds}s.` : `Wrong PIN. ${r.triesLeft} ${r.triesLeft === 1 ? "try" : "tries"} before a short wait.`);
    } finally { setBusy(false); }
  }, [onUnlock]);

  const press = useCallback((d) => {
    if (busy) return;
    setMsg("");
    setPin((p) => {
      if (p.length >= len) return p;
      const next = p + d;
      if (next.length === len) setTimeout(() => submit(next), 60);
      return next;
    });
  }, [busy, len, submit]);

  const tryFingerprint = useCallback(async () => {
    setMsg("");
    if (await unlockWithBiometric()) onUnlock(); else setMsg("Fingerprint not recognised. Enter your PIN.");
  }, [onUnlock]);

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  useEffect(() => { if (bio && !tried.current) { tried.current = true; const t = setTimeout(tryFingerprint, 350); return () => clearTimeout(t); } return undefined; }, [bio, tryFingerprint]);

  const forgot = async () => {
    if (!window.confirm("Forgot your PIN? We will sign you out on this device and remove the lock. You can sign in again any time.")) return;
    try { await api.auth.logout(); } catch { /* offline: still remove the lock below */ }
    removeLock();
    try { localStorage.removeItem("xryon_current_user"); } catch { /* ignore */ }
    window.location.href = "/login";
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="App locked" className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-[#0a0a0a] px-6 text-white">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><Lock className="h-6 w-6" /></div>
      <p className="text-lg font-semibold">Wormx GPT v5 is locked</p>
      <p className="mt-1 text-sm text-neutral-400">Enter your PIN to continue</p>
      <div className={`mt-6 flex gap-3 ${shake ? "animate-pulse" : ""}`} aria-label={`${pin.length} of ${len} digits entered`}>
        {Array.from({ length: len }).map((_, i) => <span key={i} className={`h-3 w-3 rounded-full border border-white/40 ${i < pin.length ? "bg-white" : ""}`} />)}
      </div>
      <p className="mt-3 h-5 text-center text-xs text-red-300" role="status">{msg}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-16 w-16 rounded-full bg-white/10 text-xl hover:bg-white/20 active:bg-white/30">{d}</button>
        ))}
        {bio
          ? <button type="button" onClick={tryFingerprint} aria-label="Use fingerprint" className="grid h-16 w-16 place-items-center rounded-full text-neutral-300 hover:bg-white/10"><Fingerprint className="h-6 w-6" /></button>
          : <span />}
        <button type="button" onClick={() => press("0")} className="h-16 w-16 rounded-full bg-white/10 text-xl hover:bg-white/20 active:bg-white/30">0</button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete" className="grid h-16 w-16 place-items-center rounded-full text-neutral-300 hover:bg-white/10">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Delete className="h-5 w-5" />}</button>
      </div>
      <button type="button" onClick={forgot} className="mt-8 text-xs text-neutral-500 hover:text-neutral-300">Forgot PIN?</button>
    </div>
  );
}
