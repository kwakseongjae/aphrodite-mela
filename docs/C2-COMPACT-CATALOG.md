# C2 — Compact controls, search & brand-aware MUI

## Completed

- Removed the large-layout exhibition treatment from button cards. Compact header, 68px real-control viewport (including the largest SEED control and renderer padding), slim metadata/actions, three columns on wide screens. Layouts retain the larger preview. Input singleton no longer expands into a full-width miniature layout.
- Final measured button cards: 219px tall at1280×800; all five actual implementations fit in two rows. Initial205px trial was increased to avoid clipping large vendor controls. No invented density percentage against an unmeasured old build.
- Search accepts English/Korean terms, e.g. `입력`, plus provider/category intersection. Search/Enter applies; category/type/variant transitions also preserve the draft form. Empty results provide recovery; Reset clears filters. Full preview captures filter draft before leaving the catalog.
- MUI inputs/cards receive project paper/ink and body typography; card headings receive project heading font. Input title is the actual accessible field label and action-label slot is its placeholder. Card section heading lives outside the vendor iframe, avoiding duplicate demo headings. Existing button theme policies remain unchanged.
- Explicit non-button heights allocate space across the complete section; iframe flexes into remaining space. Resizing retains project padding rather than shifting the content's left edge.

## Actual validation

Native final build73671 completed/relaunched. Independent `C2 · Compact catalog QA` created with an empty Home; originals B2/B3/C1 were not edited. Native search `입력` + MUI → add actual input → edit copy → search `카드` → full inspect → add actual cards → set600px → save ZIP → set300px → save ZIP. Restart restored the two nodes; no design approval.

Final actual native ZIPs:

- `artifacts/b2-bilingual/theme-handoff-export/c2-final-600.zip`
- `artifacts/b2-bilingual/theme-handoff-export/c2-final-300.zip`

Extracted to `artifacts/c2-compact/final-600` and `final-300`. `npx tsx scripts/verify-c2-exports.ts` verifies two actual MUI nodes, SCENE identity agreement, and deep equality of all project fields except the requested600→300 card height. Earlier `height-600/300` exports are pre-alignment-fix evidence, not the final result.

In-app browser1280: final iframe heights427.414px vs127.414px, exact300px delta. Input remains112px. Actual input accepted `demo@studio.com` locally; there is no submission service. Card title computed Georgia/Times serif, ink rgb(41,45,39), card surface rgb(250,248,243). Mobile375 switches card grid to one327px column with no document horizontal overflow. Fixed300px card content scrolls internally; last card reached by focusing iframe content then End. This is not natural auto-height yet.

Browser search `입력`+MUI returned only `mui input outlined`. Unsubmitted query/provider survived category change. Invalid search produced no preview calls; Reset restored five button implementations. EN browser controls and KO native controls checked.

94 tests passed; build/type check passed. Independent static critic identified and rechecked resize allocation, large-button clipping, and draft-loss fixes; minor full-preview draft roundtrip was also corrected. Native AX clicks sometimes only committed an active field; explicit Tab before the next action worked, and a visible-coordinate click completed insertion. This tool/blur interaction remains a useful next agent-UX check, not a claimed speed gain.

## Screenshots

- `artifacts/c2-compact/01-native-compact.png`: actual KO desktop, five DS buttons.
- `artifacts/c2-compact/04-browser-compact.png`: final1280px catalog density.
- `artifacts/c2-compact/02-export-brand.png`: actual final input/card export, aligned project padding.
- `artifacts/c2-compact/03-mobile-inner-scroll.png`: last card reachable inside explicit-height mobile frame.

No generated mockups or continuous video in this chunk. Native left on C2 button catalog. Browser viewport reset; app1421 and final export1447/final-300/index.html are review surfaces. Main JS bundle remains ~1.62MB uncompressed; startup performance has not been improved or benchmarked here.

## Next goal

1. Content-driven auto-height for official blocks, with explicit fixed-height/scroll modes and safe iframe resize messaging. Remove unnecessary nested scrolling without weakening sandbox/CSP.
2. Separate a compact reusable control from a full content section in the layout model; the present page-owned copy wrapper still uses section spacing.
3. Extend actual supported layout inventory and repeat reference assembly. Do not fabricate full corporate DS coverage or unmeasured token/time/human-burden gains.

Used shadow-git-sandbox for safety snapshots/critic workflow and vercel-react-best-practices for React adapter direct-import discipline. Browser-harness was inspected but not used because the user explicitly requires in-app browser/native Computer Use, not Chrome.
