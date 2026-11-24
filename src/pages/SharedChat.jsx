import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "../api/client";
import MarkdownText from "../components/xyron/MarkdownText";

// Public, read-only page for a chat someone shared (/s/<token>). No sign-in, no names, no files.
export default function SharedChat() {
  const { token } = useParams();
  const [chat, setChat] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    api.share.view(token)
      .then((r) => { if (alive) { setChat(r); document.title = `${r.title} · Wormx GPT`; } })
      .catch((e) => { if (alive) setError(e.message || "This shared chat does not exist or was removed."); });
    return () => { alive = false; };
  }, [token]);

  return (
    <div className="min-h-screen bg-black text-neutral-200">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur">
        <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet-300" /> Wormx GPT v5</p>
        <Link to="/" className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200">Start your own chat</Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        {!chat && !error && <Loader2 className="mx-auto h-5 w-5 animate-spin text-neutral-500" />}
        {error && <p className="py-20 text-center text-sm text-neutral-400">{error}</p>}
        {chat && (
          <>
            <h1 className="text-xl font-semibold text-white">{chat.title}</h1>
            <p className="mt-1 text-xs text-neutral-500">Shared chat · {new Date(chat.created_date).toLocaleDateString()} · read-only</p>
            <div className="mt-6 space-y-4">
              {chat.messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-white/10 text-neutral-100" : "bg-white/[0.04]"}`}>
                    {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <MarkdownText text={m.content} />}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
