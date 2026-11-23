# Aphrodite brand

The originals are in `brand/`; `npm run brand` places them (see brand/README.md). The look of the app's own interface is separate and lives in docs/UI-SYSTEM.md. No trademark clearance is claimed.

## Symbol

A golden apple with an A cut out of it, drawn symmetrically (study version v1b: the leaf lifted clear of the apple, the dip at the bottom deep). 48-unit box; the drawing's box is 4.722 to 43.278 across and 2 to 46 down, so it sits centred in the favicon. One colour, gold #B48A32, or `currentColor` where the surrounding text colour should carry it.

- The A's counter, legs and crossbar are open and solid shapes, not outlines. Keep them open: never fill the counter, never outline the symbol.
- At 16 px use only the symbol, and use `symbol-16`: the same drawing moved (-1.5, 1) units so the counter, legs and crossbar each land on whole pixels. Moved back, the counter is 57% covered instead of fully open. tests/brand.test.ts reads favicon-16.png and fails if the counter closes.
- Do not recolour the apple. It is gold on paper, gold on ink, or one colour in a single-colour context.

## Wordmark

"Aphrodite" in Wanted Sans 800, capital A, tracking -0.035em, as outlines (no font file, no live text). Colour is the page ink: #1f1e19 on paper, paper-coloured on ink. In files loaded through an image tag the ink is written in; inline it is `currentColor`.

## Horizontal lockup

Measure in the cap height c (0.707 em of the wordmark).

- The apple body is 1.3 c tall and centred between the baseline and the cap line, so it overhangs by 0.15 c above and below.
- The gap from the apple's right edge to the ink of the A is 0.45 c.
- The leaf rises above this and is outside the rule.
- Size the lockup by its box height. Below the size where the wordmark stays readable, use the symbol alone.

## Colour and contrast

| Colour | Value | On paper #f7f5ef |
|---|---|---|
| Gold (logo) | #B48A32 | 2.91:1 |
| Gold for marks outside the logo | #a37a22 | 3.59:1 |
| Ink | #1f1e19 | 15.31:1 |
| Paper | #f7f5ef | |

2.91:1 is below the 3:1 that non-text marks need, and the logo is exempt as a logo, so the gold stays exactly #B48A32 there. Anything else that wants "the brand gold" on paper (a bullet, an outline, a chart mark) uses #a37a22. Gold on ink is 5.26:1.

## App icon

The picture is the one the app already has, the hand offering the golden apple. It is not the symbol and is not redrawn: it is fitted to the macOS grid.

- `brand/app-icon-1024.png`: 1024 canvas, 824 body, continuous-curvature corners (radius 185.4, built as a 60% smoothed corner), a shadow 10 down with 10 blur at 30%. This is what the .icns and the Tauri PNG sizes are cut from, and what macOS 15 and earlier draws as it is.
- `brand/app-icon/app-icon-square-1024.png`: full square, no corners and no shadow, for macOS 26 and later where the system applies the shape.
- `brand/app-icon/app-icon-1024-nocut.png`: a fit that cuts none of the picture (the body's 99.5%, a 2 px paper band at the edge).

The 824 body, the corner radius and the shadow are community values from the Big Sur templates. They are not confirmed by Apple documentation: Apple's HIG (App icons, read 2026-10-28) says to provide a 1024 square and let the system round it, and Apple's Design Resources have no macOS-only icon template at present. That is why both the gridded and the square versions are kept. In the new shape the lower-left corner cuts the picture 32 px (of 1024) more than the old one, around the wrist; the other three corners are paper only.

## Pictures in the Brand Kit

The Brand Kit screen (src/design/studio.ts) also shows pictures that are not the logo and are not touched by it: the paper-cut statue, the hand with the apple, the dove, and the apple on its orbit. They are brand pictures for the landing page, the Home screen and empty states, kept as they are. Sizes are in public/brand/cutouts and site/assets/brand.

## Small sizes

| Size | Use |
|---|---|
| 16 px | Symbol only, `symbol-16` (favicon-16.png) |
| 32 px | Symbol only, the favicon |
| 22 px | Symbol (apple-mark.png), the left panel head |
| 180 px | apple-touch-icon: symbol on a paper rounded square |
| 128 px and up | The app icon picture |

## Voice

Calm, precise, collaborative. "Review requested", not "perfectly finished". State exactly what changed, what is unknown, and whether a model was called. Never fake approval or progress.
