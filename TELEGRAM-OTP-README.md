# Wormx GPT — Telegram OTP delivery. Read this first.

## What this fixes

Sign-up codes are not arriving. The cause is **not** the Telegram code — that
part was already written and I proved it runs. The cause is two things:

1. **The live server has no working mail provider.** Resend is configured but its
   free tier only delivers to the account owner's own address, so every other
   user gets `Invalid 'to' field ... use our testing email address`. Verified
   against production: that is the exact error it returns.
2. **The live server is running older code.** It does not have the
   `/api/auth/tg-status` or `/api/telegram/webhook` routes that the Telegram
   path needs. Verified by comparing the same request against a local run of
   this source tree.

## Two settings must be added in the Render dashboard

Render -> your service -> Environment -> add:

    TELEGRAM_BOT_TOKEN = <the @xryonai_bot token>
    XYRON_CODE_CHAT_ID = 7724436551

`TELEGRAM_CODE_DELIVERY` defaults to on, so it does not need setting. Once these
exist, Telegram is tried **before** Resend, so the broken mail provider stops
being reached at all.

## What changed in the code

`antiscrape.mjs` — added `/api/telegram/webhook` to `PUBLIC_API`.

Without this the Telegram bot can never work, even with the settings above.
Telegram delivers updates server-to-server, so its requests carry no
`Accept-Language` and no `Sec-Fetch-*` headers and use a bot User-Agent — all
three of which this guard requires/rejects. It answered every update with
`403 Forbidden`, and Telegram would have retried silently forever.

Payment webhooks were already exempt for the same reason. Each webhook still
authenticates properly on its own: the Telegram route checks
`x-telegram-bot-api-secret-token`, and the payment routes verify their own
signatures further down. The guard was never what made them safe.

## Deploy

    # from the repo root, with the service's git remote configured
    git add antiscrape.mjs
    git commit -m "Let provider webhooks through the anti-scrape guard"
    git push

Render redeploys on push. Then verify:

    ./verify-otp.sh https://xryon.myng.net

## Honest scope limit

Telegram cannot put a message into someone else's Gmail inbox. It gets the code
to the human by one of two routes, both already built:

- **Automatic:** the user opens Settings -> "Send codes to Telegram" once and
  taps the link. From then on their codes go straight to their Telegram DM. No
  one in the loop. This is the real fix and it is already coded
  (`/api/auth/tg-link-token` + the `/start <token>` handler).
- **Manual relay:** for a user who has not linked, the code lands in the
  operator chat (`XYRON_CODE_CHAT_ID`). You read it out to them.

Route 1 is what you want; route 2 is the fallback that stops people being
locked out while they link.
