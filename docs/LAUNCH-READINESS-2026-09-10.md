# Launch readiness — 2026-09-10

Goal: a Mac user opens the landing page, downloads a DMG, and tries Aphrodite without friction. This document merges three sources: a read-only Claude subagent diagnosis (architecture/quality/tests), an independent Grok 4.6 review (distribution/security/first-run), and hands-on verification by the orchestrator (build, DMG, Gatekeeper, window sizing, native screenshots). Every claim below was re-checked against the code or a real artifact unless marked *unverified*.

## Verdict

**NOT READY for public download; READY for a private tester build.** Blocking item is trust, not function: the DMG is ad-hoc signed and `spctl --assess` on a quarantined copy returns `rejected · no usable signature`. Everything else needed for "download → drag → open" is now in place.

## What changed today

| Area | Before | After | Evidence |
| --- | --- | --- | --- |
| App icon | Tauri default green "a" (`public/icon.svg` legacy) | Golden engraved apple, negative-space "a", paper squircle; full `src-tauri/icons` set | `public/brand/app-icon-1024.png`, Dock/Finder verified on a fresh release build |
| OCR helper min OS | `minos 26.0` (inherited from build host) → helper would refuse to launch on macOS ≤ 15 | `-target arm64-apple-macos13.0` in `scripts/build-vision.mjs` | `otool -l` on the bundled binary inside the DMG: `minos 13.0`; OCR run on `demo-reference.jpg` returned 25 lines |
| Bundle | `targets: ["app"]`, no min version | `["app","dmg"]`, `macOS.minimumSystemVersion: "13.0"` | `Aphrodite_0.1.0_aarch64.dmg` (41 MB) built; `LSMinimumSystemVersion 13.0` |
| Release pipeline | none | `.github/workflows/release.yml` (tauri-action, macos-15, arm64 DMG, optional Developer ID + notarization via `APPLE_*` secrets) | file |
| Landing page | none | `site/` static page, EN/KO, latest-release DMG link via GitHub API, OG image | `.github/workflows/pages.yml` |
| Reference size limit | UI said 3MB, Rust rejected > 2.7M chars (~2MB), README said 2MB | 2MB everywhere | `src/main.ts:351`, `src-tauri/src/reference.rs:14` |
| Third-party notices | no Apache NOTICE for SEED/Astryx | added | `THIRD_PARTY_NOTICES.md` |

## P0 — must do before a public link

1. **Developer ID signing + notarization.** A valid `Developer ID Application: Kwak Seongjae (YWQQFQM38J)` identity exists in the local keychain. Export it as `.p12`, add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID` as repository secrets, push a `v0.1.0` tag, and re-run `spctl --assess --type open --context context:primary-signature` on the downloaded DMG. Until then `site/script.js` keeps `GATEKEEPER_NOTE = true` so the page shows the right-click → Open instruction. Effort S (credentials) + one CI run.
2. ~~Create the GitHub repository and enable Pages.~~ **Done 2026-09-10 (owner decision):** `https://github.com/kwakseongjae/aphrodite-mela` (public, MIT), Pages via Actions → `https://kwakseongjae.github.io/aphrodite-mela/` (first deploy succeeded). Local-only experiments moved to `lab/` (git-ignored).
3. ~~Decide the public product name.~~ **Done (owner decision): "Aphrodite".** `aphrodite-mela` stays as the repo/package slug only. README and PRODUCT.md headings updated.

## P1 — fix before inviting strangers

