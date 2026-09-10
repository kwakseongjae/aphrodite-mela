#!/usr/bin/env bash
# Interactive helper: exports the Developer ID certificate from the login keychain and
# stores the notarization secrets in the GitHub repository. Run it yourself — it asks
# for a one-time .p12 password and your Apple ID app-specific password; nothing is
# written to disk except a temporary .p12 that is deleted at the end.
#
#   bash scripts/apple-signing-secrets.sh
#
# Prerequisites: `gh auth status` OK, the "Developer ID Application" identity in Keychain
# Access, and an app-specific password from https://account.apple.com (Sign-In and Security →
# App-Specific Passwords). The repository must already exist (kwakseongjae/aphrodite-mela).
set -euo pipefail
REPO="${REPO:-kwakseongjae/aphrodite-mela}"
IDENTITY="${IDENTITY:-Developer ID Application: Kwak Seongjae (YWQQFQM38J)}"
TEAM_ID="${TEAM_ID:-YWQQFQM38J}"

command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login"; exit 1; }
security find-identity -v -p codesigning | grep -q "$IDENTITY" || { echo "identity not found in keychain: $IDENTITY"; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
P12="$TMP/developer-id.p12"

echo "1/3  Exporting the certificate + private key to a temporary .p12"
read -r -s -p "     Choose a password for the .p12 (used only as APPLE_CERTIFICATE_PASSWORD): " P12_PASS; echo
# macOS may show a keychain prompt — click "Allow" (or "Always Allow").
security export -k login.keychain-db -t identities -f pkcs12 -P "$P12_PASS" -o "$P12" 2>/dev/null \
  || security export -t identities -f pkcs12 -P "$P12_PASS" -o "$P12"
[ -s "$P12" ] || { echo "export failed (empty .p12). Try exporting from Keychain Access manually and re-run with P12_FILE=…"; exit 1; }

echo "2/3  Apple ID for notarization"
read -r -p "     Apple ID e-mail: " APPLE_ID
read -r -s -p "     App-specific password: " APPLE_PASSWORD; echo

echo "3/3  Storing secrets in $REPO"
base64 -i "$P12" | gh secret set APPLE_CERTIFICATE --repo "$REPO"
printf '%s' "$P12_PASS"      | gh secret set APPLE_CERTIFICATE_PASSWORD --repo "$REPO"
printf '%s' "$IDENTITY"      | gh secret set APPLE_SIGNING_IDENTITY --repo "$REPO"
printf '%s' "$APPLE_ID"      | gh secret set APPLE_ID --repo "$REPO"
printf '%s' "$APPLE_PASSWORD"| gh secret set APPLE_PASSWORD --repo "$REPO"
printf '%s' "$TEAM_ID"       | gh secret set APPLE_TEAM_ID --repo "$REPO"
gh secret list --repo "$REPO"
echo "Done. Push a tag (git tag v0.1.0 && git push origin v0.1.0) to build a signed, notarized DMG."
