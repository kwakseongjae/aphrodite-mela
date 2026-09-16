/**
 * taste.md — what this person keeps choosing, written down where they can read it and cross it out.
 *
 * Two rules hold the whole thing up.
 *
 * **Nothing without consent.** The default is off, and off means nothing is derived, not merely
 * nothing shown. The day it was turned on is written at the top of the file.
 *
 * **No line without evidence.** Every observation carries a count and the ids it came from. A file
 * that says "you like serif" is a machine telling someone who they are; a file that says "serif in
 * six of seven projects (p1, p4, …)" is a machine showing its work, which they can disagree with.
 *
 * The file is the truth, not this module: a person may delete a line, and a deleted line must not
 * come back the next time we derive. `parseTaste` reads what they left and `mergeTaste` respects it.
 */
export type TasteConsent = 'off' | 'project' | 'global';
export type TasteSection = 'chosen' | 'corrected' | 'rejected' | 'said';
export type TasteLine = {text: string; count: number; evidence: string[]};
export type Taste = {
  consent: TasteConsent;
  since: string;
  updated: string;
  chosen: TasteLine[];
  corrected: TasteLine[];
  rejected: TasteLine[];
  said: TasteLine[];
};

/** The slice of a project taste can be read from — kept narrow so this stays testable. */
export type TasteProject = {
  id: string;
  brief?: string;
  systemName?: string;
  font?: 'serif' | 'sans';
  variants?: string[];
};

/** The slice of a run taste can be read from. */
export type TasteRun = {
  id: string;
  intent?: string;
  /** Fields Get Vibe wrote, as `blockId:field`. */
  vibeWrote?: string[];
  /** Fields a person rewrote afterwards, same shape. */
  personRewrote?: string[];
  discarded?: number;
  accepted?: number;
};

export const EMPTY: Taste = {consent: 'off', since: '', updated: '', chosen: [], corrected: [], rejected: [], said: []};

const SECTIONS: {key: TasteSection; heading: string}[] = [
  {key: 'chosen', heading: 'Chosen'},
  {key: 'corrected', heading: 'Corrected'},
  {key: 'rejected', heading: 'Rejected'},
  {key: 'said', heading: 'Said'},
];

/** A line is only worth writing when something actually happened more than once by accident. */
function line(text: string, evidence: string[]): TasteLine | null {
  const ids = [...new Set(evidence.filter(Boolean))];
  if (!ids.length || !text.trim()) return null;
  return {text: text.trim(), count: ids.length, evidence: ids};
}

function push(into: TasteLine[], candidate: TasteLine | null): void {
  if (candidate) into.push(candidate);
}

/** Counts values and returns them commonest first, with the ids that carried each. */
function tally<T>(items: {id: string; values: T[]}[]): Map<T, string[]> {
  const out = new Map<T, string[]>();
  for (const {id, values} of items) {
    for (const value of new Set(values)) {
      out.set(value, [...(out.get(value) ?? []), id]);
    }
  }
  return new Map([...out].sort((a, b) => b[1].length - a[1].length));
}

/**
 * Reads the signals into observations. Consent `off` returns the empty taste and touches nothing —
 * the check is here rather than at the call site so there is one place to be wrong.
 */
