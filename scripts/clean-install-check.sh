#!/bin/zsh
# M1 — the clean install, run from a macOS account that has never opened Aphrodite.
#
#   1. Make a new user account (System Settings → Users & Groups), log into it.
#   2. Open Terminal there and paste:
#        curl -fsSL https://raw.githubusercontent.com/kwakseongjae/aphrodite-mela/main/scripts/clean-install-check.sh | zsh -s -- 0.2.0
#      or, with the repo to hand:  zsh scripts/clean-install-check.sh 0.2.0
#
# It checks everything that can be checked without a person, prints what only a person can see,
# and leaves the disk image mounted so the next step is a drag.
set -u
V="${1:-0.2.0}"
REPO=kwakseongjae/aphrodite-mela
SUPPORT="$HOME/Library/Application Support/studio.aphrodite.mela"
say(){ print -r -- "$@" }
pass(){ say "  ✓ $1" }
fail(){ say "  ✗ $1"; FAILED=1 }
FAILED=0

say "== This account has never run Aphrodite?"
if [ -e "$SUPPORT" ]; then
  fail "$SUPPORT already exists — this is not a clean account. Use a new one, or the test proves nothing."
  exit 2
fi
pass "no Aphrodite data in this account"

say "\n== Download v$V the way a person would, quarantine and all"
cd "$HOME/Downloads" || exit 1
DMG="Aphrodite_${V}_aarch64.dmg"
[ "$(uname -m)" = "x86_64" ] && DMG="Aphrodite_${V}_x64.dmg"
curl -fsSLO "https://github.com/$REPO/releases/download/v$V/$DMG" || { fail "could not download $DMG"; exit 3; }
xattr -w com.apple.quarantine "0083;$(printf %x $(date +%s));Safari;" "$DMG"
pass "$DMG downloaded and marked as coming from the internet"

say "\n== Gatekeeper"
if spctl -a -t open --context context:primary-signature -v "$DMG" 2>&1 | grep -q accepted; then
  pass "accepted — no right-click → Open needed"
else
  fail "Gatekeeper refused it: $(spctl -a -t open --context context:primary-signature -v "$DMG" 2>&1)"
fi
if xcrun stapler validate "$DMG" >/dev/null 2>&1; then pass "notarization ticket is stapled"; else fail "no stapled ticket"; fi

say "\n== Mounting it for you"
MP=$(hdiutil attach -nobrowse "$DMG" | sed -n 's#.*\(/Volumes/.*\)$#\1#p' | tail -1)
if [ -d "$MP/Aphrodite.app" ]; then
  pass "mounted at $MP"
  say "  version inside: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$MP/Aphrodite.app/Contents/Info.plist")"
else
  fail "could not find Aphrodite.app in the image"; exit 4
fi

say "\n────────────────────────────────────────────────────────"
say " Now do this by hand, and time the first paint:"
say "   1. Drag Aphrodite to Applications."
say "   2. Double-click it in Applications. Start counting."
say ""
say " Watch for — any 'no' is worth writing down:"
say "   • It opens with no warning (no right-click → Open)"
say "   • A welcome sheet appears, in this account's language"
say "   • The brand kit window is NOT already open  ← seen once on 10 Sept, never reproduced"
say "   • The sample project opens, edits, and saves"
say "   • The agent switch in the top row starts OFF"
say "   • No update card (you just installed the newest)"
say "   • First paint under 2 seconds"
say ""
say " When it is running, come back here and press return."
say "────────────────────────────────────────────────────────"
read -r _

say "\n== What the app left behind"
if [ -f "$SUPPORT/agent-endpoint.json" ]; then
  MODE=$(stat -f '%OLp' "$SUPPORT/agent-endpoint.json")
  [ "$MODE" = "600" ] && pass "agent-endpoint.json exists, mode $MODE" || fail "agent-endpoint.json is mode $MODE, expected 600"
  BASE=$(python3 -c "import json;print(json.load(open('$SUPPORT/agent-endpoint.json'))['base'])" 2>/dev/null)
  TOKEN=$(python3 -c "import json;print(json.load(open('$SUPPORT/agent-endpoint.json'))['token'])" 2>/dev/null)
  say "\n== The channel, from a standing start"
  CODE=$(curl -s -o /tmp/m1-state.json -w '%{http_code}' -m 6 "$BASE/agent/state" -H "Authorization: Bearer $TOKEN" -H 'X-Aphrodite-Agent: m1-check')
  [ "$CODE" = "200" ] && pass "reading works with no permission (200)" || fail "reading answered $CODE"
  python3 -c "
import json
s=json.load(open('/tmp/m1-state.json'))['state']
print('    connection:',s.get('connection'),'· writes:',s.get('writes'))
" 2>/dev/null
  CODE=$(curl -s -o /tmp/m1-write.json -w '%{http_code}' -m 6 -X POST "$BASE/agent/apply" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'X-Aphrodite-Agent: m1-check' -d '{"ops":[{"op":"update","block_id":"selection","fields":{"title":"should not land"}}]}')
  [ "$CODE" = "423" ] && pass "writing is refused until a person opens the door (423)" || fail "writing answered $CODE, expected 423"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 6 "$BASE/agent/state" -H 'Authorization: Bearer wrong-token')
  [ "$CODE" = "401" ] && pass "a wrong token is refused (401)" || fail "a wrong token answered $CODE"
else
  fail "no agent-endpoint.json — the channel did not start"
fi

say "\n== Result"
[ "$FAILED" = "0" ] && say "  Everything this script can check passed. Add what you saw by hand." || say "  Something failed above — copy this output back."
hdiutil detach "$MP" -quiet 2>/dev/null
exit "$FAILED"
