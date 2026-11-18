/**
 * Who made a change, and through what. Every edit carries one of these from the input that started it
 * to `commit()` in main.ts, as an argument; nothing reads it from a global.
 *
 * Until 0.3-2b `commit()` read the author from a variable the agent channel set while its command ran
 * and cleared before it returned, so any `await` in between filed the agent's edit as the person's.
 * Now the author is captured where the input arrives — the person's own event, or an agent's call on
 * the transport it came by — and the code that holds it carries it across every await.
 *
 * Two rules hold for every Dispatch `commit()` records:
 * - The person is only ever on the screen (`ui`), and an agent never is.
 * - A `ui` Dispatch comes only from a trusted event. `personAt` makes it from `e.isTrusted` and keeps
 *   a note of it; `refusal` turns away one it did not make, so code cannot claim to be the person.
 *
 * `isTrusted` alone does not say the person did it. The browser fires some events itself, as trusted,
 * because of something code did: the `submit` for a click on a submit button, the `input` and `change`
 * for a click on a checkbox. So an event sent with `send` makes everything that arrives while it is
 * being dispatched that sender's — except a `change` that saves what the person typed into a field,
 * which is theirs however focus came to leave it (`watchTyping`).
 */
import {UNKNOWN, type Author} from '../ledger/types';
import {commandById, type Surface} from './commands.mjs';

export type AgentSurface = Exclude<Surface, 'ui'>;
export type Dispatch = {author: Author; surface: Surface; reason?: string; baseRevision?: string};

export const PERSON: Author = {kind: 'person', name: 'you'};
export const agentSurfaces: readonly AgentSurface[] = ['loopback', 'mcp', 'inApp'];
export const isAgentSurface = (s: unknown): s is AgentSurface => (agentSurfaces as readonly unknown[]).includes(s);

/**
 * What an event that nobody vouches for carries: a click code made, a submit a script sent. It can
 * still open a dialog or move the view; `commit()` records nothing under it.
 */
export const NOBODY: Dispatch = Object.freeze({author: UNKNOWN, surface: 'ui'});

/** The `ui` Dispatches made from trusted events. Nothing else is the person. */
const fromPerson = new WeakSet<Dispatch>();
/** Events the app or an agent's command made, with the Dispatch of whoever caused them. */
const carried = new WeakMap<Event, Dispatch>();
/** Whoever `sendAs` is sending events for, only while it runs; undefined outside it. */
let sending: Dispatch | undefined;
/** Fields the person has typed into since they last sent a `change`, and the `change` events that save that typing. */
const typedIn = new WeakSet<EventTarget>();
const savesTyping = new WeakSet<Event>();

function person(): Dispatch {
  const d: Dispatch = {author: PERSON, surface: 'ui'};
  fromPerson.add(Object.freeze(d));
  return d;
}

/**
 * The person at the screen, from their own input; undefined for any event the browser did not get from
 * them, and for every event while `sendAs` runs: a trusted event then is the browser's answer to code.
 */
export function personAt(e: Pick<Event, 'isTrusted'>): Dispatch | undefined {
  return e.isTrusted === true && !sending ? person() : undefined;
}

/** An agent, on the transport its call arrived by, with the reason and revision it sent. */
export function agentDispatch(name: string, surface: AgentSurface, extra: {reason?: string; baseRevision?: string} = {}): Dispatch {
  if (!isAgentSurface(surface)) throw new Error(`an agent arrives on ${agentSurfaces.join(', ')}, not on ${String(surface)}`);
  return {author: {kind: 'agent', name}, surface, ...(extra.reason ? {reason: extra.reason} : {}), ...(extra.baseRevision ? {baseRevision: extra.baseRevision} : {})};
}

/**
 * Who started this event: whoever `send` named for it; while `sendAs` runs, whoever it is sending for
 * (the person's own typing excepted); otherwise the person when the browser says it was them.
 */
export function dispatchOf(e: Event): Dispatch | undefined {
  const given = carried.get(e);
  if (given) return given;
  if (!sending) return personAt(e);
  if (e.isTrusted && savesTyping.has(e)) return person();
  return sending === NOBODY ? undefined : sending;
}