export function deriveTaste(
  projects: TasteProject[],
  runs: TasteRun[],
  consent: TasteConsent,
  since: string,
  now: string,
): Taste {
  if (consent === 'off') return {...EMPTY, updated: now};
  const taste: Taste = {consent, since, updated: now, chosen: [], corrected: [], rejected: [], said: []};

  // Chosen — what they picked, out of what they were offered.
  const total = projects.length;
  for (const [name, ids] of tally(projects.map(p => ({id: p.id, values: p.systemName ? [p.systemName] : []})))) {
    if (ids.length < 2) continue; // a system opened once is a project, not a preference
    push(taste.chosen, line(`${name} — ${ids.length} of ${total} projects`, ids));
  }
  for (const [font, ids] of tally(projects.map(p => ({id: p.id, values: p.font ? [p.font] : []})))) {
    push(taste.chosen, line(`${font} headings — ${ids.length} of ${total} projects`, ids));
  }
  for (const [variant, ids] of tally(projects.map(p => ({id: p.id, values: p.variants ?? []})))) {
    if (ids.length < 2) continue; // once is a project, twice is a habit
    push(taste.chosen, line(`${variant} — used in ${ids.length} projects`, ids));
  }

  // Corrected — the sharpest signal there is: where the machine wrote and the person rewrote.
  const rewrites = new Map<string, string[]>();
  for (const run of runs) {
    const wrote = new Set(run.vibeWrote ?? []);
    for (const field of run.personRewrote ?? []) {
      if (!wrote.has(field)) continue;
      const name = field.split(':')[1] ?? field;
      rewrites.set(name, [...(rewrites.get(name) ?? []), run.id]);
    }
  }
  for (const [field, ids] of [...rewrites].sort((a, b) => b[1].length - a[1].length)) {
    push(taste.corrected, line(`rewrote the ${field} after Get Vibe — ${ids.length} times`, ids));
  }

  // Rejected — what they were shown and did not take.
  const discarded = runs.filter(r => (r.discarded ?? 0) > 0);
  if (discarded.length) {
    const count = discarded.reduce((sum, r) => sum + (r.discarded ?? 0), 0);
    push(taste.rejected, line(`discarded ${count} proposed directions`, discarded.map(r => r.id)));
  }

  // Said — their own words, quoted, never summarised.
  for (const project of projects) {
    const brief = project.brief?.trim();
    if (brief) push(taste.said, line(`"${brief.slice(0, 160)}" (brief)`, [project.id]));
  }
  for (const run of runs) {
    const intent = run.intent?.trim();
    if (intent) push(taste.said, line(`"${intent.slice(0, 160)}" (goal)`, [run.id]));
  }
  return taste;
}

/** Ids are UUIDs. Fifteen of them on one line is not something anyone reads, and a file nobody reads
 *  is the hidden profile this is supposed to replace. Show the first few, short, and say how many. */
const SHOWN = 4;
function bracket(line: TasteLine): string {
  const short = line.evidence.map(id => id.slice(0, 8));
  if (short.length <= SHOWN) return `(${short.join(', ')})`;
  return `(${line.count}\u00d7 ${short.slice(0, SHOWN).join(', ')} …)`;
}

/** The file a person opens. Markdown, because they have to be able to read and edit it. */
export function renderTaste(taste: Taste): string {
  const head = [
    '# Taste',
    'schema: aphrodite.taste/1',
    `consent: ${taste.consent} · since ${taste.since || '—'}`,
    `updated: ${taste.updated}`,
    '',
    'Every line below carries a count and the ids it came from. Cross out anything that is wrong —',
    'a line you delete does not come back.',
  ];
  const body: string[] = [];
  for (const {key, heading} of SECTIONS) {
    const lines = taste[key];
    if (!lines.length) continue;
    body.push('', `## ${heading}`, ...lines.map(l => `- ${l.text} ${bracket(l)}`));
  }
  return `${[...head, ...body].join('\n')}\n`;
}

const HEADING_OF = new Map(SECTIONS.map(s => [s.heading.toLowerCase(), s.key]));

