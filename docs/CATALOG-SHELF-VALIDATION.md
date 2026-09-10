# Catalog assembly shelf — 2026-09-09

## Implementation

- Large cross-DS catalog now has All / Layout / Navigation / Input / Content & data categories (EN/KO). Kind selector is filtered to actual implemented kinds. Layout currently has Aphrodite-owned adapters, not invented vendor layouts.
- Pin an exact kind/provider/variant to a nonmodal sidebar shelf. Shelf holds up to 12 unique choices for the current app session; it is not yet persisted across restart or scoped per project. Source choices are reusable across projects without changing their project DS.
- Shelf Add and remove buttons have exact accessible names. Add follows existing insertion target, history, nesting constraints and 100-node limit. Pin/remove do not modify design approval.
- Pointer capture transports shelf choices to the canvas, with 6px threshold, cancellation and outside-canvas rejection. Native HTML MIME payload validation also exists for future senders; active shelf uses pointer events after native HTML drag was unreliable during QA.
- Malformed and unsupported provider/variant payloads reject. No external payload can provide parent IDs or arbitrary block fields.
- Found shadcn outline inheriting light button text during native review. Added provider-only resting text/background/border ownership; other providers unaffected. Hover/focus/disabled matrix still needs audit.

## Evidence

- 78 TypeScript tests passing before final pointer transport build; tsc and release compilation required after it.
- Separate native project `QA · Catalog shelf`, original B2 untouched.
- Native Layout filter selects frame/default with one actual own implementation; Input returns five button implementations.
- Native shadcn outline pin → Add → inspector provider shadcn / variation outline → Undo returns zero nodes verified.
- Screenshot `artifacts/b2-bilingual/33-catalog-shelf.png` shows session shelf, before final contrast patch.
- Initial HTML drag attempts were inconclusive; do not count them as successful pointer insertion.

## Final native checkpoint

Release build 16410 completed; relaunched through native Quit menu (keyboard-only quit had not reliably restarted the app). Final native pointer drag from shelf (100,454) to page (600,274) inserted exactly one shadcn button with outline inspector value. Screenshot `artifacts/b2-bilingual/34-pointer-shelf-inserted.png` confirms readable dark label and border. Undo returned zero components. Drag to (600,480), outside actual blank page, showed “페이지 캔버스 안에 놓아주세요” without insertion. Original B2 untouched. Final app remains in separate QA project with zero nodes and shelf choice intact. No build remains running.

## Next verification

Provider/variant persistence/export, frame nesting, pointercancel/Escape and viewport/zoom matrix remain. Next feature: per-component source/project/override theme policy and larger single-component inspection. Session shelf persistence and thumbnail previews are not yet implemented.
