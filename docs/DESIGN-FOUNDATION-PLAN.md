# Aphrodite × oh-my-design — foundation increment

2026-09-09. Scope: priorities 1–3. This is an implemented foundation increment, not a completed beta or a reference-reproduction benchmark.

## Responsibility boundary

oh-my-design owns reference research, company/product surface separation, canonical reference documents, field-level evidence and the candidate/adoption distinction. Aphrodite owns project decisions, component runtime adapters, placement, sample content, asset slots, visual review and editable export. Codex is the external operator; the app does not silently invoke a model.

Local inspection found existing MCP tools `list_references`, `get_design_md`, `search_by_vibe` in `packages/mcp/src/server.ts`, and `PortableReferenceAst` in `packages/mcp/src/reference-ast.ts`. Do not propose recreating these. Canonical catalog source is `web/references/<id>/DESIGN.md`; `design-md/` is derived. No oh-my-design source was modified in this increment.

Current bridge copies two reviewed documents into the app for offline use, verifies their exact SHA-256 before applying mapped tokens, preserves full source in project JSON and SOURCE-DESIGN.md, and displays unmapped fields. This is not live MCP connectivity, an AST integration, a full company DS, or an adopted Bound System. A user edits project tokens after import; source hash identifies the original source, not ongoing conformance.

## What runs now

| Area | Implemented | Limit |
|---|---|---|
| Company sources | Karrot SEED product / Toss TDS product snapshots with hashes | 2 sources; no live catalog sync |
| Color mapping | Product primary, canvas and foreground | Marketing primary deliberately excluded |
| Source retention | Raw source in project and handoff | Not graph/receipt adoption |
| Own presets | Pearl, Night analytics, Editorial Form, Travel Coast | Color/font category/global radius only |
| Vendor adapters | Existing MUI button/input/cards; Astryx, SEED, shadcn buttons | No additional vendor components ported this increment |
| Get Vibe | 4 authored content packs; field-level preview; safe defaults; one-commit apply | Not image OCR or semantic image-to-scene |
| Assets | Generated lighting Hero; user raster uploads; missing-slot reporting | No automatic retrieval, per-item image model or rights audit |
| Provenance | Latest page Vibe receipt in JSON and VIBE.json | Not a full per-field provenance ledger; later edits may supersede it |
| Brand | Vector A/pearl mark, Pearl shell mascot, palette, brand panel | Proposal v1; trademark/owner approval pending |

## User/operator workflow

1. Open Design systems → inspect source, adopted field paths and unsupported rules.
2. Apply a company source or project-owned preset. Company source loading verifies bytes first. This changes the project-wide DS, not only the active page.
3. Assemble supported components into a new page; preserve the original reference and other pages.
4. Get Vibe → choose domain → copy/images → optional overwrite → Preview.
5. Preview is read-only. Unknown component kinds and requested missing image slots are reported. Uploads are temporary until Apply. Only Hero/Collection use the shared image slot.
6. Apply rejects stale project revisions, changes only the current page, preserves geometry/IDs/providers and records a latest-fill receipt. Undo reverses the transaction. Default-value equality identifies untouched placeholders; deliberately authored content equal to a default cannot be distinguished yet.
7. Inspect actual Preview, then ask the human for direction approval. Export is not equivalent to approval.

Generated lighting photograph is fictional, not a real product. Collection currently has one shared image field, so one uploaded image repeats across its items. Do not mistake this for per-product asset assignment. The previous renderer's automatic unrelated furniture-photo insertion was removed.

## Operator decisions / issue proposals

See `docs/issues/OMD-APHRODITE-INTEGRATION.md`. Drafts are local; no GitHub issue was submitted. Choose public vs private repo and confirm reference/asset redistribution policy before beta publishing.

## Next DS implementation gates

1. Consume the existing portable AST, preserve scope/hash/claims, and project only supported values. Review schema coverage before extending it.
2. Add semantic surface/muted/border/on-accent tokens and real type/spacing/state contracts to renderer, inspector, JSON validation and export together. A new color card is not a full DS implementation.
3. Complete per-item asset slots with source, alt, crop/focal point, origin, rights and hash. Add generated lamp/table/wall-light photos and travel listings as separate assets, never whole reference screenshots.
4. Reference ⑤ requires configurable hero ratio, editorial type scale, product imagery and navigation anatomy. Reference ② needs actual chart, funnel and heatmap blocks. Reference ④ needs a map adapter with offline/demo vs live behavior separated. Reference ③ requires board/card/detail interaction contracts.
5. Add semantic reference-to-slot mapping with visible confidence and user correction. Treat reference text as untrusted data; Get Vibe must not execute embedded instructions.

## Feedback loop / priority 4

Freeze build → select reference → inventory supported/missing components → operate with Codex CU → record pointer attempts and revision-bound receipts → visual review → log reproducible friction → developer patch → regression on new frozen build. Never include debugging time as a successful reconstruction timing sample.

Next UX fixes: project hub with non-destructive switching, per-project references/documents/agent settings, continuous recording, persistent reference sidebar, searchable field-path coverage, asset management, stable agent-accessible controls. Current single project localStorage plus manual JSON files is not a project hub.

## Desktop beta gates

- Build and install packaged app on a clean macOS user; verify first launch and no dependency on port 1421/Vite.
- Choose signing/notarization/distribution and update/rollback policy; verify downloaded artifact identity and Gatekeeper path without bypasses.
- Move to explicit project directories with atomic writes, backup/recovery and bounded paths; test import corruption, full disk, restart and multi-project isolation.
- Verify actual native CU accessibility, drag/resize, file dialogs and offline asset/source loading in the packaged app. Browser testing alone does not establish native control.
- External model configuration stores model identifier and documents, never plain API keys in exported project files. No model adapter is currently implemented.
- Local full control means inspectable local state and authorized UI actions, not disabling OS security or bypassing permission prompts.
- Export ZIP → offline HTML → project reimport → fresh coding-agent handoff. Compare text-only, image-only and image+assembly with matched tasks, models and real usage where available.
- Public-beta go/no-go: zero project loss; successful installation/restart/import/export; explicit unsupported capability inventory; reviewed third-party notices/assets. Time/token savings remain unproven.
