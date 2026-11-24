import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Loader2, RefreshCw, X } from "lucide-react";
import { api } from "../../api/client";

const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl";
const field = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/25";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50";

const STATUS = {
  draft: ["Not sent yet", "text-neutral-400"],
  submitted: ["Waiting for approval", "text-amber-300"],
  active: ["Active", "text-emerald-300"],
};

function Item({ it, services, reload, notify }) {
  const [busy, setBusy] = useState("");
  const [pr, setPr] = useState(it.prUrl || "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const run = async (key, fn) => {
    setBusy(key); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(e?.message || "Something went wrong."); } finally { setBusy(""); }
  };
  const [label, tone] = STATUS[it.status] || STATUS.draft;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => notify?.("Copied")).catch(() => {});
  const svc = services.find((s) => s.id === it.serviceId);

  return (
    <li className="rounded-xl border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-white">{it.fqdn}</span>
        <span className={`shrink-0 text-[11px] ${tone}`}>{label}</span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">Opens {svc ? svc.name : "your project"} ({it.target})</p>

      {it.guide && it.status !== "active" && (
        <div className="mt-3 space-y-2">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-neutral-400">{it.guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <div className="rounded-lg border border-white/10 bg-black/30 p-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500"><span>{it.guide.file}</span>
              <button onClick={() => copy(it.guide.content)} className="inline-flex items-center gap-1 hover:text-neutral-300"><Copy className="h-3 w-3" />Copy</button></div>
            <pre className="overflow-x-auto whitespace-pre text-[11px] text-neutral-300">{it.guide.content}</pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={it.guide.openUrl} target="_blank" rel="noopener noreferrer" className={ghost}><ExternalLink className="h-3.5 w-3.5" />Open on GitHub</a>
            <a href={it.guide.repo} target="_blank" rel="noopener noreferrer" className={ghost}>Read the rules</a>
          </div>
          <div className="flex gap-2">
            <input value={pr} onChange={(e) => setPr(e.target.value)} placeholder={`${it.guide.repo}/pull/123 (optional)`} aria-label="Pull request link" className={field} autoCapitalize="none" spellCheck={false} />
            <button disabled={busy === "sent"} onClick={() => run("sent", async () => { await api.freeDomains.submitted(it.id, pr.trim()); setMsg("Saved. Press Check once it is approved."); reload(); })} className={ghost}>
              {busy === "sent" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}I sent it
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {it.status !== "active" && (
          <button disabled={busy === "check"} onClick={() => run("check", async () => {
            const r = await api.freeDomains.check(it.id);
            if (r.live) { notify?.(`${it.fqdn} is active.`); } else setMsg("Not live yet. Approval can take days; check again later.");
            reload();
          })} className={ghost}>{busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Check</button>
        )}
        {it.status === "active" && (
          <button disabled={busy === "connect"} onClick={() => run("connect", async () => {
            const r = await api.render.addDomain(it.serviceId, it.fqdn);
            setMsg(r?.verified ? `${it.fqdn} is connected.` : "Added on your project. It can take a few minutes to go live.");
          })} className={ghost}>{busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}Connect to project</button>
        )}
        <button disabled={busy === "cancel"} onClick={() => run("cancel", async () => { await api.freeDomains.cancel(it.id); reload(); })} className={ghost}><X className="h-3.5 w-3.5" />Cancel</button>
      </div>
      {msg && <p className="mt-2 text-xs text-emerald-300">{msg}</p>}
      {err && <p role="alert" className="mt-2 text-xs text-red-300">{err}</p>}
    </li>
  );
}

export default function FreeDomains({ services = [], sid = "", notify }) {
  const [data, setData] = useState(null);
  const [provider, setProvider] = useState("is-a.dev");
  const [name, setName] = useState("");
  const [github, setGithub] = useState("");
  const [project, setProject] = useState(sid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.freeDomains.list().then(setData).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!project && sid) setProject(sid); }, [sid, project]);

  const full = data && data.used >= data.limit;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api.freeDomains.request({ provider, name: name.trim(), github: github.trim(), serviceId: project });
      setName(""); await load();
    } catch (err) { setError(err?.message || "Could not make that request."); } finally { setBusy(false); }
  };

  if (!data) return null;
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-200">Free domain</p>
        <span className="text-[11px] text-neutral-500">{data.used} of {data.limit} used</span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">Get a free name like <span className="text-neutral-300">myapp.is-a.dev</span> or <span className="text-neutral-300">myapp.js.org</span>. Those sites are run by volunteers, so they review each name themselves and it can take days. We prepare the request and check when it goes live.</p>

      {!full && (
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
            {data.providers.map((p) => (
              <button type="button" key={p.id} onClick={() => setProvider(p.id)} className={`${ghost} ${provider === p.id ? "!border-white/40 !bg-white/10 !text-white" : ""}`}>{p.label}</button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-500">Needs: {data.providers.find((p) => p.id === provider)?.needs}</p>
          <div className="flex items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="myapp" aria-label="Name you want" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={field} />
            <span className="shrink-0 text-sm text-neutral-400">.{provider}</span>
          </div>
          {provider === "is-a.dev" && <input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="Your GitHub username" aria-label="GitHub username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={field} />}
          {services.length > 0 ? (
            <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project to open" className={field}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : <p className="text-xs text-neutral-500">Deploy a project first, then ask for a name for it.</p>}
          <button type="submit" disabled={busy || !name.trim() || !project} className={primary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Prepare my request</button>
        </form>
      )}
      {full && <p className="text-xs text-neutral-400">You are using both free names. Cancel one to ask for another, or buy a domain above.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}

      {data.items.length > 0 && (
        <ul className="mt-4 space-y-3">{data.items.map((it) => <Item key={it.id} it={it} services={services} reload={load} notify={notify} />)}</ul>
      )}
    </div>
  );
}
