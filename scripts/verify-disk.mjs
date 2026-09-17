/**
 * The disk path, checked against a real desktop app.
 *
 * Every other gate here drives a headless browser, which means every other gate exercises
 * `writeLibrary(localStorage, …)`. The desktop build takes the other fork — `diskQueue` →
 * `workspace_write` → `library.json` — and until this file existed nothing tested it at all. The
 * formats are not even the same shape, so a browser gate passing said nothing about disk.
 *
 * The linchpin is `state.storage`. The app reports which fork is live, so this gate refuses to run
 * against a browser instance rather than quietly testing localStorage and calling it disk coverage.
 *
 *   node scripts/verify-disk.mjs
 *   APHRODITE_HOME=/tmp/some-sandbox-home node scripts/verify-disk.mjs
 *
 * Exit codes are three, not two, on purpose:
 *   0  the disk path was exercised and held
 *   1  the disk path was exercised and something is wrong
 *   2  it could not be exercised (no app running, or the door is shut)
 *
 * A gate that prints "ok" when it tested nothing is worse than no gate, so "could not verify" gets
 * its own code and its own loud line instead of borrowing success.
 */
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';

const BUNDLE = 'studio.aphrodite.mela';
const HOME = process.env.APHRODITE_HOME || homedir();
const DATA = join(HOME, 'Library', 'Application Support', BUNDLE);
const STORE = join(DATA, 'workspace-v1');

const notes = [];
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

/** Exit 2, with the reason spelled out. Never dressed up as a pass. */
function cannotVerify(reason, hint) {
  console.error(`\n  COULD NOT VERIFY — the disk path was not exercised.`);
  console.error(`  ${reason}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(2);
}

// ---------------------------------------------------------------- the bridge

const endpointPath = join(DATA, 'agent-endpoint.json');
if (!existsSync(endpointPath)) {
  cannotVerify(
    `No agent endpoint at ${endpointPath}.`,
    'Launch the desktop app first, then run this again.',
  );
}

let endpoint;
try {
  endpoint = JSON.parse(readFileSync(endpointPath, 'utf8'));
} catch (error) {
  cannotVerify(`The endpoint file is unreadable: ${error.message}`);
}

/**
 * The app does not remove this file when it exits, so a stale one advertises a dead port. Finding
 * that out here — rather than as a confusing ECONNREFUSED inside a check — is the difference
 * between "the app is not running" and "the disk path is broken".
 */
async function agent(route, {method = 'GET', body} = {}) {
  const response = await fetch(`${endpoint.base}/agent/${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(15_000),
  });
  return response.json();
}

let state;
try {
  const out = await agent('state');
  if (out?.error) cannotVerify(`The bridge refused: ${out.error}`);
  state = out.state;
} catch (error) {
  cannotVerify(
    `Nothing is listening on ${endpoint.base} (${error.message}).`,
    'That endpoint file is stale — the app it described has exited. Start the app and retry.',
  );
}

if (!state) cannotVerify('The bridge answered without a state block.');

if (state.storage !== 'disk') {
  cannotVerify(
    `This app reports storage="${state.storage}", not "disk".`,
    'That is the browser build. This gate only means something against the desktop app.',
  );
}

// ------------------------------------------------------------ the envelope

/**
 * The exact envelope `workspace.rs` enforces on the way in, asserted on the way out. If these drift
 * apart the app still writes happily and then refuses to read its own file on next launch, which is
 * the worst shape a bug can take: invisible until restart.
 */
function readEnvelope(name) {
  const path = join(STORE, name);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  return {path, raw, value: JSON.parse(raw)};
}

check('the store exists where the app says it does', () => {
  if (!existsSync(STORE)) throw new Error(`no workspace-v1 at ${STORE}`);
  const current = readEnvelope('library.json');
  if (!current) throw new Error('no library.json — the app has never saved');
  notes.push(`store ${STORE}`);
});

check('the envelope is {revision:u64, data:string} and nothing else', () => {
  const {value} = readEnvelope('library.json');
  if (!Number.isInteger(value.revision) || value.revision < 0) {
    throw new Error(`revision is ${JSON.stringify(value.revision)}, not a whole number`);
  }
  // Rust checks `value["data"].is_string()`. A nested object reads fine in JS and is rejected on
  // next launch as "Invalid workspace envelope", so the string-ness is the whole contract.
  if (typeof value.data !== 'string') {
    throw new Error(`data is ${typeof value.data}, but Rust requires a JSON string`);
  }
  notes.push(`revision ${value.revision}`);
});

