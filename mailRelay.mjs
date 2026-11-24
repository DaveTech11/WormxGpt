// Deliver Wormx GPT verification codes as REAL EMAIL, direct-to-MX, with no mail
// provider and no per-domain verification.
//
// Why this exists: Wormx GPT's own senders all needed something the host would not
// give. Render free blocks outbound SMTP (25/465/587), Resend refuses every
// domain except the account owner's until it is verified, and Brevo needs a
// paid, verified sender. So codes never arrived.
//
// This module does not try any of that. It hands the message to a relay that
// sits on a host with working outbound port 25, and that relay opens an SMTP
// conversation straight with the recipient's own mail server (Gmail, Outlook,
// Yahoo, anything) and signs it with DKIM. The code lands in the user's real
// inbox. No provider account, no domain verification, no API key.
//
// The relay is the same proven mailer that already sends NEXUS OTPs, deployed
// on Fly so it has a stable URL and no tunnel to lose.
//
// Env vars:
//   MAIL_RELAY_URL    e.g. https://xmail-relay.fly.dev   (required to enable)
//   MAIL_RELAY_TOKEN  shared bearer token for that relay  (required to enable)
//   MAIL_RELAY_FROM_NAME   display name on the From line  (default "Wormx GPT")
//
// With MAIL_RELAY_URL unset this module reports "not configured" and
// server.mjs falls through to its other senders, so nothing regresses.

const URL_ = () => String(process.env.MAIL_RELAY_URL || '').trim().replace(/\/+$/, '');
const TOKEN = () => String(process.env.MAIL_RELAY_TOKEN || '').trim();
const FROM_NAME = () => String(process.env.MAIL_RELAY_FROM_NAME || 'Wormx GPT').trim();
const TIMEOUT = Number(process.env.MAIL_RELAY_TIMEOUT_MS || 25000);

export const mailRelayConfigured = () => Boolean(URL_() && TOKEN());

export function describeMailRelay() {
  if (!URL_()) return 'mail relay: not configured (set MAIL_RELAY_URL)';
  if (!TOKEN()) return 'mail relay: URL set but MAIL_RELAY_TOKEN missing';
  return `mail relay: ${URL_()} as "${FROM_NAME()}"`;
}

// Send any message through the relay. Returns {ok, info} — never throws for a
// relay-level refusal, so callers can decide whether to fall back.
export async function sendViaRelay({ to, subject, text, html }) {
  if (!mailRelayConfigured()) return { ok: false, info: 'mail relay not configured' };
  try {
    const r = await fetch(`${URL_()}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` },
      body: JSON.stringify({ to, subject, text, html, from_name: FROM_NAME() }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      return { ok: false, info: body.error || `relay HTTP ${r.status}` };
    }
    return { ok: true, info: body.info || 'sent' };
  } catch (e) {
    return { ok: false, info: `${e.name}: ${String(e.message).slice(0, 140)}` };
  }
}

// The verification-code send, in the shape server.mjs needs.
export async function sendCodeViaRelay(to, code, ttlMinutes = 10) {
  const minutes = Number(ttlMinutes) || 10;
  const subject = 'Your Wormx GPT verification code';
  const text =
    `Your Wormx GPT verification code is ${code}. ` +
    `It expires in ${minutes} minutes. If you did not request it, ignore this email.`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:auto;padding:24px">` +
    `<h2 style="margin:0 0 12px;color:#111">Your Wormx GPT code</h2>` +
    `<p style="color:#444;margin:0 0 8px">Enter this code to finish signing in:</p>` +
    `<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:18px 0;color:#111">${code}</p>` +
    `<p style="color:#777;font-size:13px;margin:0">It expires in ${minutes} minutes. ` +
    `If you did not request it, you can ignore this email.</p></div>`;
  return sendViaRelay({ to, subject, text, html });
}
