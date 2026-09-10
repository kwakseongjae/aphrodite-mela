#!/usr/bin/env bash
# Interactive helper: exports ONLY the "Developer ID Application" identity from the login
# keychain as a .p12 and stores the signing + notarization secrets in the GitHub repository.
# Run it yourself — it asks for a one-time .p12 password and your Apple ID app-specific
# password; nothing is written to disk except temporary files that are deleted at the end.
#
#   bash scripts/apple-signing-secrets.sh
#
# Why the filtering: `security export -t identities` exports every identity in the keychain
# (Apple Development, Apple Distribution, Developer ID…). Tauri reads the first certificate
# in APPLE_CERTIFICATE and refuses to sign if it is not APPLE_SIGNING_IDENTITY, so the .p12
# must contain exactly one identity.
#
# Prerequisites: `gh auth status` OK, the "Developer ID Application" identity in Keychain
# Access, and an app-specific password from https://account.apple.com (Sign-In and Security →
# App-Specific Passwords). The repository must already exist (kwakseongjae/aphrodite-mela).
set -euo pipefail
#   bash scripts/apple-signing-secrets.sh --notary-only   # only re-enter Apple ID + app password
NOTARY_ONLY=0; [ "${1:-}" = "--notary-only" ] && NOTARY_ONLY=1
REPO="${REPO:-kwakseongjae/aphrodite-mela}"
IDENTITY="${IDENTITY:-Developer ID Application: Kwak Seongjae (YWQQFQM38J)}"
TEAM_ID="${TEAM_ID:-YWQQFQM38J}"

command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login"; exit 1; }
security find-identity -v -p codesigning | grep -q "$IDENTITY" || { echo "identity not found in keychain: $IDENTITY"; exit 1; }