/** Reads back a file, including one a person has edited by hand. */
export function parseTaste(markdown: string): Taste {
  const taste: Taste = {...EMPTY, chosen: [], corrected: [], rejected: [], said: []};
  let section: TasteSection | null = null;
  for (const raw of markdown.split('\n')) {
    const text = raw.trim();
    const consent = text.match(/^consent:\s*(off|project|global)(?:\s*·\s*since\s*(.*))?$/);
    if (consent) {
      taste.consent = consent[1] as TasteConsent;
      taste.since = (consent[2] ?? '').trim() === '—' ? '' : (consent[2] ?? '').trim();
      continue;
    }
    const updated = text.match(/^updated:\s*(.+)$/);
    if (updated) {
      taste.updated = updated[1].trim();
      continue;
    }
    const heading = text.match(/^##\s+(.+)$/);
    if (heading) {
      section = HEADING_OF.get(heading[1].trim().toLowerCase()) ?? null;
      continue;
    }
    if (!section || !text.startsWith('- ')) continue;
    const item = text.slice(2);
    const evidence = item.match(/\(([^()]*)\)\s*$/);
    const body = evidence ? item.slice(0, item.length - evidence[0].length).trim() : item;
    const inside = evidence ? evidence[1].trim() : '';
    const counted = inside.match(/^(\d+)\u00d7\s*(.*)$/);
    const ids = (counted ? counted[2] : inside).split(',').map(s => s.trim()).filter(id => id && id !== '…');
    // A hand-written line with no ids is still theirs to keep; it just claims no evidence.
    taste[section].push({text: body, count: counted ? Number(counted[1]) : ids.length, evidence: ids});
  }
  return taste;
}

/**
 * Newly derived observations, minus anything the person struck out.
 *
 * "Struck out" means: the previous file had that line and the new derivation still produces it, yet
 * the current file does not. We only know that by being handed the file as it stands now, so the
 * caller passes `onFile` (what they left) and `lastDerived` (what we produced last time).
 */
export function mergeTaste(derived: Taste, onFile: Taste, lastDerived: Taste): Taste {
  const merged: Taste = {...derived, chosen: [], corrected: [], rejected: [], said: []};
  for (const {key} of SECTIONS) {
    const kept = new Set(onFile[key].map(l => l.text));
    const offered = new Set(lastDerived[key].map(l => l.text));
    const removed = new Set([...offered].filter(text => !kept.has(text)));
    merged[key] = derived[key].filter(l => !removed.has(l.text));
    // Lines the person wrote themselves survive untouched, at the end.
    for (const line of onFile[key]) {
      if (!merged[key].some(l => l.text === line.text) && !offered.has(line.text)) merged[key].push(line);
    }
  }
  return merged;
}

// ── Using it ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The order the three directions are offered in — and which one is deliberately not their usual.
 *
 * This is the rule the whole feature stands or falls on. A taste file that narrows what someone is
 * shown turns a design tool into a mirror: they see what they already like, and the third idea they
 * would have chosen never appears. So taste may reorder, and it may *never* remove. One direction is
 * always marked as the one that goes against the profile, and the app says so on the label.
 *
 * With no taste — the default — the order is left exactly as it came.
 */
export type Direction = {variant: string; name: string};
export type OrderedDirection = Direction & {familiar: boolean; against: boolean};

export function orderDirections<T extends Direction>(
  directions: readonly T[],
  taste: Taste,
): (T & {familiar: boolean; against: boolean})[] {
  const plain = directions.map(d => ({...d, familiar: false, against: false}));
  if (taste.consent === 'off' || !taste.chosen.length || plain.length < 2) return plain;

  // A direction is familiar when its variant is named in something they have chosen before.
  const mentions = (variant: string): number =>
    taste.chosen.filter(line => line.text.toLowerCase().includes(variant.toLowerCase())).reduce((sum, l) => sum + l.count, 0);
  const scored = plain.map(d => ({d, score: mentions(d.variant)}));
  if (scored.every(s => s.score === 0)) return plain; // nothing to say; leave it alone

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const out = sorted.map(s => ({...s.d, familiar: s.score > 0, against: false}));
  // The least familiar one is the one we point at, even when it is merely less familiar.
  out[out.length - 1].against = true;
  out[out.length - 1].familiar = false;
  return out;
}

/** The label the app puts on the odd one out, in the person's language. */
export function againstLabel(ko: boolean): string {
  return ko ? '평소 고르시던 것과 다른 쪽' : 'Not the one you usually pick';
}
