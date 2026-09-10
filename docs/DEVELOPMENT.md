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

1. Bump the version in four places: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (the `aphrodite-mela` entry), `src-tauri/tauri.conf.json`. The status bar reads it from `package.json` at build time.
2. Write `docs/RELEASE-NOTES-v<version>.md` and add a checkpoint to `docs/BETA-ROADMAP.md`.
3. Set `VERSION` in `site/script.js` to the new version — the landing pins its download buttons to a direct DMG URL and only upgrades from GitHub's *latest* pointer, never below the pin (GitHub's `/releases/latest` skips drafts, which once served an old build).
4. Commit, tag `v<version>`, push both. `.github/workflows/release.yml` builds Apple Silicon and Intel, signs with the Developer ID, notarizes and staples the app and the DMG, and attaches both DMGs to a **draft** release.
5. Publish: `gh release edit v<version> --draft=false --latest --title "Aphrodite v<version>" --notes-file docs/RELEASE-NOTES-v<version>.md`.
6. Verify from a quarantined download: `xattr -w com.apple.quarantine …`, `spctl -a -t open --context context:primary-signature -v`, `xcrun stapler validate`, mount and read `CFBundleShortVersionString`.

Signing secrets are stored once with `scripts/apple-signing-secrets.sh` (Developer ID `.p12` filtered to the one identity, team ID, notarization Apple ID + app-specific password); the workflow keeps signed and unsigned paths as separate steps because empty secrets are still defined env vars. The Vision helper is a Tauri sidecar (`bundle.externalBin`) so it gets the hardened runtime notarization requires. The DMG background lives in `src-tauri/dmg/` as a 1x + 2x TIFF.

## Working with agents on this repo

Workers run in git worktrees under `lab/wt-*` (git-ignored `lab/`), each with a `WORKER_BRIEF.md`, on `grok/*` branches; their diffs are reviewed rule by rule before merging. The orchestrator owns `src/main.ts` and `src/style.css`; workers get module-scoped briefs with tests. Anything a computer-use agent can rely on in the UI is written down in [COMPUTER-USE.md](COMPUTER-USE.md) and changes there are part of the feature, not an afterthought.
