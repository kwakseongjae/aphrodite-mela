/**
 * Every edit lands in the ledger as exactly one change, named for whoever made it.
 *
 * Until 0.3-2b `commit()` read who was editing from a global, and the agent channel cleared that
 * global before its 60 ms wait. So an agent's `click` on a button whose handler awaited anything was
 * recorded as the person — "you" — and the person was shown an edit they never made. This gate drives
 * every `edit` row of the command table once on every surface the table offers it on: the agent's
 * channel (loopback, MCP and the in-app agent, through `window.aphroditeAgent`) and the person's own
 * input (trusted CDP events). For each it checks that the ledger moved by exactly one change, that the
 * change names the right author, that its source is the one the row lists, and that the reason is
 * there when the row requires one. A row added to the table without a way to drive it here fails.
 *
 *   node scripts/verify-ledger.mjs
 */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {openApp, runChecks, sleep, waitFor} from './lib/headless.mjs';
import {commands, commandById} from '../src/agent/commands.mjs';

const {evaluate, send, personClicks, personPresses, presses, close} = await openApp({port: 4207, cdp: 9367, profile: '/tmp/aphrodite-ledger-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

const CALLER = 'ledger-gate';
const WHY = 'verify-ledger: one change, named for whoever made it.';
const AGENT = {kind: 'agent', name: CALLER};
const PERSON = {kind: 'person', name: 'you'};
const AGENT_SURFACES = ['loopback', 'mcp', 'inApp'];

/** An agent command on one surface: the same executor every agent transport reaches. */
const agentOn = (surface, kind, payload = {}) =>
  evaluate(`window.aphroditeAgent.run(${JSON.stringify(kind)}, ${JSON.stringify(payload)}, ${JSON.stringify(CALLER)}, ${JSON.stringify(surface)})`);
const read = (kind, payload = {}) => agentOn('loopback', kind, payload);
const seq = async () => (await read('changes', {limit: 1})).seq;
const revision = async () => (await read('changes', {limit: 1})).revision;

/** Runs `run` and returns the `count` changes it made, oldest first; fails if it made any other number. */
async function changes(label, count, run) {
  const before = await seq();
  const result = await run();
  await sleep(350);
  const after = await read('changes', {since: before, include_view: true, limit: 20});
  assert.equal(after.seq, before + count, `${label}: the ledger moved by exactly ${count} (moved ${after.seq - before}); the call said ${JSON.stringify(result)?.slice(0, 300)}`);
  return after.changes;
}
/** Runs `run` and returns the one change it made; fails if it made none, or more than one. */
const oneChange = async (label, run) => (await changes(label, 1, run))[0];

/** Holds a change to the row it belongs to: the author, a source the row lists, and the reason. */
function matches(label, change, {row, author, source, reason}) {
  const r = commandById[row];
  assert.ok(r?.ledger, `${label}: ${row} is a row that writes to the ledger`);
  assert.deepEqual(change.author, author, `${label}: recorded as ${JSON.stringify(change.author)}`);
  assert.ok(r.ledger.sources.includes(change.source), `${label}: source "${change.source}" is not one ${row} lists (${r.ledger.sources.join(', ')})`);
  if (source) assert.equal(change.source, source, `${label}: source`);
  assert.equal(change.reason, reason, `${label}: reason`);
}

/* ---- the person's hands: trusted input only ---- */

const mouse = (type, p, buttons = 0) => send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', buttons, clickCount: 1});
/** The centre of an element on screen, once nothing covers it; when something does, the error says what. */
async function at(selector) {
  const look = () => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {missing: true};
    el.scrollIntoView({block: 'center', inline: 'center'}); const r = el.getBoundingClientRect(); if (!r.width || !r.height) return {empty: true};
    const x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
    return hit && (hit === el || el.contains(hit) || hit.contains(el)) ? {x, y} : {covered: hit ? hit.tagName + '.' + String(hit.className) : null, x, y}; })()`);
  for (let i = 0; i < 10; i++) { const got = await look(); if (got.x !== undefined && !got.covered && got.covered !== null) return got; if (i === 9) throw new Error(`${selector} is not on screen: ${JSON.stringify(got)}`); await sleep(500); }
}
/** The person's click on a real element. */
async function pressAt(selector) {
  const p = await at(selector);
  await mouse('mouseMoved', p); await mouse('mousePressed', p, 1); await mouse('mouseReleased', p);
  await sleep(250);
}
/** The person picking an option in one of the app's menus (a native select behind a custom menu). */
async function pick(selectSelector, value) {
  const id = await evaluate(`(() => { const s = document.querySelector(${JSON.stringify(selectSelector)}); if (!s) return null;
    s.previousElementSibling.dataset.ledgerMenu = '1'; return true; })()`);
  assert.ok(id, `${selectSelector} is on screen`);
  await pressAt('[data-ledger-menu="1"] > summary');
  await pressAt(`[data-ledger-menu="1"] [data-value=${JSON.stringify(value)}]`);
  await evaluate(`document.querySelector('[data-ledger-menu]')?.removeAttribute('data-ledger-menu'), true`);
}
/** A value other than the current one that a select offers. */
const otherOption = selectSelector => evaluate(`(() => { const s = document.querySelector(${JSON.stringify(selectSelector)});
  return [...s.options].find(o => !o.disabled && o.value !== s.value)?.value ?? null; })()`);
/** The person typing over a field's text and leaving it with Tab, which is when the field commits. */
async function typeInto(selector, text) {
  await pressAt(selector);
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select?.(); return true; })()`);
  await send('Input.insertText', {text});
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
  await sleep(300);
}
/** The person filling in a dialog's field and pressing its submit button. */
async function submit(form, field, text) {
  await typeInto(`${form} [name="${field}"]`, text);
  await pressAt(`${form} [type="submit"]`);
}
/** The person dragging with the mouse. */
async function drag(from, to, steps = 8) {
  await mouse('mouseMoved', from); await mouse('mousePressed', from, 1);
  for (let i = 1; i <= steps; i++) await mouse('mouseMoved', {x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps}, 1);
  await mouse('mouseReleased', to);
  await sleep(400);
}
/** Selecting is not an edit, so it is done the quickest way. `kind` is a component kind, or a number for the nth component on the page. */
async function select(kind) {
  const id = typeof kind === 'number'
    ? await evaluate(`[...document.querySelectorAll('.space-frame.active .block-wrap[data-block-id]')].filter(e => !e.parentElement.closest('.block-wrap'))[${kind}]?.dataset.blockId ?? null`)
    : await evaluate(`document.querySelector('.space-frame.active .block-wrap[data-kind=${kind}]')?.dataset.blockId ?? null`);
  assert.ok(id, `a ${kind} is on the page`);
  await evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'select'; b.dataset.id = ${JSON.stringify(id)}; document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
  await sleep(300);
  await evaluate(`document.querySelector('[data-block-id="${id}"]')?.scrollIntoView({block: 'center'}), true`);
  await sleep(300);
  return id;
}
/** The canvas is a space with a camera, which scrollIntoView cannot move: fit the page being edited instead. */
const frameInView = async () => { await personClicks('zoom-frame'); await sleep(500); };
const closeDialogs = async () => { await presses('Escape'); await sleep(200); };
const blockOf = kind => evaluate(`document.querySelector('.space-frame.active .block-wrap[data-kind=${kind}]')?.dataset.blockId ?? null`);

