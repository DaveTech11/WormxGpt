import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ArrowUpRight, Send, Sparkles, Globe, MessageCircle } from "lucide-react";

// Mobile  (< lg): Aurora-style screen: brand on top, big centred title, form, footer pinned to the bottom.
// Desktop (>= lg): framed glass card with a top nav, chrome-helmet art on the left and the form on the right.
function Brand() {
  return (
    <div className="flex items-center justify-center lg:hidden">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 min-[420px]:h-11 min-[420px]:w-11 ring-1 ring-white/10">
        <svg width="22" height="22" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M12 12 L45 50 L12 88 L28 88 L53 58 L78 88 L94 88 L61 50 L94 12 L78 12 L53 42 L28 12 Z" fill="#ffffff" />
        </svg>
      </span>
      <span className="ml-3 text-[22px] font-medium tracking-tight text-white min-[420px]:text-[26px]">Wormx GPT v5</span>
    </div>
  );
}

function DesktopNav() {
  const { pathname } = useLocation();
  const signIn = pathname.startsWith("/login");
  const register = pathname.startsWith("/register");
  const link = "text-[13px] text-neutral-200 transition hover:text-white";
  return (
    <nav className="hidden items-center justify-between px-[7%] pt-12 lg:flex" aria-label="Site">
      <div className="flex items-center gap-10">
        <Link to="/" className={link}>Home</Link>
        <Link to="/terms" className={link}>About</Link>
        <Link to="/privacy" className={link}>Blog</Link>
        <Link to="/premium" className={link}>Pages</Link>
        <Link to="/settings" className={link}>Contact</Link>
      </div>
      <div className="flex items-center gap-7">
        <span className="flex items-center gap-1 text-[13px] text-neutral-200">English <ChevronDown className="h-3.5 w-3.5" /></span>
        <Link to="/login" className={`relative pb-1 text-[13px] font-semibold text-white ${signIn ? "after:absolute after:inset-x-1 after:-bottom-0.5 after:h-[2px] after:rounded after:bg-white" : "text-neutral-300"}`}>Sign in</Link>
        <Link to="/register" className={`rounded-full px-5 py-2 text-[13px] font-semibold transition ${register ? "bg-white text-black" : "bg-white text-black hover:bg-neutral-200"}`}>Register</Link>
      </div>
    </nav>
  );
}

// Official Aura Chat channel.
const AURA_URL = "https://t.me/VERIFIEDAURACHAT";
const CHANNEL_URL = "https://t.me/xryonai";
const VORTYX_URL = "https://vortyx-pulse.myng.net";

const FOOTER_COLUMNS = [
  { heading: "Products", links: [{ label: "Wormx GPT Chat", to: "/" }, { label: "Codex", to: "/code" }, { label: "Images", to: "/images" }, { label: "Music", to: "/music" }, { label: "Premium", to: "/premium" }] },
  { heading: "Company", links: [{ label: "Terms", to: "/terms" }, { label: "Privacy policy", to: "/privacy" }, { label: "Settings", to: "/settings" }, { label: "Create an account", to: "/register" }, { label: "Log in", to: "/login" }] },
];

