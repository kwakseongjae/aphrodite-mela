/**
 * Workspaces, driven through the interface rather than asserted as functions.
 *
 * The unit tests cover create / rename / filter / counts, and they passed all along — but this
 * morning a taste feature was dead while its unit test was green, because the test supplied an
 * argument the app did not. So this asks the running app the same questions.
 *
 * **This drives the browser build, so it exercises the localStorage fork of `saveLibrary`, not the
 * disk fork the desktop app takes.** The two store different shapes, so a pass here says nothing
 * about disk. `scripts/verify-disk.mjs` is the one that covers the other side.
 *
 *   node scripts/verify-workspaces.mjs
 */
import assert from 'node:assert/strict';
import {openApp, runChecks, sleep} from './lib/headless.mjs';

const {agent, evaluate, personClicks, personPresses, personSubmits, presses, send, close} =
  await openApp({port: 4193, cdp: 9344, profile: '/tmp/aphrodite-ws-check'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

const cards = () => evaluate(`document.querySelectorAll('#project-grid [data-project-id]').length`);
const sidebarCount = () => evaluate(`document.querySelector('.folio-workspace small, .ws-switch small, [data-workspace-count]')?.textContent?.trim() ?? ''`);
const activeName = () => evaluate(`document.querySelector('.folio-workspace strong, .ws-current')?.textContent?.trim() ?? ''`);
/* The switcher renders no aria-current, so a selector that excludes it excludes nothing and picks
   the first button — which may be the active workspace. The book in localStorage is the truth. */
const activeId = () => evaluate(`JSON.parse(localStorage.getItem('aphrodite-workspaces-v1')).activeId`);
const otherId = async () => evaluate(
  `(() => { const b=JSON.parse(localStorage.getItem('aphrodite-workspaces-v1'));
    return (b.workspaces.find(w=>w.id!==b.activeId)||{}).id ?? ''; })()`);
const clickData = (action, data = {}) => evaluate(
  `(() => { const b=document.createElement('button'); b.dataset.action=${JSON.stringify(action)};
    Object.assign(b.dataset, ${JSON.stringify(data)}); document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);

check('a blank start has one workspace and no projects', async () => {
  await personClicks('welcome-blank');
  await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'First'}), true);
  await sleep(700);
  await personClicks('home');
  await sleep(500);
  assert.equal(await cards(), 1, 'the project we just made is listed');
});

check('a second workspace starts empty and hides the first one\'s projects', async () => {
  await personClicks('ws-new');
  await sleep(400);
  assert.equal(await personSubmits('#workspace-form', {name: 'Client work'}), true);
  await sleep(600);
  assert.equal(await cards(), 0, 'a new workspace must not inherit the projects of the old one');
});

check('a project made here belongs here, and only here', async () => {
  await personClicks('new-project');
  await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Second'}), true);
  await sleep(700);
  await personClicks('home');
  await sleep(500);
  assert.equal(await cards(), 1, 'one project in the new workspace');
  const ids = await evaluate(`[...document.querySelectorAll('#project-grid h3')].map(h=>h.textContent.trim()).join('|')`);
  assert.match(ids, /Second/);
  assert.doesNotMatch(ids, /First/, 'the other workspace\'s project must not appear here');
});

check('switching back shows the first workspace\'s projects again', async () => {
  const first = await otherId();
  assert.ok(first, 'there is another workspace to switch to');
  await clickData('ws-switch', {id: first});
  await sleep(600);
  const ids = await evaluate(`[...document.querySelectorAll('#project-grid h3')].map(h=>h.textContent.trim()).join('|')`);
  assert.match(ids, /First/, 'the first workspace has its project back');
  assert.doesNotMatch(ids, /Second/);
});

/* 0.3-P3-fix5 #2: the list of workspaces is stored before any project moves, so a list the browser will not store
   leaves the workspace and its projects as they were, and a reload finds them so. */
check('deleting a workspace whose list cannot be stored keeps the workspace and moves none of its projects, after a reload too', async () => {
  const other = await otherId();
  assert.ok(other, 'a workspace to delete');
  const stored = () => evaluate(`({where: JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => (e.workspaceId ?? 'default') + ':' + e.project.name).sort(), workspaces: JSON.parse(localStorage.getItem('aphrodite-workspaces-v1')).workspaces.map(w => w.id).sort()})`);
  const before = await stored();
  assert.ok(before.where.some(w => w.startsWith(other + ':')), 'it has a project of its own');
  await evaluate(`(() => { const set = Storage.prototype.setItem; window.__restoreSetItem = () => { Storage.prototype.setItem = set; }; Storage.prototype.setItem = function (k, v) { if (k === 'aphrodite-workspaces-v1') throw new Error('quota'); return set.call(this, k, v); }; return true; })()`);
  try { await clickData('ws-delete-confirm', {id: other}); await sleep(800); } finally { await evaluate('window.__restoreSetItem(), true'); }
  assert.deepEqual(await stored(), before, 'the workspace and where each project is are as they were');
  await evaluate('location.reload(), true');
  await sleep(2_500);
  assert.deepEqual(await stored(), before, 'and so after a reload');
  assert.equal(await evaluate('!!document.querySelector("#app")'), true, 'the app is back');
});

/* 0.3-R ⑤ (P3 check6): the projects move first, to a workspace that stays. A library the browser will not store changes
   nothing; a list it will not store, with a library it then will not store either, leaves every project in a workspace
   that is there. */
check('deleting a workspace whose library cannot be stored changes nothing; one whose list and then library cannot be stored strands no project', async () => {
  const other = await otherId();
  const stored = () => evaluate(`({where: JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => (e.workspaceId ?? 'default') + ':' + e.project.name).sort(), workspaces: JSON.parse(localStorage.getItem('aphrodite-workspaces-v1')).workspaces.map(w => w.id).sort()})`);
  const before = await stored();
  const refuse = keys => evaluate(`(() => { const set = Storage.prototype.setItem; let n = 0; window.__restoreSetItem = () => { Storage.prototype.setItem = set; }; Storage.prototype.setItem = function (k, v) { const rule = ${JSON.stringify(keys)}[k]; if (rule !== undefined && (rule === 'always' || n++ >= rule)) throw new Error('quota'); return set.call(this, k, v); }; return true; })()`);
  await refuse({'aphrodite-project-library-v1': 'always'});
  try { await clickData('ws-delete-confirm', {id: other}); await sleep(800); } finally { await evaluate('window.__restoreSetItem(), true'); }
  assert.deepEqual(await stored(), before, 'a library refused: nothing changed');
  // The library is stored once (the move), then refused (putting it back); the list is refused.
  await refuse({'aphrodite-workspaces-v1': 'always', 'aphrodite-project-library-v1': 1});
  try { await clickData('ws-delete-confirm', {id: other}); await sleep(800); } finally { await evaluate('window.__restoreSetItem(), true'); }
  await evaluate('location.reload(), true');
  await sleep(2_500);
  const after = await stored();
  assert.deepEqual(after.workspaces, before.workspaces, 'the workspace is still there');
  assert.ok(after.where.every(w => after.workspaces.includes(w.split(':')[0]) || w.startsWith('default:')), `every project is in a workspace that is there: ${JSON.stringify(after)}`);
  assert.equal(after.where.length, before.where.length, 'and none is lost');
});

/* Deleting a workspace is the one place a project changes hands. Nothing may be lost in it. */
check('deleting a workspace hands its projects to a sibling rather than dropping them', async () => {
  const other = await otherId();
  assert.ok(other, 'the workspace being deleted is the one we are not in');
  await clickData('ws-delete-confirm', {id: other});
  await sleep(800);
  await personClicks('home');
  await sleep(500);
  const ids = await evaluate(`[...document.querySelectorAll('#project-grid h3')].map(h=>h.textContent.trim()).join('|')`);
  assert.match(ids, /First/, 'the surviving workspace keeps its own');
  assert.match(ids, /Second/, 'and receives the deleted workspace\'s project instead of losing it');
});

/**
 * Moving one project, which had no route at all until now: `moveEntries` empties a whole workspace
 * into a sibling and only runs when one is deleted, so a project's workspace was decided when it was
 * made. This drives the menu the person actually uses rather than calling the function.
 */
check('the card menu offers the other workspaces, and not the one it is already in', async () => {
  // Its own destination, so this does not depend on what the delete check left behind.
  await personClicks('ws-new');
  await sleep(400);
  assert.equal(await personSubmits('#workspace-form', {name: 'Archive room'}), true);
  await sleep(600);
  const made = await activeId();
  const back = await otherId();
  await clickData('ws-switch', {id: back});
  await sleep(600);
  assert.ok(await cards() > 0, 'we are back where the projects are');

  const offered = (await evaluate(
    `[...document.querySelectorAll('#project-grid [data-action="hub-move"]')].map(b=>b.dataset.workspace).join('|')`)).split('|');
  assert.ok(offered.includes(made), 'the workspace we just made is offered as a destination');
  assert.ok(!offered.includes(await activeId()), 'the workspace it already lives in is not offered');
});

check('moving a project takes it out of one workspace and puts it in the other', async () => {
  const before = await cards();
  assert.ok(before > 0, 'there is something here to move');
  const name = await evaluate(`document.querySelector('#project-grid h3')?.textContent?.trim() ?? ''`);
  const target = await evaluate(
    `document.querySelector('#project-grid [data-action="hub-move"]')?.dataset?.workspace ?? ''`);
  const id = await evaluate(`document.querySelector('#project-grid [data-project-id]')?.dataset?.projectId ?? ''`);
  assert.ok(target && id, 'a destination and a project to send there');

  await clickData('hub-move', {id, workspace: target});
  await sleep(600);
  assert.equal(await cards(), before - 1, 'it left the workspace it was in');

  await clickData('ws-switch', {id: target});
  await sleep(600);
  const arrived = await evaluate(`[...document.querySelectorAll('#project-grid h3')].map(h=>h.textContent.trim()).join('|')`);
  assert.match(arrived, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'it arrived in the other workspace');
});

check('a project is never lost by moving it', async () => {
  // A move is not a delete: the library still holds every project it held before.
  const total = await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.length`);
  assert.equal(total, 2, 'both projects still exist after the move');
});

