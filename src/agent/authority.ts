/**
 * Who may write, and who is holding the screen.
 *
 * Every command — over the loopback HTTP bridge or through `window.aphroditeAgent` — passes this
 * judgement before it runs, so a client's own approval UI can never be the thing that gates a write:
 * the same request made with `curl` meets the same answer. Reading is always allowed; writing needs
 * the person to have opened the door (Connected mode) or handed the screen over entirely (Agent mode).
 */
export type Mode =
  | 'design'      // nobody has been given the screen
  | 'connected'   // the person keeps working; an agent may edit alongside them
  | 'delegated';  // Agent mode: the agent holds the screen and people are locked out
export type Holder = {label: string; since: number};
export type Authority = {mode: Mode; holder: Holder | null; now: number};
export type Verdict = {allow: true; hold: Holder | null} | {allow: false; status: 403 | 409 | 423; error: string};

export const readKinds = ['state', 'contract', 'tokens', 'components', 'images', 'render', 'references', 'taste'] as const;
/**
 * Commands that neither read the design nor change it: they ask the person something. Asking is
 * always allowed — an agent that cannot even say "may I?" would be worse than one that can — but the
 * app rate-limits the asking so a prompt can never become a nag, and the answer is always a click.
 */
export const askKinds = ['guide', 'connect'] as const;
export const writeKinds = ['apply', 'system', 'export', 'edit', 'act', 'click', 'type', 'key', 'command', 'library', 'ui', 'keep', 'unkeep'] as const;

/** The person's own hold expires quickly — one keystroke should not lock an agent out for a minute. */
export const HUMAN_IDLE_MS = 5_000;
/** An agent's hold expires slowly, but it does expire: a dead agent must not keep the screen forever. */
export const LEASE_IDLE_MS = 90_000;
export const HUMAN = 'human';

export function isRead(kind: string): boolean {
  return (readKinds as readonly string[]).includes(kind);
}

/**
 * Actions only the person may run. Approving a direction is their decision — the MCP server tells every
 * client that no tool can do it — and this is where the promise is kept, whatever door a command came
 * through. The list names the variants that exist; the prefix catches the next one (an "approve-and-…"
 * shortcut) before anyone remembers to add it here.
 */
export const humanOnlyActions = ['approve', 'approve-human-only', 'approve-export'] as const;
/** The gate's name for "this command would approve". It is not a command kind, so it can never be allowed. */
export const HUMAN_ONLY_KIND = 'approve';
export const HUMAN_ONLY_ERROR =
  "approving a direction is the person's decision, and no agent command can make it. Tell them the composition is ready and let them press Approve direction themselves.";

export function isHumanOnlyAction(action: unknown): boolean {
  if (typeof action !== 'string') return false;
  const a = action.trim().toLowerCase();
  return (humanOnlyActions as readonly string[]).includes(a) || a.startsWith('approve');
}

/**
 * The interface's own last line, for anything that reaches a button without passing the gate: a
 * human-only action runs only from the person's own input (a trusted event — programmatic clicks,
 * `el.click()` and buttons built in code are not), and not while an agent holds the screen.
 */
export function humanOnlyBlocked(action: string | undefined, origin: {trusted: boolean; agentHoldsScreen: boolean}): boolean {
  if (!isHumanOnlyAction(action)) return false;
  return !origin.trusted || origin.agentHoldsScreen;
}

/**
 * Some commands carry their own verb: `library` lists, imports or deletes. Listing is a read and must
 * not need the door opened, so the gate is asked about the narrower thing the command actually does.
 * `reaches` is the data-action the command would end up running (see `reachedAction` in bridge.ts): a
 * click is judged by the button it lands on and a palette query by the entry it picks, so approving
 * cannot be smuggled in as a click, a command or an `act`.
 */
export function gateFor(command: {kind: string; action?: string}, reaches?: string): string {
  if (isHumanOnlyAction(reaches) || (command.kind === 'act' && isHumanOnlyAction(command.action))) return HUMAN_ONLY_KIND;
  if (command.kind === 'library') return command.action === 'list' ? 'images' : 'library';
  return command.kind;
}
export function isWrite(kind: string): boolean {
  return (writeKinds as readonly string[]).includes(kind);
}
export function isAsk(kind: string): boolean {
  return (askKinds as readonly string[]).includes(kind);
}

/**
 * A caller's name for the receipts. Agents choose their own label, so it is cleaned up and may never
 * be `human` — an agent must not be able to pass its edits off as the person's.
 */
export function normalizeCaller(raw: string | undefined): string {
  const cleaned = (raw ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 32);
  return !cleaned || cleaned === HUMAN ? 'unknown-agent' : cleaned;
}

/** The hold that is still live, or null once it has gone quiet for long enough. */
export function leaseHeld(a: Authority): Holder | null {
  if (!a.holder) return null;
  const idle = a.holder.label === HUMAN ? HUMAN_IDLE_MS : LEASE_IDLE_MS;
  return a.now - a.holder.since > idle ? null : a.holder;
}

/** The whole permission rule, in one place. `hold` is the holder to keep after the command runs. */
/**
 * What an agent needs to know about the door, in words that cannot be mistaken for something else.
 * The screen has two unrelated "modes": the editor's own tab (design · dev · agent, a DOM attribute
 * computer-use scripts read) and this one, which decides whether writing is allowed at all. They
 * share the word `design`, so the permission gets its own two fields rather than a word both answer.
 * `writes` describes the door, not this caller's turn: it can be open and a single write still wait
 * on whoever holds the lease.
 */
export function connectionState(mode: Mode): {connection: Mode; writes: 'on' | 'off'} {
  return {connection: mode, writes: mode === 'design' ? 'off' : 'on'};
}

export function judge(kind: string, caller: string, a: Authority): Verdict {
  // Before anything else, and in every mode: not the open door, not a lease, not Agent mode.
  if (kind === HUMAN_ONLY_KIND) return {allow: false, status: 403, error: HUMAN_ONLY_ERROR};
  if (isRead(kind) || isAsk(kind)) return {allow: true, hold: a.holder};
  if (kind === 'end') {
    return a.mode === 'design'
      ? {allow: false, status: 409, error: 'nothing to end: Agent mode is not running.'}
      : {allow: true, hold: null};
  }
  if (!isWrite(kind)) return {allow: false, status: 403, error: `unknown command kind "${kind}".`};
  if (a.mode === 'delegated') return {allow: true, hold: a.holder};
  if (a.mode === 'design') {
    return {
      allow: false,
      status: 423,
      error: 'writing is off. Ask the person to turn on Connected mode — the switch in the home top row, or Help → Agent connection with a project open — or to start Agent mode to hand the screen over. Reading works without either.',
    };
  }
  const who = normalizeCaller(caller);
  const held = leaseHeld(a);
  if (!held || held.label === who) return {allow: true, hold: {label: who, since: a.now}};
  if (held.label === HUMAN) {
    return {allow: false, status: 409, error: 'the person is using the screen right now. Wait a few seconds and try again.'};
  }
  return {allow: false, status: 409, error: `the screen is held by ${held.label}. Wait for it to finish, or ask the person to hand it over.`};
}
