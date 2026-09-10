# Quick start

Five minutes from a fresh download to an exported build contract. Everything here runs on your Mac; nothing is uploaded.

## 1 · Install

1. Download the DMG for your Mac from the [latest release](https://github.com/kwakseongjae/aphrodite-mela/releases/latest): `Aphrodite_<version>_aarch64.dmg` for Apple Silicon, `Aphrodite_<version>_x64.dmg` for Intel. macOS 13 or later.
2. Open the DMG and drag **Aphrodite** into **Applications**.
3. Launch from Launchpad or Spotlight. The app is signed with a Developer ID and notarized, so there is no Gatekeeper warning.

## 2 · First run

- **Language.** The welcome sheet follows your macOS language; switch between English and 한국어 at the top of it. The interface language and the *content* language of samples are separate (content language lives under the language menu → Content language…).
- **Sample or blank.** *Start with a sample project* opens a small lighting brand with a desktop frame and a mobile frame side by side. *Create a blank project* asks for a name and gives you one empty frame.
- **The tour.** The first time the editor opens, five cards point at the dock, the search field, a frame label, the inspector and the Agent switch. `Esc` skips it; ⌘K → *Show the editor tour again* replays it.

Where things live: projects and the per-project vault are under `~/Library/Application Support/studio.aphrodite.mela/`. Camera position, panel state and onboarding flags are per device.

## 3 · A first project in five minutes

| Step | Do | See |
|---|---|---|
| Reference | Press `R` → **Try a sample reference** → **Analyze reference** → **Compare 3 directions** → **Spread all three on the space** | Three proposal frames appear under your frame with dashed gold outlines |
| Decide | Click **Use this** on one proposal's label | The other two disappear; your frame takes that composition |
| Fill | Press `G`, submit the form, then **Apply draft** | Sample copy and images land in the frame; the status line says *Saved* |
| Edit | Click the hero, change the title in the inspector | The canvas updates as you type |
| Hand over | Press `3`, name the operator, pick a scope, **Start Agent mode** | Golden shield, banner, and the agent console with curl lines — see [AGENT-CHANNEL.md](AGENT-CHANNEL.md) |
| Take back | Click **End Agent mode** on the banner or press ⌘⇧A | Design mode again; the run is recorded |
| Handoff | Press `2` for Dev mode; copy markup or page HTML | Read-only inspect panel |
| Approve & export | Click **Approve direction**, then **Export** → **Download handoff .zip** | `PROMPT.md`, `DESIGN.md`, `tokens.json`, HTML with your images, project file |

## 4 · Shortcuts

| Keys | Action |
|---|---|
| `V` `H` `A` `F` `R` `G` `P` | Select · Hand · Add component · New frame · Reference · Get Vibe · Preview |
| `1` `2` `3` | Design · Dev · Agent mode |
| ⌘K or `/` | Search commands, components and frames |
| Space + drag · wheel · ⌘wheel | Pan · pan · zoom |
| ⇧1 · ⇧2 · ⌘0 | Fit all frames · fit the current frame · 100% |
| ⌘\ | Hide or show both side panels |
| ⌘Z · ⇧⌘Z | Undo · redo |
| ⌘⇧A | End Agent mode (the only key that works while an agent holds the screen) |

## 5 · Troubleshooting

- **The download page offered an older version.** Reload; the landing pins the current release and only upgrades from GitHub's *latest* pointer. All builds are on the [releases page](https://github.com/kwakseongjae/aphrodite-mela/releases).
- **"Aphrodite can't be opened."** Only unsigned test builds trigger this. Released DMGs are notarized; if you built from source, right-click → Open once.
- **Intel Mac.** Use the `_x64.dmg`. Apple Silicon Macs should not need Rosetta.
- **Nothing happens when I click during Agent mode.** That is the lock working. Press ⌘⇧A or click the banner button to take the screen back.
- **Reset onboarding.** ⌘K → *Show the welcome sheet again* / *Show the editor tour again*.
- **Where is my project file?** Home → card menu (⋯ or right-click) → **Files** shows the vault path; **Export** bundles a `project.aphrodite.json` you can re-import from Home → **Import project**.
