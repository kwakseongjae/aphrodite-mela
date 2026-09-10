# Page / scroll experience — deferred validation contract

Decision 2026-09-09: owner considers B2 result passing and requests later validation of the entire page, not just the first fold. Do not implement motion or generate additional images in this chunk. Passing this landing does not approve arbitrary unseen sections or certify an OmD system.

## Workflow to validate later

1. Classify reference coverage: first fold, partial page, full vertical page, or interaction sequence. Store viewport, capture extent, source/hash, locale and observation position. Image height alone cannot prove full-page coverage.
2. For an incomplete reference, identify the question explicitly: what continues below, and what purpose does it serve? Offer a short section outline before expensive code or image generation.
3. Acquire a full-page overview plus per-section images for detail. For motion, acquire start/middle/end keyframes and a short recording or an explicit authored motion brief. A static screenshot cannot establish carousel behavior, scroll pinning, direction, duration or easing.
4. Build one continuous, vertically scrollable page with identifiable sections, as in a Figma frame. A section image is a visual reference, not a replacement for editable components. The Play/Preview experience scrolls the complete page; the canvas allows navigating to any section.
5. Define scroll/interaction intent independently of GSAP or another renderer: normal flow, sticky/pinned region, horizontal progression, carousel, reveal or scale. Record trigger, start/end state, direction, timing/progress domain, release condition, keyboard/touch behavior, mobile fallback and reduced-motion alternative. No JS string execution from imported references.
6. Export section order, evidence, unresolved questions and the authored interaction contract alongside component IDs/code. Unsupported effects remain proposed, not marked implemented.

## Astra/Codex question policy

- **Observed:** exact visible content/state; attach evidence reference. Do not infer unseen content as fact.
- **Proposed:** reversible continuation using existing DS and already-authorized brand/copy. Agent may draft an outline or low-cost layout on a separate draft, clearly labeled as its proposal: “Below this, I propose benefits → collection → closing CTA.”
- **Ask user:** contradicts approved direction, introduces pricing/legal/social-proof/brand facts, needs paid generation or changes interaction/navigation substantially. Ask one focused question with why it matters, not every spacing decision.
- **Unknown:** keep absent/unresolved when neither evidence nor permission supports a value. Missing content never becomes a fabricated observed section.
- Evaluate wrong guesses and unnecessary questions as separate friction categories. Do not optimize question count by silently inventing decisions.

## OmD compatibility profile (proposal, not adopted standard)

Reuse `PortableReferenceAst.contentHash`, source sections and claim paths. OmD Core v2 already includes motion/reduced-motion rules and reverse-DNS `extensions`; preserve these meanings. Proposed key: `studio.aphrodite.page-experience` with its own `schemaVersion: 1`. Use a sidecar while no genuine Core manifest exists. Aphrodite must not claim Bound/Proven status simply by emitting an extension.

Proposed sidecar fields:

- `sourceBindings`: source hash, claim path, surface and capture ID; exact original reference retained.
- `coverage`: observed extent (unknown/first-fold/partial/full/sequence), viewport, locale and capture positions.
- `sections`: stable instance ID, order/parent, component mapping, content purpose, localized content and media slots.
- `decisions`: observed/proposed/owner-confirmed/unresolved, rationale, source IDs and revision binding. Owner confirmation is not reference authority.
- `interactions`: source section/target, semantic intent, trigger/progress, keyframes, fallback and runtime support status. Values absent if not established.
- `validation`: viewport, scroll checkpoints, required assertions, actual capture IDs and pass/fail/not-run.

Unknown extensions must round-trip unchanged. Future incompatible versions fail closed for execution while original bytes remain available. Never insert fields into the current PortableReferenceAst and pretend upstream understands them. No automatic Core adoption or promotion.

## Future experiment matrix

| Scenario | Required evidence / pass condition |
| --- | --- |
| First-fold-only landing | Agent detects incomplete coverage; proposes or asks for continuation; does not claim unseen content observed |
| Full long landing | Entire page editable in one frame; section order and all above/mid/bottom captures match the approved outline |
| Pinned horizontal storytelling | Scroll start/mid/end/release, reverse scroll, resize and refresh verified; normal vertical mobile/reduced-motion fallback |
| Carousel and zoom/reveal | Static vs timed vs scroll-driven distinguished; controls/keyboard/touch and focus remain usable; no trapped scrolling |
| EN/KO expansion | Long headings/body, section height and keyframe text positions tested separately; no hidden/clipped content |
| Correction round | User changes middle section/order/motion; preserved decisions, Undo/Redo, save/restart and real export remain consistent |

Test desktop 1440×900 and mobile 375×812. Capture full-page overview plus readable checkpoint screenshots and actual playback video when available. Full-page stitched images do not prove sticky/motion behavior; staged keyframe images are not a recording. Record exact scroll positions and actions. Compare time-to-approved-whole-page and correction burden against direct implementation; include reference/image preparation, questions, failed proposals and restarts. Human burden scores require real participants.

## Ownership and next gate

Aphrodite: prototype sidecar, editor/Preview, agent questioning workflow and runtime adapter. OmD: decide reusable source/section/motion evidence contract, maintain canonical reference examples and collection guidance. The upstream issue must link implementation/fixture evidence as it becomes available; do not upload user/private assets or token logs by default.

Schedule after B3 capability/asset gaps, within B4 whole-page and correction experiments. Implementation begins with a reviewed static long-page specimen, then one horizontal/scale interaction; not all effects at once. Current capability report marks this work not implemented.
