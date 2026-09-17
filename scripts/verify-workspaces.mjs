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
  const first = await evaluate(`(() => { const b=[...document.querySelectorAll('[data-action="ws-switch"]')].find(x=>!x.matches('[aria-current="true"]')); return b?.dataset.id ?? ''; })()`);
  assert.ok(first, 'there is another workspace to switch to');
  await clickData('ws-switch', {id: first});
  await sleep(600);
  const ids = await evaluate(`[...document.querySelectorAll('#project-grid h3')].map(h=>h.textContent.trim()).join('|')`);
  assert.match(ids, /First/, 'the first workspace has its project back');
  assert.doesNotMatch(ids, /Second/);
});

/* Deleting a workspace is the one place a project changes hands. Nothing may be lost in it. */
check('deleting a workspace hands its projects to a sibling rather than dropping them', async () => {
  const other = await evaluate(`(() => { const b=[...document.querySelectorAll('[data-action="ws-switch"]')].find(x=>!x.matches('[aria-current="true"]')); return b?.dataset.id ?? ''; })()`);
  await clickData('ws-delete-confirm', {id: other});
  await sleep(800);
  await personClicks('home');
  await sleep(500);
  const ids = await evaluate(`[...document.querySelectorAll('#project-grid h3')].map(h=>h.textContent.trim()).join('|')`);
  assert.match(ids, /First/, 'the surviving workspace keeps its own');
  assert.match(ids, /Second/, 'and receives the deleted workspace\'s project instead of losing it');
});

await runChecks(checks, close);
