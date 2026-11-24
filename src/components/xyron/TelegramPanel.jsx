import React, { useEffect, useState } from "react";
import { Send, Loader2, Check, Copy, Link2Off, ShieldCheck } from "lucide-react";
import { api } from "../../api/client";

// Settings -> Security -> "Codes on Telegram".
// Lets a signed-in user point their verification codes at Telegram instead of
// email, and shows the one-time link to open in the Telegram app.
export default function TelegramPanel({ user }) {
  const [status, setStatus] = useState(null);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [manualId, setManualId] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    const s = await api.auth.tgStatus();
    setStatus(s);
    return s;
  };

  useEffect(() => { refresh(); }, []);

  const getLink = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      const r = await api.auth.tgLinkToken();
      setLink(r);
    } catch (e) { setErr(e.message || "Could not create a link."); }
    finally { setBusy(false); }
  };

  const linkManually = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      await api.auth.tgLink(manualId.trim());
      setMsg("Linked. Your codes will now arrive on Telegram.");
      setManualId(""); setLink(null);
      await refresh();
    } catch (e) { setErr(e.message || "Could not link that chat."); }
    finally { setBusy(false); }
  };

  const unlink = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      await api.auth.tgUnlink();
      setMsg("Unlinked. Codes will go back to email.");
      setLink(null);
      await refresh();
    } catch (e) { setErr(e.message || "Could not unlink."); }
    finally { setBusy(false); }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setErr("Copy failed — long-press the link instead."); }
  };

  const configured = status?.configured;
  const linked = status?.linked;

  const input =
    "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-sky-500/15 p-2">
            <Send className="h-4 w-4 text-sky-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm text-neutral-200">Send codes to Telegram</p>
              {linked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                  <Check className="h-3 w-3" /> Linked
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Get your sign-in verification codes as a Telegram message instead of an email.
              Handy when email delivery is slow or blocked.
            </p>

            {configured === false && (
              <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Telegram delivery is not switched on for this server yet.
              </p>
            )}

            {configured && !user && (
              <p className="mt-3 text-xs text-neutral-500">Sign in to link your account.</p>
            )}

            {configured && user && !linked && (
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={getLink}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Connect Telegram
                </button>

                {link && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-xs text-neutral-400">
                      Open this in Telegram, then press <span className="text-neutral-200">Start</span>:
                    </p>
                    {link.url ? (
                      <div className="mt-2 flex items-center gap-2">
                        <a href={link.url} target="_blank" rel="noreferrer"
                           className="min-w-0 flex-1 truncate text-xs text-sky-300 hover:underline">
                          {link.url}
                        </a>
                        <button type="button" onClick={() => copy(link.url)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] text-neutral-200 hover:bg-white/20">
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-300">
                        The bot username could not be read. Send <span className="font-mono">/start</span> to the
                        Wormx GPT bot, then paste the chat id below.
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-neutral-600">
                      Expires in {link.expiresInMinutes || 15} minutes.
                    </p>
                  </div>
                )}

                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer hover:text-neutral-300">Link with a chat id instead</summary>
                  <div className="mt-2 space-y-2">
                    <p>Send <span className="font-mono text-neutral-300">/whoami</span> to the Wormx GPT v5 bot, then paste the number here.</p>
                    <input value={manualId} onChange={(e) => setManualId(e.target.value)}
                           placeholder="e.g. 123456789" className={input} inputMode="numeric" />
                    <button type="button" onClick={linkManually} disabled={busy || !manualId.trim()}
                            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40">
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Link this chat
                    </button>
                  </div>
                </details>
              </div>
            )}

            {configured && user && linked && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  <ShieldCheck className="h-4 w-4" />
                  Codes for <span className="font-medium">{user.email}</span> are sent to Telegram.
                </div>
                <button type="button" onClick={unlink} disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                  Stop sending codes to Telegram
                </button>
              </div>
            )}

            {msg && <p className="mt-3 text-xs text-emerald-300">{msg}</p>}
            {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
