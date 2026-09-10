# Cross-DS component explorer — 2026-09-09

## Implemented

Library → **DS별 컴포넌트 비교 / Compare across design systems** opens a kind-first comparison dialog. Select a component kind and shared variation; cards show actual renderer output, provider identity, source/license description, project-token vs native-theme behavior, and an unambiguous Add provider/kind/variant accessible name. Preview content is inert so the agent selects the explicit Add action rather than accidentally exercising a sample control. Larger sections/cards are partial previews, not full-page acceptance evidence.

Button: own, MUI, Astryx, SEED, adapted shadcn. Input/cards: own and MUI. Other kinds: only currently supported adapters (often own). HIG remains guidance, not a fictitious library. This is not a full vendor catalog port. Shared variant names describe current adapter mappings, not identical upstream APIs.

Project DS selection is reachable from the comparison dialog using the existing DS selector. Explicit insertion chooses the requested provider/variant without replacing project DS or inheriting its default provider. Normal insertion still uses existing default-provider policy. Parent target, page limit and history paths are reused. Preview generation does not mutate the project; each inserted component receives a fresh ID.

## Native fix discovered during validation

Initial official previews were blank: native app CSP forbids inline executable scripts. Kept CSP unchanged. Runtime props now live in escaped data-props; native iframe hydration replaces the marked inline runtime with the local bundled assets/library-runtime.js. Exported standalone HTML retains inline runtime under its own existing CSP. No network runtime or allow-same-origin sandbox permission added.

## Verification and limits

- Final source checks: 75 TypeScript tests passed; desktop build 6107 completed. No build pending. Final compact layout is on disk; current user-controlled app was not restarted after this final build.
- Pure inventory, unsupported selection rejection, independent provider/variant, fresh identity, native script replacement and escaped real-renderer properties tested.
- Native latest runtime build relaunched; actual screenshot inspection confirmed MUI rendering and Astryx/SEED content after initial blank-frame failure. Button card accessible names expose all five implementations.
- Created separate **B2 · 빛공방 / Light Atelier copy** for QA, original untouched by agent. No visual approval performed.
- User/app state changed during native variation-selection attempt; full AX requery showed brand-kit screen. Stopped UI navigation/restarts to preserve user's live activity. **Native Add/Undo, variant switching and full DS-selection journey remain unverified.** Do not turn pure constructor tests into an end-to-end pass.
- Final compact three-column button layout / larger two-column non-button layout built afterward; final compact screenshot still pending. Running app need not match on-disk latest build until user can restart safely.

## Next

Native QA on separate page: select project DS → compare button outline across five providers → add exact MUI and shadcn choices → check theme/provider/variant → Undo/Redo → save/restart → real ZIP. Capture final comparison screen and result. Then add search/provider filters, same-kind replacement with explicit copy/layout preservation, state matrix and drag insertion. Do not expand vendor support or claim replacement/drag already exists.