const FbIcon = (p) => (<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M13.5 21v-7.2h2.4l.4-2.9h-2.8V9.1c0-.8.3-1.4 1.4-1.4h1.5V5.2c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2h-2.5v2.9h2.5V21h3z" /></svg>);

const pill = "group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/10 hover:shadow-[0_8px_24px_-8px_rgba(255,255,255,0.25)] active:translate-y-0 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60";
const glass = "relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md";

function FooterPill({ href, icon: Icon, children }) {
  const inner = (<><Icon className="h-4 w-4 opacity-90" /><span>{children}</span><ArrowUpRight className="h-3.5 w-3.5 opacity-50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" /></>);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={pill}>{inner}</a>
    : <button type="button" className={pill}>{inner}</button>;
}

function ChannelPreview({ url, handle, avatar, alt, name, label, glow, lines, accent = "text-sky-400", badge = "bg-sky-500/15 text-sky-300" }) {
  return (
    <div className={`${glass} p-6`}>
      <div className={`pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full blur-3xl ${glow}`} aria-hidden="true" />
      <div className="relative flex items-center gap-4">
        <span className="relative grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-white/40 via-white/10 to-transparent p-[2px] shadow-[0_0_30px_-4px_rgba(99,102,241,0.55)]">
          <img src={avatar} alt={alt} loading="lazy" className="h-full w-full rounded-full object-cover" />
        </span>
        <div className="min-w-0">
          <span className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${badge}`}><Send className="h-3 w-3" />{label}</span>
          <h3 className="truncate text-[17px] font-bold leading-tight text-white">{name}</h3>
          <a href={url} target="_blank" rel="noopener noreferrer" className={`block truncate text-[13px] hover:underline ${accent}`}>{handle}</a>
        </div>
      </div>
      <div className="relative mt-5 space-y-2 rounded-2xl border border-white/10 bg-black/40 p-4 text-[13.5px] leading-relaxed text-neutral-200">
        {lines.map((l) => <p key={l}>{l}</p>)}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-[14px] font-semibold text-black transition hover:-translate-y-0.5 hover:bg-neutral-200 hover:shadow-[0_10px_30px_-10px_rgba(255,255,255,0.5)] active:translate-y-0 active:scale-[0.98]">
        <Send className="h-4 w-4" />View channel
      </a>
    </div>
  );
}

function VortyxCard() {
  return (
    <a href={VORTYX_URL} target="_blank" rel="noopener noreferrer" className={`${glass} group block p-6 transition duration-200 hover:-translate-y-0.5 hover:border-white/30`}>
      <div className="pointer-events-none absolute -bottom-20 -right-10 h-48 w-64 rounded-full bg-fuchsia-500/20 blur-3xl transition group-hover:bg-fuchsia-500/30" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300"><Sparkles className="h-3 w-3" />Official AI model site</span>
          <h3 className="text-[20px] font-bold leading-tight text-white">Vortyx Pulse AI</h3>
          <p className="mt-1 text-[13.5px] text-neutral-400">The official home of the Vortyx Pulse model.</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 transition group-hover:bg-white group-hover:text-black"><ArrowUpRight className="h-5 w-5" /></span>
      </div>
      <p className="relative mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[12.5px] text-neutral-300"><Globe className="h-3.5 w-3.5" />vortyx-pulse.myng.net</p>
    </a>
  );
}

function SiteFooter() {
  const head = "text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500";
  const item = "text-[15px] text-neutral-300 transition hover:text-white hover:underline underline-offset-4";
  return (
    <footer className="!flex-none relative z-10 mx-auto hidden w-full max-w-[1400px] px-10 pb-16 pt-10 lg:block" aria-label="Wormx GPT footer">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden="true" />

      <div className="grid grid-cols-[1.1fr_1fr_1fr_1.3fr] gap-10 pt-10">
        <div>
          <div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 100 100" aria-hidden="true"><path d="M12 12 L45 50 L12 88 L28 88 L53 58 L78 88 L94 88 L61 50 L94 12 L78 12 L53 42 L28 12 Z" fill="#ffffff" /></svg>
            <span className="text-[32px] font-medium leading-none tracking-tight text-white">Wormx GPT v5</span>
          </div>
          <p className="mt-4 max-w-[260px] text-[14px] leading-relaxed text-neutral-500">Your ideas. Your code. Your universe.</p>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <div key={col.heading}>
            <h2 className={head}>{col.heading}</h2>
            <ul className="mt-5 space-y-3.5">
              {col.links.map((l) => (<li key={l.label}><Link to={l.to} className={item}>{l.label}</Link></li>))}
            </ul>
          </div>
        ))}

        <div>
          <h2 className={head}>Looking up to</h2>
          <p className="mt-5 text-[15px] font-semibold text-white">Meta</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <FooterPill href="https://www.facebook.com" icon={FbIcon}>Facebook</FooterPill>
            <FooterPill href="https://www.whatsapp.com" icon={MessageCircle}>WhatsApp</FooterPill>
          </div>

          <h2 className={`${head} mt-8`}>Standing with</h2>
          <p className="mt-5 text-[15px] font-semibold text-white">Aura <span className="font-normal text-neutral-400">· chat &amp; messaging app</span></p>
          <div className="mt-3 flex flex-wrap gap-3">
            <FooterPill href={AURA_URL} icon={MessageCircle}>Aura Chat channel</FooterPill>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className={head}>Official</h2>
        <div className="mt-5 grid grid-cols-3 gap-6">
          <ChannelPreview url={CHANNEL_URL} handle="t.me/xryonai" avatar="/xryonai-avatar.jpg" alt="Wormx GPT AI channel avatar" name="Wormx GPT AI | Official" label="Official channel" glow="bg-blue-500/20"
            lines={["🚀 Welcome to Wormx GPT AI!", "💙 Discover AI chat, image generation, coding help and creative possibilities.", "✨ AI ideas. Real creativity. Endless possibilities."]} />
          <ChannelPreview url={AURA_URL} handle="t.me/VERIFIEDAURACHAT" avatar="/aura-avatar.jpg" alt="Aura Chat channel avatar" name="AURA CHAT CHANNEL" label="Official · Aura Chat" glow="bg-violet-500/25" accent="text-violet-300" badge="bg-violet-500/15 text-violet-300"
            lines={["💬 A new, amazing chatting app with great features.", "🔒 Secure end-to-end encrypted messages to explore with your friends and family."]} />
          <VortyxCard />
        </div>
      </div>

      <p className="mt-12 text-xs text-neutral-600">Facebook, WhatsApp and Meta are trademarks of Meta Platforms, Inc. Aura is a trademark of its owners. Wormx GPT v5 is not affiliated with them.</p>
    </footer>
  );
}

export default function AuthLayout({ title, desktopTitle, subtitle, footer, children, hideLegal = false }) {
  return (
    <div className="auth-root relative overflow-x-hidden bg-black text-white lg:bg-black">
      {/* backgrounds */}
      <div className="auth-aurora pointer-events-none lg:hidden" aria-hidden="true" />
      <img src="/auth-helmet.jpg" alt="" aria-hidden="true" className="auth-art-glow pointer-events-none absolute left-[18%] top-[-8%] hidden w-[1000px] max-w-none -translate-x-1/2 opacity-35 lg:block" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full flex-col lg:max-w-[1400px] lg:justify-center lg:px-10 lg:py-10">
        <div className="flex flex-1 flex-col lg:min-h-[720px] lg:flex-none lg:overflow-hidden lg:rounded-[28px] lg:border-2 lg:border-white/25 lg:bg-black/60 lg:backdrop-blur-md">
          <DesktopNav />
          <div className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
            {/* desktop art */}
            <div className="relative hidden flex-1 items-end justify-center overflow-hidden lg:flex" aria-hidden="true">
              <img src="/auth-helmet.jpg" alt="" className="auth-art-mask h-full max-h-[640px] w-full object-cover object-center" />
            </div>

            {/* form column */}
            <div className="flex flex-1 flex-col px-5 pt-8 min-[420px]:px-6 min-[420px]:pt-12 sm:px-10 lg:items-center lg:justify-center lg:px-0 lg:pb-12 lg:pt-6">
              <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col lg:max-w-[320px] lg:flex-none">
                <Brand />
                <div className="mt-8 text-center min-[420px]:mt-14 lg:mt-0">
                  <h1 className="mx-auto text-[24px] font-bold min-[420px]:text-[28px] leading-[1.15] tracking-tight text-white lg:max-w-none lg:text-[26px] lg:tracking-wide">
                    <span className="whitespace-pre-line lg:hidden">{title}</span>
                    <span className="hidden whitespace-pre-line lg:inline">{desktopTitle || title}</span>
                  </h1>
                  {subtitle && <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>}
                </div>
                <div className="mt-6 min-[420px]:mt-8 lg:mt-7">{children}</div>
                <div className="flex-1 lg:hidden" />
                {footer && (
                  <p className="auth-safe-bottom mt-6 pt-4 text-center text-[14px] text-neutral-400 min-[420px]:mt-8 min-[420px]:text-[15px] lg:mt-8 lg:pb-0 lg:text-[14px] [&_a]:!font-semibold [&_a]:!text-white [&_a]:no-underline lg:[&_a]:!font-bold">
                    {footer}
                  </p>
                )}
                {!hideLegal && (
                  <p className={`text-center text-xs text-neutral-600 ${footer ? "pb-6 lg:pb-0" : "auth-safe-bottom mt-8"} lg:mt-3`}>
                    By continuing, you agree to Wormx GPT's{" "}
                    <Link to="/terms" className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-400">Terms</Link>
                    {" "}and{" "}
                    <Link to="/privacy" className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-400">Privacy Policy</Link>.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