/* 0.3-L4b: a new board looks empty, and the section tools come with a section page (src/editor/starter.ts). */
const drawn = () => evaluate(`[...document.querySelectorAll('.space-frame:not([hidden])')].map(f => f.querySelector('.frame-name span')?.textContent)`);
const sectionTools = () => evaluate(`({tabs: !!document.querySelector('.library-tabs'), add: !!document.querySelector('.dock [data-action="component-explorer"]'), media: !!document.querySelector('.dock .dock-slot[data-group="media"]'), system: !!document.querySelector('.system-card')})`);
check('a new board shows no frame and no section tools, and A opens nothing', async () => {
  await clickData('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Empty board'}), true);
  await sleep(900);
  await clickData('tour-skip'); await sleep(300);
  assert.deepEqual(await drawn(), [], 'no frame is drawn');
  assert.equal(await evaluate(`document.querySelectorAll('.pages-list .ui-row').length`), 0, 'and none is listed');
  assert.deepEqual(await sectionTools(), {tabs: false, add: false, media: false, system: false});
  assert.equal(await evaluate(`!!document.querySelector('.board-empty')`), true, 'the board says it is empty and how to fill it');
  await evaluate('document.activeElement?.blur(), true');
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, text: 'a'});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65});
  await sleep(400);
  assert.equal(await evaluate(`document.querySelector('#modal-root').children.length`), 0, 'A, whose button is not there, opens nothing');
});
check('a picture pasted onto a new board is the only thing on it', async () => {
  await send('Emulation.setFocusEmulationEnabled', {enabled: true});
  await send('Browser.grantPermissions', {permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: await evaluate('location.origin')});
  assert.equal(await evaluate(`(async () => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 40, 30); const b = await new Promise(r => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); return true; })()`), true);
  await evaluate('document.activeElement?.blur(), true');
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86, commands: ['paste']});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86});
  for (let i = 0; i < 40 && (await drawn()).length === 0; i++) await sleep(250);
  assert.equal((await drawn()).length, 1, 'one frame: the picture');
  assert.equal(await evaluate(`!!document.querySelector('.space-frame:not([hidden]) .board-media')`), true, 'and it is the picture');
  await sleep(800);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.className || e.tagName)`), [], 'nothing the app hides shows: not the "not on this Mac" line over a picture that is there');
  assert.deepEqual(await sectionTools(), {tabs: false, add: false, media: false, system: false}, 'a picture is no section page');
  assert.equal(await evaluate(`!!document.querySelector('.board-empty')`), false);
});
check('a new frame is drawn, empty, and brings the section tools; deleting its last section keeps it', async () => {
  await clickData('new-frame'); await sleep(300);
  assert.equal(await personSubmits('#frame-form', {name: 'Landing'}), true);
  await sleep(700);
  assert.ok((await drawn()).includes('Landing'), 'the frame is on the board');
  assert.deepEqual(await sectionTools(), {tabs: true, add: true, media: true, system: true});
  await personPresses('add', {kind: 'hero'}); await sleep(500);
  assert.equal(await evaluate(`document.querySelectorAll('#design-canvas [data-block-id]').length`), 1, 'a section went in');
  const added = await evaluate(`document.querySelector('#design-canvas [data-block-id]').dataset.blockId`);
  await personPresses('delete-block', {id: added}); await sleep(500);
  assert.equal(await evaluate(`document.querySelectorAll('#design-canvas [data-block-id]').length`), 0, 'and came out');
  assert.ok((await drawn()).includes('Landing'), 'the frame stays when its last section is deleted');
  assert.equal((await sectionTools()).tabs, true);
});

/* 0.3-L4-3 fix 1: a new board's hidden page, from the board's side (src/editor/starter.ts). */
const pressIn = async selector => {
  const p = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1});
  await sleep(250);
};
const inView = id => evaluate(`(() => { const f = document.querySelector('.space-frame[data-page-id="${id}"]'), s = document.querySelector('#canvas-scroll'); if (!f || f.hidden) return false; const a = f.getBoundingClientRect(), b = s.getBoundingClientRect(); return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom; })()`);
const sideBySide = () => evaluate(`(() => { const r = [...document.querySelectorAll('.space-frame:not([hidden])')].map(f => f.getBoundingClientRect()); return r.length === 2 && (r[0].right <= r[1].left || r[1].right <= r[0].left); })()`);
const newBoard = async name => {
  await clickData('new-project'); await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name}), true);
  await sleep(900); await clickData('tour-skip'); await sleep(300);
};
const BRIEFING = '<!doctype html><html><body><h1>Briefing</h1></body></html>';
check('a new board starts with the camera at its start, wherever the last board was looked at', async () => {
  const at = await evaluate(`(() => { const r = document.querySelector('#canvas-scroll').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
  for (let i = 0; i < 4; i++) await send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: at.x, y: at.y, deltaX: 3000, deltaY: 3000});
  await sleep(700);
  assert.notEqual(await evaluate(`document.querySelector('#app').dataset.camera`), '0,0,1.00', 'the last board was looked at far from its start');
  await newBoard('Agent board');
  assert.equal(await evaluate(`document.querySelector('#app').dataset.camera`), '0,0,1.00');
});
check('the empty board says what can be dropped on it: pictures and videos, not HTML files', async () => {
  assert.doesNotMatch(await evaluate(`document.querySelector('.board-empty')?.textContent ?? ''`), /HTML/);
  assert.match(await evaluate(`document.querySelector('.board-empty')?.textContent ?? ''`), /그림|picture/i);
  assert.doesNotMatch(await evaluate(`document.querySelector('.library-drop')?.textContent ?? ''`), /HTML|파일을|files/i);
});
check('the first page an agent puts on that board is in view', async () => {
  assert.equal((await agent('connect', {}, 'claude-code')).status, 'asked');
  for (let i = 0; i < 20 && !(await evaluate(`!!document.querySelector('#modal-root .ask-modal')`)); i++) await sleep(150);
  await pressIn('#modal-root [data-action="ask-allow"]');
  await sleep(5300);
  const made = await agent('apply', {reason: 'verify-workspaces: a page on a new board.', base_revision: (await agent('changes', {limit: 1})).revision, ops: [{op: 'html_page', name: 'Briefing', html: BRIEFING}]});
  assert.equal(made.ok, true, JSON.stringify(made));
  await sleep(900);
  assert.equal(await inView(made.created_pages[0].page_id), true, 'the page is on screen');
});
check('with the hidden page still the open one, export offers the agent\'s page and preview shows it', async () => {
  const page = await evaluate(`document.querySelector('.space-frame:not([hidden])')?.dataset.pageId`);
  await personPresses('export'); await sleep(500);
  assert.equal(await evaluate(`document.querySelector('#modal-root [data-action="download-page-html"]')?.dataset.id`), page, 'the page in the dialog is the one on the board');
  await personPresses('close-modal'); await sleep(300);
  await personPresses('preview'); await sleep(600);
  assert.match(await evaluate(`document.querySelector('#modal-root .ui-modal-text')?.textContent ?? ''`), /Briefing/);
  await personPresses('close-modal'); await sleep(300);
});
check('a section the agent adds to the open page shows that page beside the agent\'s, not under it', async () => {
  await sleep(5300);
  // No base_revision: a batch sent with one names its page, and this one goes to the page open, the hidden one.
  const added = await agent('apply', {reason: 'verify-workspaces: a section on the open page.', ops: [{op: 'add', component_kind: 'hero'}]});
  assert.equal(added.ok, true, JSON.stringify(added));
  await sleep(800);
  assert.equal(await sideBySide(), true);
});
check('a page added to a new board takes the board\'s first place', async () => {
  await newBoard('Placement board');
  await clickData('add-page'); await sleep(300);
  assert.equal(await personSubmits('#page-form', {name: 'About'}), true);
  await sleep(700);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.space-frame:not([hidden])')].map(f => f.style.left)`), ['0px']);
});
check('Edit in the app, from the hidden page seen on its own, shows it on the board beside the page there', async () => {
  const hidden = await evaluate(`document.querySelector('.space-frame[hidden]')?.dataset.pageId`);
  assert.ok(hidden, 'the board has its hidden page');
  await personPresses('page-view', {id: hidden}); await sleep(500);
  assert.equal(await evaluate(`!!document.querySelector('.page-view')`), true);
  await personPresses('page-view-edit'); await sleep(700);
  assert.equal(await evaluate(`document.querySelector('.space-frame[data-page-id="${hidden}"]')?.hidden`), false, 'the page is on the board');
  assert.equal(await sideBySide(), true);
  assert.equal(await inView(hidden), true, 'and in view');
});
check('a hidden page shown by Edit in the app with nothing in its place is saved shown', async () => {
  await newBoard('Reveal board');
  const hidden = await evaluate(`document.querySelector('.space-frame[hidden]')?.dataset.pageId`);
  const saved = () => evaluate(`(() => { const e = JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.find(e => e.project.name === 'Reveal board'); return e ? e.project.starter ?? null : 'no board'; })()`);
  assert.equal(await saved(), hidden, 'a new board is saved with its mark');
  await personPresses('page-view', {id: hidden}); await sleep(500);
  await personPresses('page-view-edit'); await sleep(900);
  assert.equal(await evaluate(`document.querySelector('.space-frame[data-page-id="${hidden}"]')?.hidden`), false);
  assert.equal(await saved(), null, 'and saved without it once the person has gone to the page');
});