check('a sample project is open and the door is open to agents', async () => {
  // Wide enough that the inspector and the layer list are on screen to be pressed.
  await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
  await personClicks('welcome-sample');
  await waitFor(() => evaluate('!!document.querySelector(".space-frame.active [data-block-id]")'), 'the sample canvas');
  await personPresses('agent-connect-toggle');
  await sleep(250);
  await closeDialogs();
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), true, 'agents may edit alongside the person');
  await sleep(5_200); // the person's press holds the screen for five seconds
});

/* ---- every edit row an agent reaches by name, on every agent surface the table offers it on ---- */

const systems = ['mono', 'toss', 'seed', 'karrot', 'shadcn', 'mui'];
const payloads = {
  'edit.apply': async () => ({reason: WHY, base_revision: await revision(), ops: [{op: 'add', component_kind: 'cta'}]}),
  'edit.text': async surface => ({reason: WHY, base_revision: await revision(), field: 'title', text: `Written by an agent on ${surface}`, blockId: await blockOf('hero')}),
  'edit.system': async () => ({reason: WHY, base_revision: await revision(), id: systems.shift()}),
};
const named = commands.filter(r => r.grade === 'edit' && r.route && !r.resolves);

check('every edit an agent can name has a way to be driven here', () => {
  assert.deepEqual(named.map(r => r.id).sort(), Object.keys(payloads).sort());
  for (const row of named) assert.ok(row.ledger.sources.some(s => s.startsWith('agent:')), `${row.id} names the source an agent's call writes`);
});

