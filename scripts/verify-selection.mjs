/**
 * Selecting is not editing: a click on a section must leave the canvas where it is.
 *
 * On 2026-11-18 one real mouse click on a section replaced `.space-frame.active` and removed 254
 * nodes, because every change of selection went through a full render(). The person saw the page
 * flash on each click. This drives the browser build with trusted mouse events (CDP), marks the
 * frame object before each gesture, and counts what leaves the canvas.
 *
 *   node scripts/verify-selection.mjs
 */
import assert from 'node:assert/strict';
import {openApp, runChecks, sleep, waitFor} from './lib/headless.mjs';

const {evaluate, send, agent, personClicks, close} = await openApp({port: 4201, cdp: 9361, profile: '/tmp/aphrodite-selection-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
await personClicks('welcome-sample');
await waitFor(() => evaluate('!!document.querySelector(".space-frame.active [data-block-id]")'), 'the sample canvas');
await sleep(800);

const mouse = async (type, p, buttons = 0) => send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', buttons, clickCount: 1});
const click = async p => { await mouse('mouseMoved', p); await mouse('mousePressed', p, 1); await mouse('mouseReleased', p); await sleep(400); };
const drag = async (from, to, steps = 6) => {
  await mouse('mouseMoved', from); await mouse('mousePressed', from, 1);
  for (let i = 1; i <= steps; i++) await mouse('mouseMoved', {x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps}, 1);
  await mouse('mouseReleased', to); await sleep(400);
};
const blocks = () => evaluate(`Array.from(document.querySelectorAll('.space-frame.active .block-wrap[data-block-id]')).filter(e => !e.parentElement.closest('.block-wrap')).map(e => e.dataset.blockId)`);
/** A point inside the block, clear of the selection chrome that sits on its edges. */
const inside = id => evaluate(`(() => { const r = document.querySelector('[data-block-id="${id}"]').getBoundingClientRect(); return {x: r.left + r.width * 0.3, y: r.top + Math.min(r.height / 2, 60)}; })()`);
/**
 * Marks the active frame and starts counting. `canvas` is every element that left #canvas-scroll,
 * descendants included; `app` is the 11/18 measurement (top-level removed nodes anywhere in #app),
 * kept so the before and after numbers compare like with like.
 */
const watch = () => evaluate(`(() => {
  window.__watch?.disconnect();
  window.__removed = {canvas: 0, app: 0};
  const inCanvas = n => n.nodeType === 1 && (n.closest('#canvas-scroll') || n.querySelector('#canvas-scroll'));
  window.__watch = new MutationObserver(ms => { for (const m of ms) for (const n of m.removedNodes) {
    window.__removed.app++;
    if (n.nodeType !== 1) continue;
    if (m.target.closest?.('#canvas-scroll')) window.__removed.canvas += 1 + n.querySelectorAll('*').length;
    else if (inCanvas(n)) window.__removed.canvas += (n.matches('#canvas-scroll') ? 1 : 0) + n.querySelectorAll('#canvas-scroll, #canvas-scroll *').length;
  } });
  window.__watch.observe(document.querySelector('#app'), {childList: true, subtree: true});
  document.querySelector('.space-frame.active').__mark = (window.__markN = (window.__markN || 0) + 1);
  return window.__markN; })()`);
const seen = mark => evaluate(`({...window.__removed, kept: document.querySelector('.space-frame.active')?.__mark === ${mark}})`);
const selectedId = () => evaluate(`document.querySelector('#app').dataset.selectedId`);
const ledgerSeq = async () => (await agent('changes', {include_view: true, limit: 200})).seq;
const result = {};

check('a click on a section selects it and leaves the canvas in place', async () => {
  const [, second] = await blocks();
  const before = await ledgerSeq();
  const mark = await watch();
  await click(await inside(second));
  const got = await seen(mark);
  result.click = got;
  assert.equal(await selectedId(), second, 'the section is selected');
  assert.equal(got.kept, true, 'the active frame is the same object');
  assert.equal(got.canvas, 0, `nothing left the canvas (removed ${got.canvas})`);
  assert.equal(await ledgerSeq(), before, 'selecting wrote nothing to the ledger, not even a view change');
});

check('the selection shows on the section, in the inspector, and to an agent', async () => {
  const id = await selectedId();
  const marked = await evaluate(`Array.from(document.querySelectorAll('.block-wrap.selected')).map(e => e.dataset.blockId)`);
  assert.deepEqual(marked, [id], 'only the clicked section carries the selected mark');
  const title = await evaluate(`document.querySelector('[data-field="title"]')?.value ?? null`);
  const contract = await agent('contract', {});
  assert.equal(contract.selection?.block_id, id, 'the contract names the selection');
  assert.notEqual(title, null, 'the inspector shows the selected section\'s fields');
  assert.doesNotMatch(await evaluate(`document.querySelector('#editor-state').textContent`), /선택 없음|No selection/, 'the status line says what is selected');
  assert.equal(await evaluate(`!document.querySelector('.editor-selection').hidden`), true, 'the selection outline is up');
  assert.equal(await evaluate(`!!document.querySelector('.editor-selection [data-handle="se"]')`), true, 'with its handles');
});

check('another click moves the selection, still in place', async () => {
  const [, second, third] = await blocks();
  const mark = await watch();
  await click(await inside(third));
  const got = await seen(mark);
  assert.equal(await selectedId(), third);
  assert.notEqual(third, second);
  assert.equal(got.kept, true);
  assert.equal(got.canvas, 0, `removed ${got.canvas}`);
});

check('a click on empty space clears the selection in place', async () => {
  const empty = await evaluate(`(() => { const s = document.querySelector('#canvas-scroll').getBoundingClientRect(); const frames = Array.from(document.querySelectorAll('.space-frame')).map(f => f.getBoundingClientRect());
    for (let y = s.top + 20; y < s.bottom - 20; y += 10) for (let x = s.left + 20; x < s.right - 20; x += 10) {
      if (frames.some(r => x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 40 && y <= r.bottom + 8)) continue;
      const hit = document.elementFromPoint(x, y); if (hit && (hit.id === 'canvas-scroll' || hit.id === 'space-world')) return {x, y}; }
    return null; })()`);
  assert.ok(empty, 'found a point of empty space');
  const before = await ledgerSeq();
  const mark = await watch();
  await click(empty);
  const got = await seen(mark);
  assert.equal(await selectedId(), '', 'nothing is selected');
  assert.equal(got.kept, true);
  assert.equal(got.canvas, 0, `removed ${got.canvas}`);
  assert.equal(await ledgerSeq(), before);
  result.emptySpace = empty;
});

check('a marquee selects the section it covers, in place', async () => {
  const [first] = await blocks();
  const r = await evaluate(`(() => { const f = document.querySelector('.space-frame.active').getBoundingClientRect(); const b = document.querySelector('[data-block-id="${first}"]').getBoundingClientRect(); return {fl: f.left, bt: b.top, bb: b.bottom, bl: b.left}; })()`);
  const from = {x: r.fl - 30, y: r.bt + 10};
  const hit = await evaluate(`document.elementFromPoint(${from.x}, ${from.y})?.id ?? ''`);
  assert.ok(['canvas-scroll', 'space-world'].includes(hit), `the marquee starts on empty space (${hit})`);
  const mark = await watch();
  await drag(from, {x: r.bl + 200, y: Math.min(r.bb - 10, r.bt + 60)});
  const got = await seen(mark);
  assert.equal(await selectedId(), first);
  assert.equal(got.kept, true);
  assert.equal(got.canvas, 0, `removed ${got.canvas}`);
});

check('a field being edited in the inspector is saved before the selection moves', async () => {
  const [first, second] = await blocks();
  assert.equal(await selectedId(), first);
  const before = await ledgerSeq();
  const focused = await evaluate(`(() => { const t = document.querySelector('[data-field="title"]'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return document.activeElement === t; })()`);
  assert.equal(focused, true);
  await send('Input.insertText', {text: ' 수정'});
  await sleep(200);
  await click(await inside(second));
  assert.equal(await selectedId(), second, 'the click still selects');
  const {changes} = await agent('changes', {since: before, limit: 50});
  assert.equal(changes.length, 1, JSON.stringify(changes));
  assert.equal(changes[0].author.kind, 'person');
  assert.equal(JSON.stringify(changes[0].ops).includes(' 수정'), true, 'the edit landed on the block it was typed into');
  assert.equal(JSON.stringify(changes[0].ops).includes(first), true);
});

check('a press that wobbles on the section next to the selected one does not resize anything', async () => {
  const [first, second] = await blocks();
  await click(await inside(first));
  assert.equal(await selectedId(), first);
  const before = await ledgerSeq();
  // The selected block's bottom handle straddles its edge, so its lower half lies over the next section.
  const p = await evaluate(`(() => { const a = document.querySelector('[data-block-id="${first}"]').parentElement.getBoundingClientRect(); const b = document.querySelector('[data-block-id="${second}"]').getBoundingClientRect(); return {x: a.left + a.width / 2, y: b.top + 6}; })()`);
  result.wobbleTarget = await evaluate(`document.elementFromPoint(${p.x}, ${p.y})?.dataset.handle ?? 'section'`);
  await drag(p, {x: p.x, y: p.y + 6}, 3);
  const {changes} = await agent('changes', {since: before, limit: 50});
  result.wobble = {pressedOn: result.wobbleTarget, changes: changes.map(c => c.source), selected: await selectedId()};
  assert.deepEqual(changes.map(c => c.source), [], 'a 6px wobble is a click, not a resize');
  assert.equal(await selectedId(), second, 'and the click selects the section it landed on');
});

check('a deliberate drag on a handle still resizes', async () => {
  const [, second] = await blocks();
  assert.equal(await selectedId(), second);
  const before = await ledgerSeq();
  const p = await evaluate(`(() => { const r = document.querySelector('.editor-selection [data-handle="s"]').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
  await drag(p, {x: p.x, y: p.y + 40}, 8);
  const {changes} = await agent('changes', {since: before, limit: 50});
  assert.deepEqual(changes.map(c => c.source), ['pointer:resize']);
});

checks.push(['(numbers)', async () => { console.log('       ' + JSON.stringify(result)); }]);
await runChecks(checks, close);