TMP="$(mktemp -d)"
TMP_KC="$TMP/filter.keychain-db"
cleanup() { security delete-keychain "$TMP_KC" >/dev/null 2>&1 || true; security delete-keychain "$TMP/check.keychain-db" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
trap 'echo "     failed at line $LINENO (exit $?)" >&2' ERR
FULL="$TMP/all-identities.p12"
P12="$TMP/developer-id.p12"

if [ "$NOTARY_ONLY" = "1" ]; then
  echo "Notarization credentials only (certificate secrets are left as they are)."
else
echo "1/4  Exporting identities from the login keychain (macOS may ask you to Allow)"
read -r -s -p "     Choose a password for the .p12 (used only as APPLE_CERTIFICATE_PASSWORD): " P12_PASS; echo
security export -k login.keychain-db -t identities -f pkcs12 -P "$P12_PASS" -o "$FULL" 2>/dev/null \
  || security export -t identities -f pkcs12 -P "$P12_PASS" -o "$FULL"
[ -s "$FULL" ] || { echo "export failed (empty .p12). Export the Developer ID identity from Keychain Access manually instead."; exit 1; }

echo "2/4  Keeping only \"$IDENTITY\""
TMP_KC_PASS="$(openssl rand -hex 12)"
security create-keychain -p "$TMP_KC_PASS" "$TMP_KC"
security set-keychain-settings "$TMP_KC"
security unlock-keychain -p "$TMP_KC_PASS" "$TMP_KC"
security import "$FULL" -k "$TMP_KC" -P "$P12_PASS" -A >/dev/null
# Remove every identity that is not the Developer ID Application one, by SHA-1 so that
# two identities with the same name (e.g. a revoked duplicate) are both removed.
# Every certificate in the scratch keychain: "<sha1> <label>" per line.
kc_certs() { security find-certificate -a -Z "$1" 2>/dev/null | awk '/^SHA-1 hash:/{sha=$3} /"labl"<blob>="/{l=$0; sub(/.*"labl"<blob>="/,"",l); sub(/"$/,"",l); if (sha!="") print sha" "l; sha=""}'; }
for _ in 1 2 3 4 5 6; do
  security find-identity -v -p codesigning "$TMP_KC" | sed -n 's/^ *[0-9]*) \([0-9A-F]*\) "\(.*\)"$/\1 \2/p' | while read -r sha name; do
    if [ "$name" != "$IDENTITY" ]; then security delete-identity -Z "$sha" "$TMP_KC" >/dev/null 2>&1 || true; fi
  done
  # Certificates that lost their identity pairing (or duplicates sharing a hash) still get
  # exported next to the kept identity, so remove every non-target certificate as well.
  kc_certs "$TMP_KC" | while read -r sha label; do
    if [ "$label" != "$IDENTITY" ]; then security delete-certificate -Z "$sha" "$TMP_KC" >/dev/null 2>&1 || true; fi
  done
  REMAINING="$({ kc_certs "$TMP_KC" | grep -v -F "$IDENTITY" || true; } | wc -l | tr -d ' ')"
  [ "$REMAINING" = "0" ] && break
done
echo "     certificates left in the scratch keychain:"; kc_certs "$TMP_KC" | sed 's/^[0-9A-F]* /       - /'
security export -k "$TMP_KC" -t identities -f pkcs12 -P "$P12_PASS" -o "$P12"
# Verify with Apple tooling (openssl on macOS often cannot parse `security export` output):
# import the filtered .p12 into a second scratch keychain and list what is inside.
CHECK_KC="$TMP/check.keychain-db"
security create-keychain -p "$TMP_KC_PASS" "$CHECK_KC"
security unlock-keychain -p "$TMP_KC_PASS" "$CHECK_KC"
security import "$P12" -k "$CHECK_KC" -P "$P12_PASS" -A >/dev/null
KEPT="$(security find-identity -v -p codesigning "$CHECK_KC" | sed -n 's/.*"\(.*\)".*/\1/p' | sort -u)"
security delete-keychain "$CHECK_KC" >/dev/null 2>&1 || true
echo "     identities in the filtered .p12:"; printf '%s\n' "$KEPT" | sed '/^$/d;s/^/       - /'
COUNT="$(printf '%s\n' "$KEPT" | sed '/^$/d' | wc -l | tr -d ' ')"
if [ "$COUNT" != "1" ] || [ "$KEPT" != "$IDENTITY" ]; then
  echo "     expected exactly one identity (\"$IDENTITY\"), got $COUNT — aborting"; exit 1
fi

fi

echo "3/4  Apple ID for notarization (must be a member of team $TEAM_ID)"
read -r -p "     Apple ID e-mail: " APPLE_ID
read -r -s -p "     App-specific password (from account.apple.com → App-Specific Passwords): " APPLE_PASSWORD; echo
echo "     checking the credentials with Apple (notarytool history)…"
if ! xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$TEAM_ID" >/dev/null 2>"$TMP/notary.err"; then
  echo "     Apple rejected these credentials:"; sed 's/^/       /' "$TMP/notary.err" | head -5
  echo "     Use the Apple ID that owns/joins team $TEAM_ID and a fresh app-specific password. Nothing was stored."; exit 1
fi
echo "     credentials accepted."

echo "4/4  Storing secrets in $REPO"
if [ "$NOTARY_ONLY" != "1" ]; then
base64 -i "$P12" | gh secret set APPLE_CERTIFICATE --repo "$REPO"
printf '%s' "$P12_PASS"      | gh secret set APPLE_CERTIFICATE_PASSWORD --repo "$REPO"
printf '%s' "$IDENTITY"      | gh secret set APPLE_SIGNING_IDENTITY --repo "$REPO"
fi
printf '%s' "$APPLE_ID"      | gh secret set APPLE_ID --repo "$REPO"
printf '%s' "$APPLE_PASSWORD"| gh secret set APPLE_PASSWORD --repo "$REPO"
printf '%s' "$TEAM_ID"       | gh secret set APPLE_TEAM_ID --repo "$REPO"
gh secret list --repo "$REPO"
echo "Done. Push a tag (git tag v0.1.0 && git push origin v0.1.0) to build a signed, notarized DMG."