for (const row of named) {
  for (const surface of AGENT_SURFACES.filter(s => row.surfaces[s])) {
    check(`${row.id} from an agent on ${surface}: one change, the agent's, with its reason`, async () => {
      const payload = await payloads[row.id](surface);
      const kind = row.route.path.split('/').pop();
      const change = await oneChange(`${row.id} on ${surface}`, () => agentOn(surface, kind, payload));
      matches(`${row.id} on ${surface}`, change, {row: row.id, author: AGENT, source: row.ledger.sources.find(s => s.startsWith('agent:')), reason: row.reason === 'none' ? undefined : WHY});
    });
  }
}

check('edit and system without a reason change nothing and say why', async () => {
  for (const [kind, payload] of [['edit', {field: 'title', text: 'No reason', blockId: await blockOf('hero')}], ['system', {id: 'astryx'}]]) {
    const before = await seq();
    const result = await read(kind, payload);
    assert.match(result.error ?? '', /reason/, `${kind}: ${JSON.stringify(result)}`);
    assert.equal(await seq(), before, `${kind} without a reason left the ledger alone`);
  }
});

check('edit and system written against an older revision are refused with what changed since', async () => {
  const old = await revision();
  await agentOn('loopback', 'apply', {reason: WHY, ops: [{op: 'add', component_kind: 'cta'}]});
  await sleep(300);
  for (const [kind, payload] of [['edit', {field: 'title', text: 'Stale', blockId: await blockOf('hero')}], ['system', {id: 'astryx'}]]) {
    const before = await seq();
    const result = await read(kind, {...payload, reason: WHY, base_revision: old});
    assert.equal(result.status, 409, `${kind}: ${JSON.stringify(result).slice(0, 300)}`);
    assert.equal(result.stale, true);
    assert.ok(Array.isArray(result.changes) && result.changes.length >= 1, `${kind}: the reply lists what changed`);
    assert.equal(await seq(), before, `${kind} against an old revision left the ledger alone`);
  }
});

/* ---- the screen verbs: what they reach is recorded as the agent's, never the person's ---- */

check('act: the button it presses is recorded as the agent, with the reason given', async () => {
  const change = await oneChange('act add', () => read('act', {action: 'add', data: {kind: 'cta'}, reason: WHY}));
  matches('act add', change, {row: 'edit.add', author: AGENT, source: 'catalog:add', reason: WHY});
});

check('click: a button whose handler waits before it commits is still the agent’s (the "you" bug)', async () => {
  const change = await oneChange('click add', () => read('click', {selector: '.component-list [data-action="add"]'}));
  matches('click add', change, {row: 'edit.add', author: AGENT, source: 'catalog:add', reason: undefined});
});

check('type: a field an agent fills is recorded as the agent', async () => {
  await select('hero');
  const change = await oneChange('type title', () => read('type', {selector: '[data-field="title"]', text: 'Typed by an agent'}));
  matches('type title', change, {row: 'edit.text', author: AGENT, source: 'editor:change', reason: undefined});
});

