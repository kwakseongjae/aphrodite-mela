# oh-my-design integration proposals for the operator

Status: local issue drafts, NOT submitted. Inspected 2026-09-09 in sibling oh-my-design repository. Existing list_references/get_design_md/search_by_vibe and PortableReferenceAst must be reused. Absence claims below apply to the inspected integration surface, not to every file in the project.

Post-B2 update: owner accepted baseline and authorized upstream proposals. New whole-page/scroll experience proposal in OMD-PAGE-EXPERIENCE.md. GitHub create rejected HTTP 403, so it remains unsubmitted. OmD Core already contains motion and reverse-DNS extension semantics; reuse these, with consumer sidecar only where necessary. Aphrodite CAPABILITIES.json now starts Proposal 2's consumer inventory, but full source-rule matching remains unassessed.

## Proposal 1 — Desktop-consumable exact-source reference bundle

Need: consume a selected reference offline with DESIGN.md, existing AST, content hash and field/surface evidence. Current Aphrodite bridge manually snapshots Karrot and Toss.

Owner: oh-my-design for reference contract; Aphrodite for client/cache.

Acceptance: source bytes and hashes agree; fields carry origin and product/marketing scope; unsupported/unknown fields are absent; versioned schema and migration examples; redistribution metadata; stale source remains readable but cannot claim current authority. First check whether the existing MCP AST response already covers the payload before inventing an endpoint.

Operator task: decide public vs private bundle distribution and schema stability policy; identify canonical API/resource for AST retrieval.

## Proposal 2 — Reference-to-runtime capability report

Need: show which requested DS rules and components a target renderer actually supports. Verified token presence is not runtime component support.

Owner: Aphrodite owns adapter matrix. oh-my-design may expose reference-side component/state requirements.

Acceptance: match source component identity/variants/states to renderer identity; unmapped rules explicitly reported; own fallback requires project decision; official component and inspiration labels cannot be conflated. Do not mark a full company DS complete when only primary/canvas/foreground are mapped.

Operator task: review whether claim/component identifiers in the current AST are stable enough for cross-tool matching.

## Proposal 3 — Asset/content availability contract

Need: Get Vibe content slots need photo/icon/font origin, permitted usage, alt text/locales and file availability independently of descriptive brand references.

Owner: OmD evidence for known official assets; Aphrodite generated/demo assets and project overrides.

Acceptance: no unknown font replaced and advertised as official; no reference screenshot used as an implemented page; generated material labeled; image hash and local path bounded; brand vs product imagery separated; unresolved rights block release, not all local preview.

Operator task: define asset redistribution policy and which official files can be bundled. Toss Product Sans availability/rights remain unverified in Aphrodite.

## Proposal 4 — Explicit candidate/adoption exchange

Need: generated project tokens must not become an OmD authoritative graph simply by import.

Owner: reuse existing Core v2 manifest/adoption review/receipt contracts; Aphrodite visual approval is separate.

Acceptance: exact source binding, owner-controlled adoption, stale revision rejection, original preserved, rejection leaves candidate unchanged. UI must distinguish 'reference applied', 'visual direction approved' and 'system adopted'.

Operator task: select the supported adoption integration profile; approve no automatic authority transition in beta.
## Additional local proposal from B2 reference trial (2026-09-09)

Observed through native Computer Use: a generic collection's one shared image field cannot faithfully represent three distinct product references. Aphrodite now supports positional per-item image slots, explicit empty slots and a left-description editorial variant. This is an Aphrodite-owned extension, not an official library implementation or new OmD contract version.

Propose OmD component/media contracts that distinguish shared fallback media, per-item media, source provenance and missing-slot counts; include language-specific authored demo copy separately from user-reviewed content. A future keyed item entity should keep media attached when card text rows are reordered. Current positional implementation warns about this limitation. Need owner review before treating it as a portable standard. This is a local draft only; no external issue has been submitted.
