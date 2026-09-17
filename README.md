<h1 align="center">Aphrodite: shape before you build</h1>

<p align="center">
  <img src="docs/assets/readme/hero.png" alt="Aphrodite hero banner — the headline “Shape before you build.” beside a newspaper-collage muse in sunglasses and a golden apple" width="100%">
</p>

<p align="center">
  <a href="https://kwakseongjae.github.io/aphrodite-mela/"><b>Website</b></a> ·
  <a href="https://github.com/kwakseongjae/aphrodite-mela/releases/latest"><b>Download for macOS</b></a> ·
  <a href="docs/QUICKSTART.md">Quick start</a> ·
  <a href="mcp/aphrodite-mcp/README.md">MCP server</a> ·
  <a href="docs/AGENT-CHANNEL.md">Agent channel</a> ·
  <a href="https://github.com/kwakseongjae/aphrodite-mela/releases">Release notes</a>
</p>

<p align="center">
  <a href="https://github.com/kwakseongjae/aphrodite-mela/releases"><img alt="release" src="https://img.shields.io/github/v/release/kwakseongjae/aphrodite-mela?style=flat&color=8f6a1c&label=release"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-3a4531?style=flat"></a>
  <img alt="platform" src="https://img.shields.io/badge/macOS-13%2B%20·%20Apple%20Silicon%20%26%20Intel-292820?style=flat">
  <img alt="notarized" src="https://img.shields.io/badge/Developer%20ID-signed%20%2B%20notarized-d7b449?style=flat">
  <img alt="offline" src="https://img.shields.io/badge/no%20account%20·%20no%20cloud-5a604f?style=flat">
</p>

<p align="center"><b>English</b> · <a href="docs/i18n/README.ko.md">한국어</a></p>

---

A coding agent can ship a page in half an hour. It can also ship the **wrong** page in half an hour, and you find out at the end.

Aphrodite is the step before that: a native macOS workbench where you settle the **direction** of a screen in something real enough to judge — real components, real design tokens, on one open canvas — and then hand a build contract to whoever, or whatever, writes the code.