- ~~Inspector disappears at the minimum window size.~~ **Merged 2026-09-10** (Grok 4.6 worker, reviewed rule-by-rule): window minimum 900×620; below 1100px the studio is two columns with the inspector stacked full-width and scrollable, topbar compacts but keeps Export. Native-verified 2026-09-10 at 900×620 and 1000×700: inspector stacked below the canvas as a two-column block with its own scroll, breadcrumb label hidden, Export visible. Remaining polish (P2): at these sizes the canvas keeps only ~230–300px of height because the stacked inspector is content-sized — make it collapsible or cap it at ~40% height. Original problem for the record: `tauri.conf.json` sets `minWidth 1000 / minHeight 700`; at exactly 1000×700 the right-hand Design/Component panel, breadcrumb, undo/redo and language button are not visible (native screenshot 2026-09-10). A 13″ MacBook Air at the default 1280×832 scaling lands close to this. Options: lower `minWidth` to ~900 and make the ≤1000px CSS branch (`src/style.css` `@media(max-width:1000px)`) actually stack the inspector with its own scroll, or raise the minimum and say so on the landing page. Effort M.
- ~~Failed native write blocks all later saves until relaunch.~~ **Shipped 2026-09-10:** the queue still refuses silent overwrites, but the editor now shows a persistent banner (`.disk-warning`) with "Save a backup file" and "Reload from disk"; the home warning has the same reload action. `reloadFromDisk()` re-reads `library.json` and attaches a fresh `DurableQueue` (`attachDiskQueue`). Native-verified 2026-09-10 by making `workspace-v1/` read-only: home warning + reload button, editor banner after an approval write failed, reload restored "디스크에 저장됨" in both places. Note: opening a project while unsaved is blocked by the existing `guardSwitch()` — reload first.
- ~~Language default.~~ **Shipped 2026-09-10:** first run follows the OS locale (`detectUiLanguage(navigator.language)`); a saved choice wins (`tests/ui-language.test.ts`). Full editor-chrome localization remains L.
- ~~Vault snapshots never garbage-collect.~~ **Merged 2026-09-10** (Grok 4.6 worker): `src-tauri/src/vault.rs` prunes to `KEEP_SNAPSHOTS = 5` after `current.json` is published, current pinned, orphans removed, I/O errors never fail the sync; 3 new Rust tests, 9/9 pass locally.
- ~~Repository hygiene before going public.~~ **Done:** `lab/` (artifacts, validation runs, sculpture sources, unused brand experiments — 862 MB) is git-ignored; first commit is 267 files / 24 MB. `LICENSE` = MIT (owner's other public repos use MIT; change to Apache-2.0 if preferred). `tests/sculpture.test.ts` skips its GLB check when `lab/` is absent (CI).
- **Unexplained: brand-kit modal open at launch.** On the first launch of the fresh build the "Aphrodite brand kit" modal was already open before any input. Nothing in `boot()` opens it; not reproduced on a second launch. Watch for it; if it recurs, check whether a stale click or focus event fires `data-action="brand-kit"` during hydration. Effort S to investigate.

## P2 — after launch

- `src/main.ts` is 111 KB in 670 lines (longest line 2,245 chars). It is not a functional blocker while tests are green, but any week-1 hotfix will touch it. The cuts with the best value/risk ratio: (1) move the `action()` switch cases (`src/main.ts:371-531`) into per-domain handlers next to `workspace/vault.ts` and `export.ts`; (2) extract `render()` chrome/inspector assembly; (3) move the 1.5–2.2 k-char modal bodies (`analysisModal`, `compareModal`, `agentModal`, `inspectorHtml`) into `design/*.ts` like `catalog-view.ts`; (4) `boot()` + `DurableQueue` + close guard → `workspace/boot.ts`; (5) `bindDragAndDrop` → `editor/`.
- `package.json` runtime deps that `src/` never imports (`react`, `@mui/*`, `@emotion/*`, `@seed-design/*`, `@astryxdesign/*`, `@stylexjs/stylex`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`) are consumed by `scripts/build-library-runtime.mjs` (official-component iframe runtime) and copied into the exported `react-source/package.json`. They are not dead, but the whole `lucide` icon pack is imported into the main webview (`src/main.ts:1`) — switch to per-icon imports to cut bundle size.
- `recognize_reference` (`src-tauri/src/reference.rs`) checks the data-URL length, not decoded bytes, discards helper stderr, and parses `evidence.json` without a size cap. Low risk locally; tighten when the helper gains features.
- Universal (arm64 + x86_64) build. Today's artifact is Apple Silicon only, which the landing page states. Adding `x86_64-apple-darwin` to the workflow and `lipo` for the Swift helper is straightforward once signing works.
- Auto-update (`tauri-plugin-updater`) once releases are signed.
- App name mismatch inside the bundle: `CFBundleName` "Aphrodite", executable `aphrodite-mela`. Cosmetic.

## Security notes (verified)

- CSP (`tauri.conf.json`): `default-src 'self'`, no remote `connect-src`; `style-src 'unsafe-inline'` is required by generated CSS. Adequate for a local workbench.
- Capabilities: `dialog:allow-save` + `fs:allow-write-file` without an explicit scope. In plugin-fs 2.x a path chosen through the dialog plugin is added to the scope for that call, and no other scope permission is granted, so arbitrary writes from the webview are not allowed. *Not exercised at runtime today; confirm with a deliberate `writeFile("/tmp/x")` from devtools before relying on it.*
- Rust commands (`vault.rs`, `workspace.rs`): segment allow-list, symlink rejection, no-clobber persist, 40 MB payload cap, exclusive lock, stale-revision refusal. Good.
- The Swift helper only reads a temp raster and writes JSON; no network. It is spawned with null stdio and a 25 s kill.

## Release pipeline status

- Tag `v0.1.0-rc.1`: **failed** in `Run tests` — the GLB fixture test read `lab/sculpture/...`, which is git-ignored. Fixed by skipping that test when the fixture is absent.
- Tag `v0.1.0-rc.2`: **failed** in bundling — `security import: failed to import keychain certificate`, because `APPLE_SIGNING_IDENTITY`/`APPLE_TEAM_ID` were set without `APPLE_CERTIFICATE`. Fixed by gating every `APPLE_*` env on the certificate secret in `release.yml`.
- Tag `v0.1.0-rc.3`: result recorded below once the run finishes (draft release, ad-hoc signed until the owner runs `scripts/apple-signing-secrets.sh`).

## Hands-on results

- `npm test` 94/94, `npm run build` OK, `cargo check` OK, `tsc --noEmit` OK (after today's edits).
- Fresh release build launched; Dock shows the new icon; home (Korean UI) and editor screenshots captured for the landing page (`site/assets/shots/`).
- DMG mounted read-only: `Aphrodite.app` (arm64 thin, ad-hoc), `Applications` symlink, volume icon present.
- Gatekeeper simulation: `xattr -w com.apple.quarantine` on the DMG → `spctl` **rejected**. This is what every downloader will hit until P0-1 is done.

## Independent review (Grok 4.6) — disposition

| Grok finding | Severity claimed | Disposition |
| --- | --- | --- |
| Unsigned/un-notarized → Gatekeeper | C | Confirmed by `spctl`; P0-1 |
| App-only bundle, no DMG/updater | H | DMG done; updater P2 |
| Host-arch build, unpinned helper min OS | H | Helper pinned to 13.0 (was 26.0 — worse than Grok assumed); arm64-only stays, disclosed |
| `fs:allow-write-file` unscoped | H | Downgraded to L: dialog-scoped in plugin-fs 2.x; runtime confirmation pending |
| DurableQueue poison after failure | H | Confirmed but intentional (test asserts it); P1 recovery UX |
| Vault snapshots append-only | M | Confirmed; P1 |
| English default, mixed editor language | M | Confirmed; P1 |
| min window 1000×700 vs 13″ | M | Confirmed with a native screenshot; P1 |
| 3MB vs 2MB reference copy | M | Fixed |
| Apache NOTICE missing for SEED | M | Fixed |
| Name mismatch Aphrodite / Mela | M | P0-3 decision |