check('key: an agent’s ⌘Z is recorded as the agent', async () => {
  const change = await oneChange('key undo', () => read('key', {key: 'z', meta: true}));
  matches('key undo', change, {row: 'edit.undo', author: AGENT, source: 'undo', reason: undefined});
});

check('command: the palette entry it runs is recorded as the agent, with the reason given', async () => {
  const change = await oneChange('command add', () => read('command', {query: 'Add CTA', reason: WHY}));
  matches('command add', change, {row: 'edit.add', author: AGENT, source: 'catalog:add', reason: WHY});
});

for (const surface of AGENT_SURFACES.filter(s => commandById['screen.ui'].surfaces[s])) {
  check(`use_interface on ${surface}: its command is recorded as the agent, with the reason given`, async () => {
    const change = await oneChange(`ui command on ${surface}`, () => agentOn(surface, 'ui', {action: 'command', query: 'Add CTA', reason: WHY}));
    matches(`ui command on ${surface}`, change, {row: 'edit.add', author: AGENT, source: 'catalog:add', reason: WHY});
  });
}

check('the screen verbs covered here are every one the table has', () => {
  assert.deepEqual(commands.filter(r => r.resolves).map(r => r.id).sort(), ['screen.act', 'screen.click', 'screen.command', 'screen.key', 'screen.type', 'screen.ui']);
});

/* ---- what the browser fires while an agent's command is sending events is the agent's ---- */

