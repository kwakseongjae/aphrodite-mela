# [Aphrodite integration] Whole-page / scroll experience evidence profile and reference fixtures

Target: https://github.com/kwakseongjae/oh-my-design

Status 2026-09-09: **SUBMITTED** — https://github.com/kwakseongjae/oh-my-design/issues/97 . Connector create failed with HTTP 403, but the already authenticated GitHub CLI account had repo scope and ADMIN repository permission. After checking for duplicates, created through gh without any new login or permission expansion. Issue registration is not upstream contract adoption. The connector's separate permission problem is not claimed fixed.

## Need and existing contracts

Owner accepted Aphrodite's first editable reference landing and requested whole-page and scroll-sequence validation. A first-fold image does not reveal the next section or establish carousel/pinning/zoom behavior.

Inspected OmD `packages/mcp/src/reference-ast.ts` (contentHash, section metadata, foundations) and `spec/design-md-core-v2.md` (motion/reduced-motion, provenance and reverse-DNS opaque extensions). Reuse these. This is not a claim that OmD lacks motion support, nor permission to promote visual approval into Core adoption.

## Proposal

Consumer profile `studio.aphrodite.page-experience`, own schema version, sidecar until there is a genuine Core manifest. Preserve source bytes/hash, claim paths, capture coverage/viewport/locale/scroll positions, ordered section/component identities, observed/proposed/owner-confirmed/unresolved decisions, semantic trigger/progress/keyframes, mobile/reduced-motion fallbacks, runtime support and validation evidence. No executable code from reference fields. Static screenshots do not prove motion. Unknown values stay absent and unknown extensions round-trip intact.

## Responsibilities

- Aphrodite: continuous page canvas/Preview, reference/section storyboard, agent questions and proposals, runtime adapters and measured correction workflow.
- OmD: assess reusable reference-evidence fields versus consumer extension; **retain and provide canonical reference examples** and capture/collection guidance. Owner controls upstream adoption/versioning.

## Acceptance / reference material to retain and provide

- [ ] Confirm existing AST/Core extension points; avoid parallel token authority or silently modified AST.
- [ ] Static long-page fixture: full overview + readable section images, exact source binding, viewport/locale and observed coverage boundary.
- [ ] One horizontal-pin or scale/reveal fixture: real video or explicitly authored motion brief, start/mid/end/release captures, observed/proposed labels.
- [ ] EN/KO, 1440px desktop/375px mobile, reduced-motion and keyboard/touch examples.
- [ ] Unrecognized extensions preserve original bytes/JSON; unsupported effects are never labeled implemented.
- [ ] Agent proposes reversible below-fold drafts but asks before contradicting accepted direction, inventing business facts or incurring paid calls.
- [ ] Actual scroll/reverse/resize/reload and exported runtime checks; stitched screenshots are not interaction-video evidence.
- [ ] Measure wrong guesses, unnecessary questions, revisions and discarded work; real participant burden scores only.

## Implementation evidence / next follow-up

Aphrodite B2 already exercised five independent sections, three revisions, native ZIP and EN/KO desktop/mobile validation. It does not prove generic reconstruction or cost savings. Aphrodite now exports a consumer capability report explicitly marking scroll timelines not implemented; the proposed profile itself is only planned. Detailed local plan: `docs/SCROLL-EXPERIENCE-VALIDATION.md`.

After implementation, add public-safe fixture and code links to the upstream issue; no automatic upload of user/private media, screenshots or usage logs. Current request deliberately defers scroll-effect implementation.
