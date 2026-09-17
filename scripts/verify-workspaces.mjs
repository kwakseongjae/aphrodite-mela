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

const {evaluate, personClicks, personSubmits, presses, close} =
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

await runChecks(checks, close);
