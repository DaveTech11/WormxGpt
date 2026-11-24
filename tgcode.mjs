// Deliver Wormx GPT email-verification codes through Telegram instead of email.
//
// Why: the app asks a user for their email, generates a 6-digit code on the
// server, and normally mails it (SMTP / Brevo / Resend / Formspree). Those
// all fail or need paid ports. This module sends the SAME code as a Telegram
// message instead, so verification works with no mail provider at all.
//
// Two delivery modes, chosen automatically per address:
//
//   1) DIRECT  the email address belongs to a known Telegram chat.
//              A user links their email once (see /api/auth/tg-link), and
//              afterwards every code goes straight to their Telegram DM.
//
//   2) INBOX   nobody has linked that email yet. The code is posted to an
//              operator channel/chat, so it still lands somewhere readable
//              instead of being lost to a blocked SMTP port.
//
// Env vars (all optional; any of the token names works):
//   TELEGRAM_BOT_TOKEN | TELEGRAM_FILES_BOT_TOKEN | TELEGRAM_BACKUP_BOT_TOKEN
//   XYRON_CODE_CHAT_ID   chat/channel id that receives codes for unlinked emails
//                        (defaults to TELEGRAM_FILES_CHAT_ID, then TELEGRAM_BACKUP_CHAT_ID)

const TOKEN = () =>
  String(
    process.env.TELEGRAM_BOT_TOKEN ||
      process.env.TELEGRAM_FILES_BOT_TOKEN ||
      process.env.TELEGRAM_BACKUP_BOT_TOKEN ||
      ''
  ).trim();

const CODE_CHAT = () =>
  String(
    process.env.XYRON_CODE_CHAT_ID ||
      process.env.TELEGRAM_FILES_CHAT_ID ||
      process.env.TELEGRAM_BACKUP_CHAT_ID ||
      ''
  ).trim();

export const tgCodeConfigured = () => Boolean(TOKEN());

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

async function api(method, body, timeoutMs = 15000) {
  const tok = TOKEN();
  if (!tok) throw new Error('Telegram code delivery is not configured (no bot token).');
  const r = await fetch(`https://api.telegram.org/bot${tok}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method} failed: ${j.description || r.status}`);
  return j.result;
}

const codeText = (email, code, ttlMinutes) =>
  [
    '<b>Your Wormx GPT verification code</b>',
    '',
    `<code>${esc(code)}</code>`,
    '',
    `Requested for <b>${esc(email)}</b>.`,
    `It expires in ${ttlMinutes} minutes.`,
    'If you did not request it, ignore this message.',
  ].join('\n');

// Send the code to one specific Telegram chat (a linked user).
export async function sendCodeToChat(chatId, email, code, ttlMinutes = 10) {
  return api('sendMessage', {
    chat_id: String(chatId),
    text: codeText(email, code, ttlMinutes),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

// Send the code to the operator chat (email not linked to any Telegram account yet).
export async function sendCodeToOperator(email, code, ttlMinutes = 10) {
  const chat = CODE_CHAT();
  if (!chat) {
    throw new Error(
      'No Telegram destination for codes. Link your email in the app, or set XYRON_CODE_CHAT_ID.'
    );
  }
  return api('sendMessage', {
    chat_id: chat,
    text: `<b>Wormx GPT code for an unlinked email</b>\n\n${codeText(email, code, ttlMinutes)}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

// Is this Telegram user in the channel? true / false, or null when it can't be checked (no bot token, the bot is not an
// admin of that channel, or the channel link is not a t.me/<name> address).
export async function tgIsMember(channelUrl, userId) {
  const m = /^https?:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{3,})\/?$/i.exec(String(channelUrl || '').trim());
  if (!m || !userId || !TOKEN()) return null;
  try {
    const r = await api('getChatMember', { chat_id: '@' + m[1], user_id: Number(userId) });
    return ['creator', 'administrator', 'member', 'restricted'].includes(r?.status) && r?.status !== 'left';
  } catch {
    return null;
  }
}

// Plain message to any chat (used by the bot webhook replies).
export async function tgSend(chatId, text) {
  if (!chatId) return null;
  return api('sendMessage', {
    chat_id: String(chatId),
    text: String(text || '').slice(0, 4000),
    disable_web_page_preview: true,
  });
}

// The bot's @username, so the app can show a t.me/<bot>?start=<token> link.
let cachedBotName = null;
export async function tgBotUsername() {
  if (cachedBotName !== null) return cachedBotName;
  try {
    const me = await api('getMe', {});
    cachedBotName = String(me?.username || '');
  } catch {
    cachedBotName = '';
  }
  return cachedBotName;
}

// Point Telegram at our webhook so the bot can receive /start and /link.
export async function setTelegramWebhook(url, secret) {
  if (!url) throw new Error('setTelegramWebhook needs a public https url');
  const body = { url, allowed_updates: ['message', 'edited_message'] };
  if (secret) body.secret_token = secret;
  return api('setWebhook', body);
}

export async function telegramWebhookInfo() {
  try {
    return await api('getWebhookInfo', {});
  } catch (e) {
    return { error: e.message };
  }
}

// True when this chat id can be messaged by the bot. Used to verify a link
// before storing it, so a typo does not silently swallow every future code.
export async function chatIsReachable(chatId) {
  try {
    await api('getChat', { chat_id: String(chatId) });
    return true;
  } catch {
    return false;
  }
}

// Resolve the Telegram chat that owns an email, using the lookup the server
// passes in (so this module stays free of database details).
export function resolveLinkedChat(db, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return '';
  for (const u of db.users || []) {
    if (
      u.telegramChatId &&
      String(u.email || '').trim().toLowerCase() === target
    ) {
      return String(u.telegramChatId);
    }
  }
  const link = (db.tgEmailLinks || []).find(
    (l) => String(l.email || '').trim().toLowerCase() === target
  );
  return link ? String(link.chatId || '') : '';
}