/** The person's own press holds the screen for five seconds; an agent's next command waits that out. */
const personLetsGo = () => sleep(5_300);
/** The person typing into a field and staying in it: nothing is saved until focus leaves the field. */
async function typeAndStay(selector, text) {
  await pressAt(selector);
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select?.(); return true; })()`);
  await send('Input.insertText', {text});
  await sleep(200);
}
const sectionOf = async kind => `.space-frame.active .block-wrap[data-block-id="${await blockOf(kind)}"]`;

check('click on a form’s submit button: the submit the browser fires for it is the agent’s, not the person’s', async () => {
  // The browser sends that submit itself, as trusted, while the agent's click is being dispatched.
  await personPresses('project');
  await personLetsGo();
  await read('type', {selector: '#rename-form [name="name"]', text: 'Renamed by an agent'});
  const change = await oneChange('click submit', () => read('click', {selector: '#rename-form [type="submit"]'}));
  matches('click submit', change, {row: 'edit.project-rename', author: AGENT, source: 'editor:change', reason: undefined});
});

check('click on the language settings’ save: the agent’s choice of content language is the agent’s', async () => {
  await personPresses('language-settings');
  await personLetsGo();
  const menu = '#language-settings-form [name="contentLanguage"]';
  await read('type', {selector: menu, text: await otherOption(menu)});
  const change = await oneChange('click save', () => read('click', {selector: '#language-settings-form [type="submit"]'}));
  matches('click save', change, {row: 'edit.content-language', author: AGENT, source: 'project:content-language', reason: undefined});
});

check('the person’s unsaved words are saved as theirs when an agent’s click moves the selection', async () => {
  await select('hero');
  const words = 'The person typed this and never left the field';
  const before = await seq();
  await typeAndStay('[data-field="title"]', words);
  assert.equal(await seq(), before, 'typing alone saves nothing: the field saves as focus leaves it');
  await personLetsGo();
  const change = await oneChange('agent click elsewhere', async () => read('click', {selector: await sectionOf('features')}));
  matches('agent click elsewhere', change, {row: 'edit.text', author: PERSON, source: 'editor:change', reason: undefined});
  assert.ok(JSON.stringify(change.ops).includes(words), `the change holds the person’s words: ${JSON.stringify(change.ops).slice(0, 300)}`);
});

check('the person’s unsaved words are theirs, and the field an agent types into is the agent’s', async () => {
  await select('hero');
  const words = 'The person was still writing this';
  await typeAndStay('[data-field="title"]', words);
  await personLetsGo();
  const [theirs, agents] = await changes('agent types elsewhere', 2, () => read('type', {selector: '[data-field="text"]', text: 'An agent wrote this'}));
  matches('the field the person left', theirs, {row: 'edit.text', author: PERSON, source: 'editor:change', reason: undefined});
  assert.ok(JSON.stringify(theirs.ops).includes(words), 'the person’s change holds the person’s words');
  matches('the field the agent filled', agents, {row: 'edit.text', author: AGENT, source: 'editor:change', reason: undefined});
  assert.ok(JSON.stringify(agents.ops).includes('An agent wrote this'), 'the agent’s change holds the agent’s words');
});

check('an agent’s words typed over the person’s are the agent’s, and leaving the field saves nothing more', async () => {
  await select('hero');
  await typeAndStay('[data-field="title"]', 'Half a thought from the person');
  await personLetsGo();
  const [only] = await changes('agent types over, then clicks elsewhere', 1, async () => {
    await read('type', {selector: '[data-field="title"]', text: 'The agent’s title'});
    await read('click', {selector: await sectionOf('features')});
  });
  matches('typed over', only, {row: 'edit.text', author: AGENT, source: 'editor:change', reason: undefined});
});

check('a value an agent typed sends no change of the browser’s own when the person moves focus on', async () => {
  // So an agent's words cannot come back as the person's by way of the field saving as it loses focus.
  await select('hero');
  await evaluate(`(() => { window.__ledgerChanges = []; document.querySelector('[data-field="title"]').addEventListener('change', e => window.__ledgerChanges.push(e.isTrusted)); return true; })()`);
  await oneChange('agent types', () => read('type', {selector: '[data-field="title"]', text: 'Left in the field by an agent'}));
  assert.equal(await evaluate(`document.activeElement?.dataset?.field ?? null`), 'title', 'the field is still focused');
  await changes('the person clicks elsewhere', 0, async () => pressAt(await sectionOf('features')));
  assert.deepEqual(await evaluate('window.__ledgerChanges'), [false], 'only the agent’s own change was sent');
});

check('the person’s unsaved words are saved as theirs before an agent’s edit redraws the editor', async () => {
  // The redraw replaces the field; a field removed while focused never sends its change.
  await select('hero');
  const words = 'Still being written when the agent added a section';
  const before = await seq();
  await typeAndStay('[data-field="title"]', words);
  assert.equal(await seq(), before, 'typing alone saves nothing');
  await personLetsGo();
  const [theirs, agents] = await changes('agent adds a CTA', 2, () => read('apply', {reason: WHY, ops: [{op: 'add', component_kind: 'cta'}]}));
  matches('the person’s words, first', theirs, {row: 'edit.text', author: PERSON, source: 'editor:change', reason: undefined});
  assert.ok(JSON.stringify(theirs.ops).includes(words), `the change holds the person’s words: ${JSON.stringify(theirs.ops).slice(0, 300)}`);
  matches('then the agent’s add', agents, {row: 'edit.apply', author: AGENT, source: 'agent:apply', reason: WHY});
});

check('the person’s unsaved words are saved as theirs before an agent redraws the editor without an edit', async () => {
  await select('hero');
  const words = 'Still being written when the agent switched a tab';
  await typeAndStay('[data-field="title"]', words);
  await personLetsGo();
  const change = await oneChange('agent switches the library tab', () => read('act', {action: 'tab', data: {tab: 'components'}}));
  matches('the person’s words', change, {row: 'edit.text', author: PERSON, source: 'editor:change', reason: undefined});
  assert.ok(JSON.stringify(change.ops).includes(words), 'the change holds the person’s words');
});

check('an agent’s ⌘Z while the person has unsaved words saves them first, as theirs, and then undoes the newest change', async () => {
  await select('hero');
  const words = 'Still being written when the agent pressed undo';
  await typeAndStay('[data-field="title"]', words);
  await personLetsGo();
  const [theirs, undo] = await changes('agent ⌘Z', 2, () => read('key', {key: 'z', meta: true}));
  matches('the person’s words, first', theirs, {row: 'edit.text', author: PERSON, source: 'editor:change', reason: undefined});
  assert.ok(JSON.stringify(theirs.ops).includes(words), 'the change holds the person’s words');
  matches('then the agent’s undo', undo, {row: 'edit.undo', author: AGENT, source: 'undo', reason: undefined});
  assert.equal(undo.undoes, theirs.seq, 'the undo takes back the newest change, which is the person’s words: a redo brings them back');
  await oneChange('the person’s redo', () => presses('z', 4 | 8));
});

check('a menu change sent for the person cannot be sent again', async () => {
  // Captured as it passes, then sent again by script with a different value: nobody is named for the second.
  await evaluate(`(() => { window.__ledgerSaved = null; window.addEventListener('change', e => { if (e.target.id === 'radius-select') window.__ledgerSaved = e; }, true); return true; })()`);
  matches('the person’s pick', await oneChange('pick radius', async () => pick('#radius-select', await otherOption('#radius-select'))), {row: 'edit.tokens', author: PERSON, source: 'editor:change'});
  await changes('the same event sent again', 0, async () => evaluate(`(() => { const s = document.querySelector('#radius-select');
    s.value = [...s.options].find(o => o.value !== s.value).value; s.dispatchEvent(window.__ledgerSaved); return true; })()`));
});

check('a file reaches a picker the person opened only from the file chooser', async () => {
  // A file the chooser hands over (CDP's DOM.setFileInputFiles sends the browser's own, trusted change)
  // lands as the person's; the same picker given a file by script and a change of its own takes nothing.
  const png = fileURLToPath(new URL('../public/brand/apple-mark.png', import.meta.url));
  await send('Page.enable');
  await send('Page.setInterceptFileChooserDialog', {enabled: true});
  try {
    await personPresses('reference');
    await sleep(300);
    await personPresses('upload-reference');
    await sleep(300);
    assert.equal(await evaluate(`!!document.querySelector('input[type=file][data-upload]')`), true, 'the picker is waiting for a file');
    await changes('a script hands the picker a file', 0, () => evaluate(`(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 8; c.getContext('2d').fillRect(0, 0, 8, 8);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const t = new DataTransfer(); t.items.add(new File([blob], 'agent.png', {type: 'image/png'}));
      const input = document.querySelector('input[type=file][data-upload]'); input.files = t.files; input.dispatchEvent(new Event('change', {bubbles: true}));
      await new Promise(r => setTimeout(r, 800)); return true; })()`));
    await evaluate(`(() => { window.__ledgerFileChange = null; document.querySelector('input[type=file][data-upload]').addEventListener('change', e => { window.__ledgerFileChange = e.isTrusted; }); return true; })()`);
    const chosen = await oneChange('the person chooses a file', async () => {
      const {result: {root}} = await send('DOM.getDocument', {depth: 0});
      const {result: {nodeId}} = await send('DOM.querySelector', {nodeId: root.nodeId, selector: 'input[type=file][data-upload]'});
      await send('DOM.setFileInputFiles', {nodeId, files: [png]});
      await sleep(800);
    });
    assert.equal(await evaluate('window.__ledgerFileChange'), true, 'the chooser’s change is the browser’s own');
    matches('the person chooses a file', chosen, {row: 'edit.reference', author: PERSON, reason: undefined});
    // The person row below starts from a project with no reference.
    await personPresses('remove-reference');
    await sleep(300);
  } finally {
    await evaluate(`document.querySelector('input[type=file][data-upload]')?.remove(), true`);
    await send('Page.setInterceptFileChooserDialog', {enabled: false});
    for (let i = 0; i < 3 && await evaluate(`document.querySelector('#modal-root').children.length`); i++) await closeDialogs();
  }
});

/* ---- every edit row the person reaches, through one of its controls, by their own input ---- */

const toDirections = async () => {
  await personPresses('reference');
  await sleep(300);
  if (await evaluate(`!!document.querySelector('#modal-root [data-action="demo-reference"]')`)) { await personPresses('demo-reference'); await sleep(1500); }
  await personPresses('analyze-reference');
  await waitFor(() => evaluate(`!!document.querySelector('#modal-root [data-action="compare-directions"]')`), 'the analysis', 30);
  await personPresses('compare-directions');
  await waitFor(() => evaluate(`!!document.querySelector('#modal-root [data-action="choose-direction"]')`), 'three directions', 30);
};

/** One control per row; `setup` is not measured, `run` must make exactly one change. */
const person = {
  'edit.add': {source: 'catalog:add', run: () => personPresses('add', {kind: 'cta'})},
  'edit.move': {source: 'editor:change', setup: () => select('features'), run: () => pressAt('.inspector [data-action="move-up"]')},
  'edit.duplicate': {source: 'editor:change', setup: () => select('features'), run: () => pressAt('.inspector [data-action="duplicate-block"]')},
  'edit.delete': {source: 'editor:change', setup: () => select('cta'), run: () => pressAt('.inspector [data-action="delete-block"]')},
  'edit.variant': {source: 'editor:change', setup: () => select('hero'), run: async () => pick('#hero-variant', await otherOption('#hero-variant'))},
  'edit.layout': {source: 'editor:change', setup: () => select('hero'), run: () => typeInto('[data-layout="height"]', '420')},
  // A button is a kind more than one library implements; adding one selects it.
  'edit.component-theme': {source: 'editor:change', setup: async () => { await personPresses('add', {kind: 'button'}); await sleep(300); }, run: async () => pick('#component-provider', await otherOption('#component-provider'))},
  'edit.image': {source: 'collection:image', setup: () => select('products'), run: () => pressAt('.inspector [data-action="collection-image-demo"][data-index="0"]')},
  'edit.reference': {source: 'editor:change', setup: () => personPresses('reference'), run: () => pressAt('#modal-root [data-action="demo-reference"]'), after: closeDialogs},
  'edit.tokens': {source: 'editor:change', run: async () => pick('#radius-select', await otherOption('#radius-select'))},
  'edit.page-switch': {source: 'editor:change', run: async () => personPresses('page', {id: await evaluate(`[...document.querySelectorAll('.space-frame')].find(f => !f.classList.contains('active')).dataset.pageId`)})},
  'edit.page-add': {source: 'editor:change', setup: () => personPresses('add-page'), run: () => submit('#page-form', 'name', 'Contact')},
  'edit.page-sample': {source: 'editor:change', run: () => personPresses('pointer-lab')},
  'edit.page-duplicate': {source: 'editor:change', run: () => personPresses('duplicate-page')},
  'edit.page-delete': {source: 'editor:change', run: () => personPresses('delete-page')},
  'edit.page-rename': {source: 'editor:change', setup: () => personPresses('page-menu'), run: () => submit('#page-rename-form', 'name', 'Renamed by hand')},
  'edit.frame': {source: 'frame:move', run: async () => { const from = await at('.space-frame.active [data-frame-handle]'); await drag(from, {x: from.x + 90, y: from.y + 40}); }},
  'edit.project-rename': {source: 'editor:change', setup: () => personPresses('project'), run: () => submit('#rename-form', 'name', 'Ledger gate')},
  'edit.content-language': {source: 'project:content-language', setup: async () => { await personPresses('language-settings'); await sleep(200); await pick('#language-settings-form [name="contentLanguage"]', await otherOption('#language-settings-form [name="contentLanguage"]')); }, run: () => pressAt('#language-settings-form [type="submit"]')},
  'edit.brief': {source: 'editor:change', setup: async () => { await personPresses('brief'); await sleep(200); await typeInto('#brief-form [name="brief"]', 'A calm shop for lamps'); }, run: () => pressAt('#brief-form [type="submit"]')},
  'edit.vibe': {source: 'vibe:apply', setup: async () => { await personPresses('autofill'); await sleep(200); await pressAt('#vibe-form [type="submit"]'); await sleep(300); }, run: () => pressAt('#modal-root [data-action="apply-vibe"]')},
  'edit.direction': {source: 'editor:change', setup: toDirections, run: () => pressAt('#modal-root [data-action="choose-direction"][data-index="0"]')},
  'edit.proposal': {source: 'editor:change', setup: async () => { await toDirections(); await pressAt('#modal-root [data-action="propose-directions"]'); await sleep(400); }, run: async () => personPresses('proposal-keep', {id: await evaluate(`document.querySelector('[data-action="proposal-keep"]').dataset.id`)})},
  'edit.undo': {source: 'undo', run: () => presses('z', 4)},
  'edit.redo': {source: 'redo', run: () => presses('z', 4 | 8)},
  'edit.system': {source: 'editor:change', setup: () => personPresses('systems'), run: () => pressAt('#modal-root [data-action="choose-system"][data-system="atelier"]')},
  'edit.text': {source: 'editor:change', setup: () => select('hero'), run: () => typeInto('[data-field="title"]', 'Written by hand')},
};
const onScreen = commands.filter(r => r.grade === 'edit' && r.surfaces.ui);

check('every edit the person can make has a way to be driven here', () => {
  assert.deepEqual(onScreen.map(r => r.id).sort(), Object.keys(person).sort());
});

for (const row of onScreen) {
  check(`${row.id} by the person's own input: one change, the person's, from the row's source`, async () => {
    const recipe = person[row.id];
    if (recipe.setup) { await recipe.setup(); await sleep(250); }
    const change = await oneChange(`${row.id} by hand`, recipe.run);
    matches(`${row.id} by hand`, change, {row: row.id, author: PERSON, source: recipe.source, reason: undefined});
    if (recipe.after) await recipe.after();
    if (await evaluate(`document.querySelector('#modal-root').children.length`)) await closeDialogs();
  });
}

