# Aphrodite v0.2.8 — release notes

Approving a direction is the person's decision. An agent could make it anyway. This release closes that.

## What's fixed since v0.2.7

**No agent command can approve a direction**
- The MCP server tells every client that approving is the person's decision and no tool can do it. Three doors proved otherwise: `act` with `approve-export` or `approve-human-only`, `click` on Approve direction or on the export dialog's Approve now, and `aphrodite_use_interface` sending either click through `/agent/ui`. In Connected mode each of them approved. In Agent mode the export-side ones did, because the lock only knew the word `approve`.
- The gate now judges every agent command by what it would run, not only by its verb. A click is judged by the button it lands on, and a palette query by the entry it picks. Anything that approves is refused with 403 in every mode, before the lease moves. The refusal says why, in the same words the MCP server uses.
- The interface has its own last line. An approve action runs only from the person's own click, and not while an agent holds the screen. Agent mode now locks every approve variant. `approve-human-only` was never a button, only a door, and it no longer exists as an action.
- The person's own clicks approve exactly as before, from the review card and from Export.

## Checks
- `tests/approval-human-only.test.ts` covers the three doors in Connected mode (lease held and lease free) and in Agent mode. It also covers the person's click and the wiring in `main.ts`, and checks that ordinary agent commands still get through.
