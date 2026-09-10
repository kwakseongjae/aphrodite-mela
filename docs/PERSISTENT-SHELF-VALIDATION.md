# Project-owned visual shelf — 2026-09-09

## Goal and implementation

Keep agent-selected kind/provider/variant choices available when switching projects or restarting, without treating preparation as a design change.

- Optional Project.shelf holds up to 12 unique validated choices. Legacy projects without it load unchanged. Project save/export naturally includes it; imported metadata rejects invalid kinds/providers/variants, unknown fields, duplicates and overflow.
- Pin/remove persist through the existing disk queue without adding a canvas history entry. Canvas Undo/Redo restores design snapshots while preserving the current shelf. Shelf changes do not change the design fingerprint or invalidate approval.
- Full shelf reports capacity instead of silently evicting choices. Duplicate pin does not add a second entry.
- Real blockHtml previews are inert, clipped/scaled, and excluded from AX; exact accessible Add/remove labels remain. Pointer events pass through preview to drag card. Official previews use existing CSP-safe native runtime hydration, with no CSP weakening.
- Shelf choices retain kind/provider/variant only. They use project tokens or native DS defaults at insertion; they are NOT snapshots of edited copy, media, per-button overrides or complete component instances.

## Verification

85 TypeScript tests pass; desktop build 60337 completed. Snapshot before changes matched previous 0a155d3240ee5ef52f7ad7574b8cd3aca4c107e4 (snapshot call returned null).

Native QA · Catalog shelf copy:
1. Started with three existing MUI policy buttons and no shelf.
2. Pinned shadcn/solid from catalog; exact preview rendered and disk save acknowledged.
3. Click Add: 3→4 nodes, inspector shadcn. Undo: 4→3 nodes, shelf remained 1/12.
4. Switched to QA · Catalog shelf: shelf 0/12; no leakage.
5. Quit via native menu, relaunch, open copy: shelf 1/12 and preview restored.
6. Drag from thumbnail area (96,525) to canvas (700,275): 4 nodes with shadcn inspector. Undo returns 3.
7. Native Save project produced artifacts/b2-bilingual/theme-handoff-export/persistent-shelf.aphrodite.json. Parsed file shelf exactly button/shadcn/solid. Compared fingerprint against previous roundtrip-imported.aphrodite.json: identical, three canvas nodes preserved.

Screenshot: artifacts/b2-bilingual/41-persistent-shelf-restarted.png. It shows the editor because this checkpoint verifies shelf UI, not a new design proposal. Original B2 projects untouched. No active build; current QA copy retains shelf and original three buttons.

## Boundaries and next

Native verification covers one official button and one saved shelf; all 12 simultaneous official previews, large Layout previews, disk failure UX and native full-capacity/removal/Redo interactions are not fully audited. Limits/duplicates/removal-through-history are unit-tested. No fresh native import of shelf-bearing file in this chunk, but parse roundtrip and actual Save verified.

Next: large single-component inspection from the shelf without losing insertion context, and preview performance with a full shelf. For Layout items a 94px crop is only an identification thumbnail, not enough to approve a layout. Offer full-size preview before insertion; keep provider/variant/theme-scope visible. Then broaden theme-state contrast and font/surface mapping. Do not claim full vendor layout libraries or token savings.