/* ---- what the person does with their hands is still theirs ---- */

check('the person’s ⌘Z and ⌘⇧Z are theirs', async () => {
  matches('⌘Z', await oneChange('⌘Z', () => presses('z', 4)), {row: 'edit.undo', author: PERSON, source: 'undo'});
  matches('⌘⇧Z', await oneChange('⌘⇧Z', () => presses('z', 4 | 8)), {row: 'edit.redo', author: PERSON, source: 'redo'});
});

check('the person’s hand edit in the inspector is theirs', async () => {
  await select('hero');
  matches('hand edit', await oneChange('hand edit', () => typeInto('[data-field="text"]', 'Edited by hand')), {row: 'edit.text', author: PERSON, source: 'editor:change'});
});

check('a component the person drops from the catalog onto the page is theirs', async () => {
  // A trusted native drop, as the catalog's own dragstart would carry it.
  await frameInView();
  const to = await at('.space-frame.active .block-wrap[data-block-id]:not(.selected)');
  const data = {items: [{mimeType: 'application/aphrodite-component', data: 'cta'}], dragOperationsMask: 1};
  matches('drop', await oneChange('drop', async () => {
    for (const type of ['dragEnter', 'dragOver', 'drop']) await send('Input.dispatchDragEvent', {type, x: to.x, y: to.y, data});
  }), {row: 'edit.add', author: PERSON, source: 'catalog:drop'});
});

check('a component the person drags to another place on the canvas is theirs', async () => {
  await frameInView();
  const target = await select(0);
  await select(1);
  await frameInView();
  const from = await at('.editor-selection [data-handle="move"]');
  const to = await at(`.space-frame.active .block-wrap[data-block-id="${target}"]`);
  matches('pointer move', await oneChange('pointer move', () => drag(from, to, 12)), {row: 'edit.layout', author: PERSON, source: 'pointer:move'});
});

check('a layer the person drags to a new place is theirs', async () => {
  await evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'tab'; b.dataset.tab = 'layers'; document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
  await sleep(300);
  const grips = await evaluate(`[...document.querySelectorAll('[data-layer-grip]')].slice(1, 3).map(g => { g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height}; })`);
  assert.equal(grips.length, 2, 'two layers to reorder');
  matches('layer reorder', await oneChange('layer reorder', () => drag(grips[0], {x: grips[1].x, y: grips[1].y + grips[1].h * 0.4})), {row: 'edit.move', author: PERSON, source: 'layer:move'});
});

await runChecks(checks, close);