check('the payload inside the string is a library Rust would accept', () => {
  const {value} = readEnvelope('library.json');
  const data = JSON.parse(value.data);
  if (data.version !== 1) throw new Error(`version is ${data.version}, not 1`);
  if (!Array.isArray(data.entries)) throw new Error('entries is not an array');
  notes.push(`${data.entries.length} entries`);
});

check('the previous revision is exactly one behind, when there is one', () => {
  const previous = readEnvelope('library.previous.json');
  if (!previous) {
    notes.push('no previous.json yet (first save)');
    return;
  }
  const {value: current} = readEnvelope('library.json');
  if (previous.value.revision !== current.revision - 1) {
    throw new Error(
      `previous is revision ${previous.value.revision} against current ${current.revision}; ` +
        'rotation happens inside the lock, so a gap means a write escaped it',
    );
  }
});

check('the lock file is present, because the rotation depends on it', () => {
  if (!existsSync(join(STORE, 'workspace.lock'))) {
    throw new Error('no workspace.lock — concurrent writers would race the revision check');
  }
});

// ------------------------------------------------------------- the write path

/**
 * Editing needs the person to have opened the door, and no gate may open it for them. When it is
 * shut we say so and stop at code 2; we do not report a pass for checks that never ran.
 */
const doorOpen = state.writes === 'on';

/** The library as the file has it, plus the entry we are about to nudge. */
function entries() {
  return JSON.parse(readEnvelope('library.json').value.data).entries ?? [];
}
function pinnedOf(id) {
  return entries().find(e => e.project?.id === id)?.pinned;
}

/**
 * Pinning is the smallest real write there is: one boolean on one entry, reachable from the home
 * screen, and reversible. An `edit` would have been the obvious choice and is the wrong one — it
 * needs a project open and a block selected, and its field vocabulary is
 * title|text|label|eyebrow|description, so it says nothing about the library file at all.
 *
 * The assertion is deliberately on the bytes rather than on the reply. The bridge answering "ok"
 * only proves the app accepted the command; the whole question here is whether it reached disk.
 */
check('a real change reaches the bytes on disk, and the revision moves with it', async () => {
  if (!doorOpen) throw new Error('SKIP');
  const list = entries();
  const target = list.find(e => e.project?.id);
  if (!target) throw new Error('SKIP:EMPTY');

  const id = target.project.id;
  const before = readEnvelope('library.json').value.revision;
  const wasPinned = pinnedOf(id);

  const out = await agent('act', {method: 'POST', body: {action: 'hub-pin', data: {id}}});
  if (out?.error) throw new Error(`the change was refused: ${out.error}`);

  // The queue is serial and async, so the file lags the reply. Poll rather than guess a delay.
  let after = before;
  for (let i = 0; i < 25 && after === before; i++) {
    await new Promise(r => setTimeout(r, 200));
    after = readEnvelope('library.json').value.revision;
  }
  if (after === before) {
    throw new Error(`revision stayed at ${before} after an accepted change — the queue never reached disk`);
  }
  if (pinnedOf(id) === wasPinned) {
    throw new Error('the revision moved but the value did not — something else wrote, not this change');
  }
  notes.push(`write path moved revision ${before} → ${after} and flipped pinned on ${id.slice(0, 8)}`);

  // Put it back. A gate that leaves the person's library changed is a gate they will stop running.
  await agent('act', {method: 'POST', body: {action: 'hub-pin', data: {id}}});
  for (let i = 0; i < 25 && pinnedOf(id) !== wasPinned; i++) {
    await new Promise(r => setTimeout(r, 200));
  }
  if (pinnedOf(id) !== wasPinned) {
    throw new Error(`could not restore pinned=${wasPinned} on ${id} — please check that project`);
  }
  notes.push('and put it back');
});

// ---------------------------------------------------------------------- run

let failed = 0;
let skipped = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    if (error.message === 'SKIP') {
      skipped += 1;
      console.log(`  SKIP  ${name}`);
      continue;
    }
    if (error.message === 'SKIP:EMPTY') {
      skipped += 1;
      console.log(`  SKIP  ${name}\n        no project in this library to nudge — make one, then run again`);
      continue;
    }
    failed += 1;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

for (const note of notes) console.log(`        · ${note}`);

if (failed) {
  console.error(`\n  ${failed} check${failed > 1 ? 's' : ''} failed against the disk path.`);
  process.exit(1);
}

if (skipped) {
  console.error(
    `\n  The read side held, but ${skipped} write check${skipped > 1 ? 's were' : ' was'} not run: ` +
      `writes are "${state.writes}".`,
  );
  cannotVerify(
    'The write path is unverified because the door is shut.',
    'Turn on Connected mode in the app (a person has to press it), then run this again.',
  );
}

console.log(`\n  The disk path held. storage=${state.storage}, writes=${state.writes}.`);
