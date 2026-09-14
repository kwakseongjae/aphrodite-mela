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

export const readKinds = ['state', 'contract', 'tokens', 'components', 'images', 'render'] as const;
/**
 * Commands that neither read the design nor change it: they ask the person something. Asking is
 * always allowed — an agent that cannot even say "may I?" would be worse than one that can — but the
 * app rate-limits the asking so a prompt can never become a nag, and the answer is always a click.
 */
export const askKinds = ['guide', 'connect'] as const;
export const writeKinds = ['apply', 'system', 'export', 'edit', 'act', 'click', 'type', 'key', 'command', 'library'] as const;

/** The person's own hold expires quickly — one keystroke should not lock an agent out for a minute. */
export const HUMAN_IDLE_MS = 5_000;
/** An agent's hold expires slowly, but it does expire: a dead agent must not keep the screen forever. */
export const LEASE_IDLE_MS = 90_000;
export const HUMAN = 'human';

export function isRead(kind: string): boolean {
  return (readKinds as readonly string[]).includes(kind);
}

/**
 * Some commands carry their own verb: `library` lists, imports or deletes. Listing is a read and must
 * not need the door opened, so the gate is asked about the narrower thing the command actually does.
 */
export function gateFor(command: {kind: string; action?: string}): string {
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
export function judge(kind: string, caller: string, a: Authority): Verdict {
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
      error: 'writing is off. Ask the person to turn on Connected mode (Help → Agent connection), or to start Agent mode to hand the screen over. Reading works without either.',
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
