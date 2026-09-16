# Development

How the repository is built, tested, verified and released. Contributions are not being taken yet; this is the working manual for the maintainer and the agents that work on the code.

## Toolchain

| Need | Version | Notes |
|---|---|---|
| Node | 22.12+ (developed on 24) | `npm` scripts, Vite, `tsx --test` |
| Rust | stable (1.85+) | Tauri 2 shell; `cargo` fetches `tiny_http` for the agent bridge |
| Xcode Command Line Tools + Swift | current | Builds the Vision OCR sidecar (`scripts/build-vision.mjs`); macOS only |
| Google Chrome | any recent | Optional: headless verification harness |

```sh
npm install
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server for the browser build at `http://127.0.0.1:1420` |
| `npm run desktop` | `tauri dev` — the debug app with HMR; Rust changes rebuild and relaunch |
| `npm run build` | Builds the library runtime, type-checks, then `vite build` → `dist/` |
| `npm test` | `tsx --test tests/*.test.ts` (node:test; 169 suites at v0.1.5) |
| `npm run desktop:build` | `tauri build --bundles app` → `src-tauri/target/release/bundle/macos/Aphrodite.app` |
| `./script/build_and_run.sh [--verify]` | Release build, quits the running instance, relaunches; Codex's Run button uses it |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Type-check the Rust crate |

## Layout

```
src/main.ts            render loop, action dispatcher (data-action → case), Space wiring, modes, agent gate
src/editor/            dock.ts · command-palette.ts · space.ts (camera/frames math) · pointer-editor.ts · dev-panel.ts
src/agent/             delegation.ts · proposals.ts · bridge.ts (channel parser) · run.ts (receipts)
src/design/            studio.ts (brand kit) · catalog-view.ts · menu-select.ts · icon.ts
src/workspace/         home.ts · library.ts · vault.ts · onboarding.ts
src/vendor/            coverage.ts (single source of truth for adapters) · runtime.tsx · mui/ astryx/ seed/ shadcn/
src/model.ts           Project/Page/Block types, parseProject validation, initialProject
src/export.ts          exportBundle: DESIGN.md · PROMPT.md · tokens.json · SCENE.json · HTML · assets/uploads
src-tauri/src/         main.rs · workspace.rs (disk library) · vault.rs · reference.rs (Vision OCR) · agent.rs (loopback bridge)
site/                  landing page; script.js pins the download VERSION
tests/                 one file per module; fixtures build projects with initialProject()
docs/                  contracts, release notes, roadmap checkpoints, validation evidence
```

Conventions that the tests enforce: every lucide icon referenced by `icon('name')` must be exported from `src/icons.ts` and nothing else; editor chrome strings in `main.ts` go through `ui(en, ko)` or `control()`; projects are validated by `parseProject` on every load and save.

## Verifying changes

**Unit tests** cover the model, export, palette, Space math, delegation, proposals, onboarding, the agent-channel parser and the custom menus:

```sh
npx tsc --noEmit && npm test
```

**Headless UI verification** drives the browser build with Chrome DevTools Protocol. This is the fastest way to check a flow end to end without touching the desktop:

```sh
npm run build
npx vite preview --port 4173 --strictPort --host 127.0.0.1 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
  --user-data-dir=/tmp/aphrodite-chrome --no-first-run about:blank &
# then a small Node script: fetch http://127.0.0.1:9333/json, open the WebSocket, Runtime.evaluate / Input.dispatch*
```

`#app[data-*]` attributes (`mode`, `page`, `frame`, `camera`, `selected-kind`, `saved`, `onboarding`, `tour`…) are the assertions; `window.aphroditeAgent.run(kind, payload)` exercises the agent executor. Fresh state: `localStorage.clear()` and set `aphrodite-onboarding-v1` to skip the welcome sheet.

**Native checks** — screenshots with `screencapture -R`, clicks with `cliclick` — only when nobody is using the Mac: check `ioreg -c IOHIDSystem` idle time and the frontmost app before every step.

## Release