/**
 * Runs `dispatch` with every event that arrives before it returns counted as `d`'s (nobody's when `d`
 * is undefined). Only what happens before it returns: a callback that awaits would leave `sending` set
 * for whatever else runs in between — the global 0.3-2b took away — so one that returns a promise throws.
 */
export function sendAs<T>(d: Dispatch | undefined, dispatch: () => T): T {
  const outer = sending;
  sending = d ?? NOBODY;
  try {
    const out = dispatch();
    if (typeof (out as {then?: unknown} | null)?.then === 'function') throw new Error('sendAs covers what happens before it returns; it cannot wait');
    return out;
  } finally {
    sending = outer;
  }
}

/**
 * Dispatches an event the app makes itself on behalf of whoever caused it: an agent's click, key or
 * typing, the change a menu sends after the person picks from it, the click the palette sends when
 * Enter is pressed. The event carries `d` while it is sent, and so does whatever the browser fires because of it.
 * A `ui` Dispatch can be passed on this way but not made: `refusal` still asks where it came from.
 */
export function send(target: EventTarget, e: Event, d: Dispatch | undefined): boolean {
  if (d) carried.set(e, d);
  try {
    return sendAs(d, () => target.dispatchEvent(e));
  } finally {
    // Good for this one sending: the same event object sent again by anyone else names nobody.
    carried.delete(e);
  }
}

/**
 * Keeps track of what the person types, so that the `change` saving it is theirs even when an agent's
 * command is what moved focus or the selection on. A value code sets sends no `change` when focus
 * leaves, so an agent's words cannot come back this way as the person's (scripts/verify-ledger.mjs).
 */
export function watchTyping(on: Pick<EventTarget, 'addEventListener'>): void {
  on.addEventListener('input', e => {
    if (!e.target) return;
    if (e.isTrusted && !sending && typeof (e as InputEvent).inputType === 'string') typedIn.add(e.target);
    else if (sending) typedIn.delete(e.target);
  }, true);
  on.addEventListener('change', e => { if (e.target && typedIn.delete(e.target) && e.isTrusted) savesTyping.add(e); }, true);
}

/**
 * Why `commit()` must not record a change under this Dispatch, or undefined when it may. Given the
 * row the change belongs to, a row only the person may do (`author: 'person-only'`) is refused to
 * anyone else, whatever let the call that far.
 */
export function refusal(d: Dispatch | undefined, rowId?: string): string | undefined {
  if (!d || d === NOBODY) return 'nobody is named for this change: only the person\'s own input or an agent\'s command changes the design';
  if (d.surface === 'ui') {
    if (d.author.kind !== 'person') return 'only the person is on the screen';
    if (!fromPerson.has(d)) return 'the screen is the person\'s own input, and nothing else can say it is';
  } else {
    if (d.author.kind === 'person') return `the person is only ever on the screen, never on ${d.surface}`;
    if (d.author.kind !== 'agent' || !d.author.name) return 'an agent\'s change names the agent';
    if (!isAgentSurface(d.surface)) return `${String(d.surface)} is not a way in`;
  }
  if (rowId && commandById[rowId]?.author === 'person-only' && d.author.kind !== 'person') return `${rowId} is the person's to do`;
  return undefined;
}

/**
 * The ledger source an edit to `rowId` writes: `pick` when given, otherwise the first the row lists that
 * is not an agent's (or its only one). Throws for a row that writes nothing to the ledger and for a
 * source the row does not list: the table names every source there is.
 */
export function sourceFor(rowId: string, pick?: string): string {
  const row = commandById[rowId];
  if (!row?.ledger) throw new Error(`${rowId} is not a row that writes to the ledger`);
  const source = pick ?? row.ledger.sources.find(s => !s.startsWith('agent:')) ?? row.ledger.sources[0];
  if (!source || !row.ledger.sources.includes(source)) throw new Error(`${rowId} does not write "${source}"; it writes ${row.ledger.sources.join(', ')}`);
  return source;
}
