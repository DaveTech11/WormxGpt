#!/usr/bin/env bash
# Verify that Wormx GPT delivers sign-up codes through Telegram.
#
#   ./verify-otp.sh https://xryon.myng.net
#
# Checks, in order:
#   1. the server is up and the newer Telegram routes exist
#   2. a code request is ACCEPTED (not rejected by the mail provider)
#   3. the bot can reach the operator chat (which is what delivers the code)
#
# Note: this deliberately sends browser-like headers. Wormx GPT's anti-scrape guard
# refuses plain curl, so a bare `curl` here reports a false 403.
set -uo pipefail

BASE="${1:-https://xryon.myng.net}"
UA="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
PROBE="verify-$(date +%s)@gmail.com"
fail=0

hdr=(-H "User-Agent: $UA" -H "Accept-Language: en-US,en;q=0.9"
     -H "Sec-Fetch-Site: same-origin" -H "Origin: $BASE")

echo "== Wormx GPT Telegram OTP check =="
echo "target: $BASE"
echo

echo "1. server up, Telegram routes present"
code=$(curl -sS -m 25 -o /tmp/vo_health -w '%{http_code}' "${hdr[@]}" "$BASE/api/health")
echo "   /api/health      -> $code $(head -c 80 /tmp/vo_health)"
[ "$code" = "200" ] || { echo "   FAIL: server not healthy"; fail=1; }

body=$(curl -sS -m 25 "${hdr[@]}" "$BASE/api/auth/tg-status")
case "$body" in
  *configured*) echo "   /api/auth/tg-status -> $body"
                case "$body" in
                  *'"configured":true'*) ;;
                  *) echo "   FAIL: Telegram not configured. Set TELEGRAM_BOT_TOKEN in Render."; fail=1 ;;
                esac ;;
  *) echo "   /api/auth/tg-status -> $body"
     echo "   FAIL: route missing -> the newer code is NOT deployed yet."; fail=1 ;;
esac
echo

echo "2. a code request is accepted"
resp=$(curl -sS -m 40 -X POST "${hdr[@]}" -H "Content-Type: application/json" \
        -d "{\"email\":\"$PROBE\"}" "$BASE/api/auth/send-code")
echo "   -> $resp"
case "$resp" in
  *'"ok":true'*) echo "   OK: accepted (delivery attempted)" ;;
  *"testing email address"*|*"Invalid \`to\` field"*)
      echo "   FAIL: still falling through to the mail provider."; fail=1 ;;
  *) echo "   FAIL: not accepted."; fail=1 ;;
esac
echo

echo "3. bot can reach the operator chat"
tok="${TELEGRAM_BOT_TOKEN:-}"
if [ -z "$tok" ] && [ -f ./token.txt ]; then tok=$(tr -d '\n' < ./token.txt); fi
if [ -z "$tok" ]; then
  echo "   SKIP: set TELEGRAM_BOT_TOKEN (or write it to ./token.txt) to test delivery."
else
  chat=$(curl -sS -m 25 "https://api.telegram.org/bot$tok/getMe" \
         | python3 -c "import sys,json;print(json.load(sys.stdin).get('result',{}).get('username',''))" 2>/dev/null)
  echo "   bot: @${chat:-unknown}"
  out=$(curl -sS -m 25 -X POST "https://api.telegram.org/bot$tok/sendMessage" \
        -H "Content-Type: application/json" \
        -d '{"chat_id":"7724436551","text":"Wormx GPT OTP verify: delivery reachable."}')
  case "$out" in
    *'"ok":true'*) echo "   OK: bot can reach the operator chat" ;;
    *) echo "   FAIL: $out"; fail=1 ;;
  esac
fi
echo
[ "$fail" = "0" ] && echo "RESULT: PASS" || echo "RESULT: FAIL (see above)"
exit "$fail"