> **Nothing about your work leaves your Mac.** No account, no cloud, no generation credits, and no plans for any of them. Aphrodite opens a network connection in exactly three places, all of them listed [below](#what-leaves-this-mac) — none carries your projects, your images or your text.

<sub>If you arrived looking for a free, local alternative to Figma for this particular step, that is a fair description of the overlap. Aphrodite is deliberately much narrower: one screen, one direction, one contract.</sub>

---

<table>
<tr>
<td valign="top">
<img src="site/assets/shots/space-en.webp" alt="The Space: a desktop landing page, a mobile page and a variant as frames on one open canvas, with the floating dock and the inspector"><br>
<sub><b>The Space</b> — pages are frames on one open canvas: desktop, tablet, mobile, custom. Spread three directions side by side and pick one. Every step is undoable and receipted.</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="33%" valign="top">
<img src="site/assets/shots/home-en.webp" alt="Home: project cards with live previews, filters and search"><br>
<sub><b>Home</b> — every project as a card with a live preview, in workspaces you can move things between.</sub>
</td>
<td width="33%" valign="top">
<img src="site/assets/shots/agent-en.webp" alt="Agent mode: a banner names the operator; the inspector shows scope, locked actions and a receipt timeline"><br>
<sub><b>Agent mode</b> — the agent takes the screen through a receipted channel. Scope is yours, approval is yours, ⌘⇧A gives it back.</sub>
</td>
<td width="33%" valign="top">
<img src="site/assets/shots/dev-en.webp" alt="Dev mode: read-only inspect panel with component identity, tokens as CSS, rendered markup and copy buttons"><br>
<sub><b>Dev mode</b> — a read-only handoff: component identity, tokens as CSS, rendered markup, and a prompt for a coding agent.</sub>
</td>
</tr>
</table>

<p align="center"><a href="https://kwakseongjae.github.io/aphrodite-mela/"><b>See how it works, step by step →</b></a></p>

---

## What it remembers for you

Two files, both yours to read and edit in any text editor, both off by default.

**The archive** keeps what you looked at — a picture, an address, a line about why it worked — beside the project or shared across all of them, addressed by content the way the image library is. Promote one and it becomes the reference the analysis runs on.

**`taste.md`** is what you keep choosing, written down where you can cross it out. Every line carries a count and the ids it came from: not *"you like serif"* but *"serif headings — 6 of 7 projects (p1, p4, …)"*. A machine that says the first is telling you who you are; one that says the second is showing its work, and you can disagree with it. Delete a line and it does not come back. Consent starts **off**, and off means nothing is derived, not merely nothing shown.

---

## Quick start

**Download** the DMG for your Mac from the [latest release](https://github.com/kwakseongjae/aphrodite-mela/releases/latest) — Apple Silicon (`_aarch64.dmg`) or Intel (`_x64.dmg`). Signed with a Developer ID and notarized; macOS 13 or later, and both are built and tested on every release.

First run offers English or Korean, a sample project or a blank one, and a short tour. Updates install themselves from a card in the corner that names the version and what changed — dismissable per version, or switched off entirely.

<details>
<summary><b>Run from source</b></summary>

```sh
git clone https://github.com/kwakseongjae/aphrodite-mela.git
cd aphrodite-mela
npm install
npm run desktop           # Tauri dev app with HMR
```

Node 22.12+, the Rust/Tauri toolchain, and the macOS Swift compiler (for the on-device OCR sidecar). Tests, the headless verification harness, signing and the release process are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
</details>

A five-minute first project — reference → three directions → pick → edit → approve → export — is walked through in [docs/QUICKSTART.md](docs/QUICKSTART.md).

---

## Your agent drives it

Aphrodite ships no model. The agent already on your machine drives it, through an **MCP server** in this repository:

```sh
claude mcp add --transport stdio aphrodite -- node /path/to/aphrodite-mela/mcp/aphrodite-mcp/index.mjs
codex  mcp add aphrodite              -- node /path/to/aphrodite-mela/mcp/aphrodite-mcp/index.mjs
```

Reading works whenever the app is open. **Writing needs a person to open the door** — an agent can ask, and only a human click answers. Approving a direction is refused over every transport by design, because one pure function decides that for all of them: `curl` meets the same answer as a client that thinks it has approved.

Every tool, every slash command, and what the server will not do: [mcp/aphrodite-mcp/README.md](mcp/aphrodite-mcp/README.md). For anything with only a shell there is a loopback channel — [docs/AGENT-CHANNEL.md](docs/AGENT-CHANNEL.md) — and the UI contract an agent can rely on is in [docs/COMPUTER-USE.md](docs/COMPUTER-USE.md).

**What you hand over:** `PROMPT.md`, `DESIGN.md`, `tokens.json`, `SCENE.json`, the rendered HTML with your uploaded images, and the project file. A contract, not a screenshot.

---

## What leaves this Mac

Three connections, and this is all of them:

| When | Where | Why |
|---|---|---|
| The version check | `github.com` | Runs on its own at most every six hours. Can be switched off. |
| **Install** in the typeface picker | `github.com` | The font file you asked for. Enforced at the Rust boundary, not by convention. |
| **Look it up** on a saved reference | the address you typed | Reads that one page for its title and picture. |

The first happens by itself; the other two only because you pressed something. None of them carries anything about you or your work. Your projects, images and text stay on this Mac — and there is no switch anywhere that would change that.

---

## Documentation

| Doc | What it is for |
|---|---|
| [QUICKSTART.md](docs/QUICKSTART.md) | Install, first run, a five-minute first project, shortcuts, troubleshooting |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Toolchain, scripts, tests, headless verification, signing, the release process |
| [COMPUTER-USE.md](docs/COMPUTER-USE.md) | The contract for agents driving the UI: actions, state, palette, delegation rules |
| [AGENT-CHANNEL.md](docs/AGENT-CHANNEL.md) | The loopback channel and `window.aphroditeAgent` |
| [aphrodite-mcp/README.md](mcp/aphrodite-mcp/README.md) | The MCP server: connecting it, the tools, and what it will not do |
| [BETA-ROADMAP.md](docs/BETA-ROADMAP.md) | The execution order, and a checkpoint for every signed build so far |
| [APHRODITE-BRAND.md](docs/APHRODITE-BRAND.md) | Paper Muse — the studio's own identity, also in-app as the Brand Kit |

Aphrodite is an early beta, built in the open by one person with a fleet of agents. Contributions are not being taken yet — the shape is still moving too fast — but issues and questions are welcome.

---

## License, credits & lineage

MIT — see [LICENSE](LICENSE).

The muse is a newspaper-collage treatment of SMK's open plaster cast of the Venus de Milo; the sculpture edition and photography sources, the oh-my-design token observations, and the OpenDesign workflow reference are credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). [OpenDesign](https://github.com/nexu-io/open-design) shaped the *agent-native, local-first* framing; Aphrodite takes the opposite bet on scope — decide one screen well, then hand it off.

<p align="center"><sub>Made with intention. A little instinct, too.</sub></p>
