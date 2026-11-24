import React, { useCallback, useEffect, useState } from "react";
import { Heart, Copy, Flag, Trash2, Plus, Loader2, Users, Trophy, Search, Link2, Bot, FolderOpen, MessageSquare, X, LogOut, RefreshCw } from "lucide-react";
import { api } from "../../api/client";
import { copyToClipboard } from "../../lib/clipboard";
import { card, field, btnLight, btnGhost, btnDanger, CopyBtn, SignInNote, when } from "./panelKit";

const CATEGORIES = ["general", "writing", "coding", "study", "business", "fun"];

// ======================================================================================================================
// Public prompt gallery
// ======================================================================================================================
export function PromptGalleryPanel({ user, onUse }) {
  const [list, setList] = useState(null);
  const [sort, setSort] = useState("top");
  const [cat, setCat] = useState("all");
  const [term, setTerm] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setList((await api.prompts.list({ sort, category: cat, q: term, mine: mineOnly ? "1" : "" })).prompts); }
    catch (e) { setErr(e.message || "Could not load."); setList([]); }
  }, [sort, cat, term, mineOnly]);
  useEffect(() => { const t = setTimeout(load, term ? 300 : 0); return () => clearTimeout(t); }, [load, term]);

  const act = async (fn) => { setErr(""); try { await fn(); } catch (e) { setErr(e.message || "Something went wrong."); } };
  const copy = (p) => act(async () => {
    await copyToClipboard(p.text); setMsg("Prompt copied. Paste it into a chat.");
    if (user) { await api.prompts.copied(p.id).catch(() => {}); load(); }
    if (onUse) onUse(p.text);
  });
  const like = (p) => act(async () => { if (!user) throw new Error("Sign in to like prompts."); await api.prompts.like(p.id); load(); });
  const report = (p) => act(async () => { if (!user) throw new Error("Sign in to report."); if (!window.confirm("Report this prompt as inappropriate?")) return; await api.prompts.report(p.id); setMsg("Thanks. We will review it."); load(); });
  const remove = (p) => act(async () => { if (!window.confirm("Delete this prompt?")) return; await api.prompts.remove(p.id); load(); });
  const submit = () => act(async () => { await api.prompts.create(form); setForm(null); setMsg("Shared. Thank you!"); load(); });

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-neutral-200">Prompt gallery</p>
            <p className="mt-1 text-xs text-neutral-500">Prompts people shared. Copy one and paste it into a chat. Share your own best ones.</p>
          </div>
          {user && !form && <button type="button" className={btnLight} onClick={() => { setForm({ title: "", text: "", category: "general" }); setMsg(""); }}><Plus className="h-3.5 w-3.5" /> Share</button>}
        </div>
        {form && (
          <div className="mt-4 space-y-2">
            <input className={field} maxLength={80} placeholder="Title (e.g. Patient maths tutor)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea className={`${field} min-h-[110px]`} maxLength={4000} placeholder="The prompt…  Do not include passwords, private info or anything harmful." value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c} className="bg-neutral-900">{c}</option>)}</select>
            <p className="text-[11px] text-neutral-600">Your first name is shown with it. Anyone can see and copy it.</p>
            <div className="flex gap-2"><button type="button" className={btnLight} disabled={form.title.trim().length < 3 || form.text.trim().length < 10} onClick={submit}>Publish</button><button type="button" className={btnGhost} onClick={() => setForm(null)}>Cancel</button></div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-500" /><input className={`${field} pl-9`} placeholder="Search prompts" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
          <select className={`${field} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}><option value="all" className="bg-neutral-900">All topics</option>{CATEGORIES.map((c) => <option key={c} value={c} className="bg-neutral-900">{c}</option>)}</select>
          <select className={`${field} w-auto`} value={sort} onChange={(e) => setSort(e.target.value)}><option value="top" className="bg-neutral-900">Most popular</option><option value="new" className="bg-neutral-900">Newest</option></select>
          {user && <button type="button" className={mineOnly ? btnLight : btnGhost} onClick={() => setMineOnly(!mineOnly)}>Mine</button>}
        </div>
        {msg && <p className="mt-3 text-xs text-emerald-300">{msg}</p>}
        {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
      </div>

      {!list && <Loader2 className="mx-auto h-5 w-5 animate-spin text-neutral-500" />}
      {list && list.length === 0 && <p className="text-center text-xs text-neutral-600">{mineOnly ? "You have not shared a prompt yet." : "No prompts found. Be the first to share one!"}</p>}
      {list && list.map((p) => (
        <div key={p.id} className={card}>
          <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-neutral-100">{p.title}</p><span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-400">{p.category}</span></div>
          <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-xs text-neutral-400">{p.text}</p>
          <p className="mt-2 text-[11px] text-neutral-600">by {p.author} · {when(p.created_date)} · {p.copies} copied</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnLight} onClick={() => copy(p)}><Copy className="h-3.5 w-3.5" /> Copy</button>
            <button type="button" className={btnGhost} onClick={() => like(p)} aria-pressed={p.liked}><Heart className={`h-3.5 w-3.5 ${p.liked ? "fill-pink-400 text-pink-400" : ""}`} /> {p.likes}</button>
            {p.mine ? <button type="button" className={btnDanger} onClick={() => remove(p)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button> : <button type="button" className={btnGhost} onClick={() => report(p)} aria-label="Report"><Flag className="h-3.5 w-3.5" /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ======================================================================================================================
// Team workspaces
// ======================================================================================================================
const ICON = { chat: MessageSquare, project: FolderOpen, bot: Bot };

function TeamView({ id, onBack, onChanged }) {
  const [team, setTeam] = useState(null);
  const [open, setOpen] = useState(null);
  const [mine, setMine] = useState(null); // things I can share
  const [pick, setPick] = useState({ type: "chat", ref: "" });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => { try { setTeam((await api.teams.get(id)).team); } catch (e) { setErr(e.message); } }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => {
      const [c, h, b] = await Promise.all([
        api.entities.Conversation.list("-created_date", 50).catch(() => []),
        api.host.list().catch(() => ({ sites: [] })),
        api.bots.list().catch(() => ({ bots: [] })),
      ]);
      setMine({ chat: (c || []).map((x) => ({ id: x.id, label: x.title || x.name || "Untitled chat" })), project: (h.sites || []).map((x) => ({ id: x.id, label: x.name })), bot: (Array.isArray(b) ? b : b.bots || []).map((x) => ({ id: x.id, label: x.name })) });
    })();
  }, []);
  const act = async (fn) => { setErr(""); setMsg(""); try { await fn(); await load(); onChanged?.(); } catch (e) { setErr(e.message || "Something went wrong."); } };

  if (!team) return <div className={card}>{err ? <p className="text-xs text-red-300">{err}</p> : <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />}<button type="button" className={`${btnGhost} mt-3`} onClick={onBack}>Back</button></div>;
  const owner = team.role === "owner";
  const options = mine ? mine[pick.type] : [];
  const view = async (it) => {
    if (it.type === "project") { window.open(`${window.location.origin}${it.url}`, "_blank", "noopener"); return; }
    try { setOpen((await api.teams.item(id, it.id)).item); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="space-y-4">
      <div className={card}>
        <button type="button" className="text-xs text-neutral-500 hover:text-white" onClick={onBack}>← All teams</button>
        <p className="mt-2 text-sm text-neutral-100">{team.name}</p>
        <p className="text-[11px] text-neutral-600">Owner: {team.ownerName} · {team.members.length} members</p>
        {owner && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-400">Invite code</span><code className="rounded-lg bg-black/40 px-3 py-1.5 font-mono text-sm tracking-widest text-neutral-100">{team.code}</code>
            <CopyBtn text={team.code} /><button type="button" className={btnGhost} onClick={() => act(async () => { await api.teams.newCode(id); setMsg("New code made. The old one no longer works."); })}><RefreshCw className="h-3.5 w-3.5" /> New code</button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {team.members.map((m) => (
            <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] text-neutral-200">{m.name}{m.role === "owner" ? " (owner)" : m.you ? " (you)" : ""}
              {owner && !m.you && <button type="button" aria-label={`Remove ${m.name}`} onClick={() => window.confirm(`Remove ${m.name}? Things they shared are removed too.`) && act(() => api.teams.removeMember(id, m.userId))}><X className="h-3 w-3 text-red-300" /></button>}</span>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          {owner ? <button type="button" className={btnDanger} onClick={() => window.confirm("Delete this team and everything shared in it?") && api.teams.remove(id).then(() => { onChanged?.(); onBack(); }).catch((e) => setErr(e.message))}><Trash2 className="h-3.5 w-3.5" /> Delete team</button>
            : <button type="button" className={btnDanger} onClick={() => window.confirm("Leave this team? Things you shared are removed.") && api.teams.leave(id).then(() => { onChanged?.(); onBack(); }).catch((e) => setErr(e.message))}><LogOut className="h-3.5 w-3.5" /> Leave</button>}
        </div>
      </div>

      <div className={card}>
        <p className="text-sm text-neutral-200">Share with the team</p>
        <p className="mt-1 text-xs text-neutral-500">Chats are shared as a read-only copy of the text. Projects share the page link. Bots share the name and personality only, never the Telegram token.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select className={`${field} w-auto`} value={pick.type} onChange={(e) => setPick({ type: e.target.value, ref: "" })}><option value="chat" className="bg-neutral-900">Chat</option><option value="project" className="bg-neutral-900">Project</option><option value="bot" className="bg-neutral-900">Bot</option></select>
          <select className={`${field} min-w-[10rem] flex-1`} value={pick.ref} onChange={(e) => setPick({ ...pick, ref: e.target.value })}><option value="" className="bg-neutral-900">{mine ? (options.length ? "Choose…" : `You have no ${pick.type}s yet`) : "Loading…"}</option>{options.map((o) => <option key={o.id} value={o.id} className="bg-neutral-900">{o.label}</option>)}</select>
          <button type="button" className={btnLight} disabled={!pick.ref} onClick={() => act(async () => { const r = await api.teams.share(id, pick.type, pick.ref); setMsg(r.updated ? "Updated the shared copy." : "Shared."); setPick({ ...pick, ref: "" }); })}>Share</button>
        </div>
        {msg && <p className="mt-3 text-xs text-emerald-300">{msg}</p>}
        {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
      </div>

      <div className={card}>
        <p className="text-sm text-neutral-200">Shared items</p>
        {team.items.length === 0 && <p className="mt-2 text-xs text-neutral-600">Nothing shared yet.</p>}
        {team.items.map((it) => { const I = ICON[it.type] || Link2; return (
          <div key={it.id} className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <I className="h-4 w-4 shrink-0 text-neutral-400" />
            <div className="min-w-0 flex-1"><p className="truncate text-xs text-neutral-200">{it.title}</p><p className="text-[11px] text-neutral-600">{it.type}{it.count ? ` · ${it.count} messages` : ""} · {it.sharedBy} · {when(it.at)}</p></div>
            <button type="button" className={btnGhost} onClick={() => view(it)}>Open</button>
            {(it.mine || owner) && <button type="button" className={btnDanger} aria-label="Remove" onClick={() => act(() => api.teams.unshare(id, it.id))}><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>); })}
      </div>

      {open && (
        <div className={card}>
          <div className="flex items-center justify-between"><p className="text-sm text-neutral-200">{open.title} <span className="text-[11px] text-neutral-600">shared by {open.sharedBy}</span></p><button type="button" className={btnGhost} onClick={() => setOpen(null)}><X className="h-3.5 w-3.5" /></button></div>
          {open.type === "chat" && <div className="mt-3 max-h-96 space-y-3 overflow-y-auto">{open.payload.messages.map((m, i) => <div key={i} className={`rounded-xl px-3 py-2 text-xs ${m.role === "user" ? "bg-white/10 text-neutral-100" : "bg-white/[0.03] text-neutral-300"}`}><p className="mb-1 text-[10px] uppercase text-neutral-600">{m.role === "user" ? "User" : "Wormx GPT"}</p><p className="whitespace-pre-wrap">{m.content}</p></div>)}</div>}
          {open.type === "bot" && <div className="mt-3 space-y-2 text-xs text-neutral-300"><p><b>{open.payload.name}</b> {open.payload.link && <a className="text-violet-300" href={open.payload.link} target="_blank" rel="noreferrer">{open.payload.link}</a>}</p>{open.payload.persona && <><p className="text-neutral-500">Personality</p><p className="whitespace-pre-wrap rounded-xl bg-black/30 p-3">{open.payload.persona}</p><CopyBtn text={open.payload.persona} label="Copy personality" /></>}</div>}
        </div>
      )}
    </div>
  );
}

export function TeamsPanel({ user }) {
  const [teams, setTeams] = useState(null);
  const [openId, setOpenId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => { try { setTeams((await api.teams.list()).teams); } catch (e) { setErr(e.message); setTeams([]); } }, []);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!user) return <SignInNote title="Team workspaces" />;
  if (openId) return <TeamView id={openId} onBack={() => setOpenId("")} onChanged={load} />;
  const act = async (fn) => { setErr(""); try { const r = await fn(); await load(); if (r?.id) setOpenId(r.id); setName(""); setCode(""); } catch (e) { setErr(e.message); } };
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-indigo-500/15 p-2"><Users className="h-4 w-4 text-indigo-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-200">Team workspaces</p>
            <p className="mt-1 text-xs text-neutral-500">Share chats, projects and bots with coworkers. Create a team and give people the invite code, or join one with a code.</p>
            <div className="mt-3 flex gap-2"><input className={field} maxLength={50} placeholder="New team name" value={name} onChange={(e) => setName(e.target.value)} /><button type="button" className={btnLight} disabled={name.trim().length < 2} onClick={() => act(() => api.teams.create(name.trim()))}>Create</button></div>
            <div className="mt-2 flex gap-2"><input className={`${field} uppercase`} maxLength={12} placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} /><button type="button" className={btnGhost} disabled={code.trim().length < 4} onClick={() => act(() => api.teams.join(code.trim()))}>Join</button></div>
            {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
          </div>
        </div>
      </div>
      {!teams && <Loader2 className="mx-auto h-5 w-5 animate-spin text-neutral-500" />}
      {teams && teams.map((t) => (
        <button key={t.id} type="button" onClick={() => setOpenId(t.id)} className={`${card} block w-full text-left hover:bg-white/[0.06]`}>
          <p className="text-sm text-neutral-100">{t.name}</p><p className="text-[11px] text-neutral-600">{t.role} · {t.members} members · {t.items} shared</p>
        </button>
      ))}
    </div>
  );
}

// ======================================================================================================================
// Weekly leaderboard (shown on the games page)
// ======================================================================================================================
export function LeaderboardCard({ game = "all", refreshKey = 0 }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.games.leaderboard(game).then(setD).catch(() => setD({ top: [], me: null })); }, [game, refreshKey]);
  if (!d) return null;
  const days = d.endsAt ? Math.max(0, Math.ceil((Date.parse(d.endsAt) - Date.now()) / 86400000)) : null;
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-amber-300" /> Top scores this week</p>{days !== null && <span className="text-[11px] text-white/40">resets in {days}d</span>}</div>
      {d.top.length === 0 && <p className="mt-2 text-xs text-white/50">No scores yet. Win a game to get on the board!</p>}
      {d.top.map((r) => <div key={r.rank} className={`mt-1.5 flex items-center justify-between rounded-lg px-2 py-1 text-xs ${r.me ? "bg-white/15" : ""}`}><span><span className="inline-block w-6 text-white/50">{r.rank}.</span>{r.name}{r.me ? " (you)" : ""}</span><span className="font-semibold">{r.points} pts</span></div>)}
      {d.me && d.me.rank > 10 && <p className="mt-2 text-xs text-white/60">You: #{d.me.rank} with {d.me.points} pts</p>}
    </div>
  );
}