/* 0.3-G2b fix 1 (Astra low 12): the dialog for stored boards that cannot be read, the real way: it opens on its own once,
   Later leaves its mark, and the mark opens it again. */
check('stored boards that cannot be read open their dialog once, Later leaves a mark, and the mark opens it again', async () => {
  const kept = await evaluate(`localStorage.getItem('aphrodite-project-library-v1')`);
  const dialogOpen = () => evaluate(`!!document.querySelector('#modal-root .ui-notice-choices')`);
  try {
    await evaluate(`localStorage.setItem('aphrodite-project-library-v1', '{not json'), true`);
    await evaluate('location.reload(), true');
    await sleep(2_500);
    assert.equal(await dialogOpen(), true, 'it opened on its own');
    assert.equal(await evaluate(`document.activeElement?.dataset.action`), 'hub-recovery', 'starting on keeping the stored files');
    await pressIn('#modal-root [data-action="close-modal"].ui-btn-md');
    assert.equal(await dialogOpen(), false, 'Later put it away');
    assert.equal(await evaluate(`!!document.querySelector('.notice-mark-trouble')`), true, 'and left its mark');
    await pressIn('.notice-mark-trouble');
    assert.equal(await dialogOpen(), true, 'the mark opens it again');
    await pressIn('#modal-root [data-action="close-modal"].ui-btn-md');
  } finally {
    await evaluate(`localStorage.setItem('aphrodite-project-library-v1', ${JSON.stringify(kept)}), true`);
    await evaluate('location.reload(), true');
    await sleep(2_500);
  }
  assert.equal(await evaluate(`!!document.querySelector('.notice-mark-trouble')`), false, 'read again, nothing is wrong');
});

await runChecks(checks, close);