0. Write `docs/RELEASE-NOTES-<tag>.md` with **What's new before Download**. The update card summarises the notes, and the summariser that reads them is the one already installed — an older one, without whatever you just fixed. Put the news first and the oldest summariser still opens with news instead of a file name.
1. Bump the version in five places: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (the `aphrodite-mela` entry), `src-tauri/tauri.conf.json`, `site/script.js` (`VERSION`). The status bar reads it from `package.json` at build time; the landing pins its download buttons to a direct DMG URL and only upgrades from GitHub's *latest* pointer, never below the pin (GitHub's `/releases/latest` skips drafts, which once served an old build). Miss one and the app, the bundle and the download page disagree.
2. Write `docs/RELEASE-NOTES-v<version>.md` — CI reads this file into the GitHub release body **and** into `latest.json`, which is what the update card shows as "what changed", so it is not optional decoration. Both READMEs link to the releases page rather than a pinned file, so nothing else needs touching and add a checkpoint to `docs/BETA-ROADMAP.md`.
3. Commit, tag `v<version>`, push both. `.github/workflows/release.yml` builds Apple Silicon and Intel, signs with the Developer ID, notarizes and staples the app and the DMG, and attaches both DMGs to a **draft** release.
4. Publish: `gh release edit v<version> --draft=false --latest --title "Aphrodite v<version>" --notes-file docs/RELEASE-NOTES-v<version>.md`.
5. Verify from a quarantined download: `xattr -w com.apple.quarantine …`, `spctl -a -t open --context context:primary-signature -v`, `xcrun stapler validate`, mount and read `CFBundleShortVersionString`.

**A CI step that compiles the Rust crate needs the Vision sidecar first.** `src-tauri/build.rs` refuses to run without `bin/aphrodite-vision-<target>`, and `tauri-action` only builds it later as part of `beforeBuildCommand`. Any step placed before that — `cargo test`, `cargo clippy` — must run `node scripts/build-vision.mjs` with `TAURI_ENV_TARGET_TRIPLE` set to the matrix target, or it fails on a fresh runner with "resource path … doesn't exist". It will pass on your Mac, because a sidecar from an earlier build is sitting in your working tree; that is the whole reason the step exists.

The app updates itself. `tauri-plugin-updater` reads `latest.json` from the newest GitHub release; CI writes and signs that file (`includeUpdaterJson: true`) with `TAURI_SIGNING_PRIVATE_KEY`, a minisign key made by `tauri signer generate`. The public half lives in `tauri.conf.json`; the private half is a repository secret and a copy sits in `~/.aphrodite-updater/` on the owner's Mac. **Lose the private key and no shipped app can ever update itself again** — a new key means everyone reinstalls by hand. Releases must keep bundling `app` as well as `dmg`, because the updater downloads the `.app.tar.gz`, not the disk image. A version published before the updater existed cannot update itself: v0.1.5 users install v0.2.0 from the DMG once, and updates are automatic from there.

Signing secrets are stored once with `scripts/apple-signing-secrets.sh` (Developer ID `.p12` filtered to the one identity, team ID, notarization Apple ID + app-specific password); the workflow keeps signed and unsigned paths as separate steps because empty secrets are still defined env vars. The Vision helper is a Tauri sidecar (`bundle.externalBin`) so it gets the hardened runtime notarization requires. The DMG background lives in `src-tauri/dmg/` as a 1x + 2x TIFF.

## Working with agents on this repo

In `tauri dev` a saved JS module reloads the webview (nothing calls `import.meta.hot`, so Vite falls back to a full reload), and everything the agent channel keeps in memory goes with it: Agent mode's delegation and lock, the write lease, the connected banner's change count and any standing connect request. Connected mode itself survives — it is remembered on disk in `localStorage` (`aphrodite-connect-until`, 12 hours) and read back as the module loads. A release build has no HMR, so this is dev-only friction.

Workers run in git worktrees under `lab/wt-*` (git-ignored `lab/`), each with a `WORKER_BRIEF.md`, on `grok/*` branches; their diffs are reviewed rule by rule before merging. The orchestrator owns `src/main.ts` and `src/style.css`; workers get module-scoped briefs with tests. Anything a computer-use agent can rely on in the UI is written down in [COMPUTER-USE.md](COMPUTER-USE.md) and changes there are part of the feature, not an afterthought.
