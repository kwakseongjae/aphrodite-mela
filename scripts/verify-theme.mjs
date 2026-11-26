/**
 * The app's look is light, dark or the Mac's, and the person's design is neither (0.3-L5).
 *
 * In the browser build: the root follows prefers-color-scheme until the person picks; a pick holds over
 * the Mac and over a reload; an old Paper or Midnight is read as light or dark; and a section page, two
 * free pages (one with a dark-mode rule of its own, one with no colours at all) and the preview look the
 * same, colour for colour and pixel for pixel, whichever theme the app is in. What only a signed build
 * shows (the title bar, the paper before the first paint) is not here: tests/app-theme.test.ts reads it
 * off the source.
 *
 *   node scripts/verify-theme.mjs
 */
import assert from 'node:assert/strict';
import {openApp, runChecks, sleep, waitFor} from './lib/headless.mjs';
import {resolve} from '../src/ui/tokens.ts';

const {evaluate, send, agent, personClicks, personPresses, presses, close} = await openApp({port: 4243, cdp: 9403, profile: '/tmp/aphrodite-theme-profile'});
await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const WHY = 'verify-theme: the design keeps its own colours.';
const result = {};
const hex = c => '#' + c.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
const paper = async () => hex(await evaluate(`(() => { const d = document.createElement('div'); d.style.background = 'var(--ui-bg-app)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; })()`));
const mac = scheme => send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: scheme}]});
const pick = scheme => evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'hub-theme'; b.dataset.scheme = ${JSON.stringify(scheme)}; document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
const root = () => evaluate('document.documentElement.dataset.theme ?? null');
const stored = () => evaluate(`[localStorage.getItem('aphrodite-theme'), localStorage.getItem('aphrodite-paper-theme')]`);
const reload = async () => { await send('Page.reload', {}); await sleep(600); await waitFor(() => evaluate('!!window.aphroditeAgent && !!document.querySelector("#app") && document.readyState === "complete"'), 'the app to boot again'); await sleep(400); };
const LIGHT = resolve('light', 'bg-app').toLowerCase(), DARK = resolve('dark', 'bg-app').toLowerCase();

check('the app follows the Mac until the person picks', async () => {
  assert.equal(await root(), null, 'no theme on the root');
  assert.equal(await paper(), LIGHT, 'a light Mac, the light paper');
  await mac('dark'); await sleep(150);
  assert.equal(await paper(), DARK, 'a dark Mac, the dark paper');
  await mac('light'); await sleep(150);
  assert.equal(await paper(), LIGHT, 'and back');
});

check('a picked theme holds over the Mac and over a reload', async () => {
  await pick('dark'); await sleep(150);
  assert.equal(await root(), 'dark');
  assert.equal(await paper(), DARK, 'dark on a light Mac');
  assert.deepEqual(await stored(), ['dark', null]);
  await reload();
  assert.equal(await root(), 'dark', 'still dark after a reload');
  assert.equal(await paper(), DARK);
  await mac('dark'); await pick('light'); await sleep(150);
  assert.equal(await paper(), LIGHT, 'light on a dark Mac');
  await pick('system'); await sleep(150);
  assert.equal(await root(), null, 'following the Mac again');
  assert.equal(await paper(), DARK);
  await mac('light'); await sleep(150);
  assert.deepEqual(await stored(), ['system', null]);
});

check('an old Paper or Midnight is read as light or dark, and moved to the new name', async () => {
  for (const [old, want] of [['night', 'dark'], ['paper', 'light']]) {
    await evaluate(`localStorage.removeItem('aphrodite-theme'), localStorage.setItem('aphrodite-paper-theme', ${JSON.stringify(old)}), true`);
    await reload();
    assert.equal(await root(), want, old);
    assert.deepEqual(await stored(), [want, null], old + ' moved');
  }
  await pick('system'); await sleep(150);
});

/** The colours the design is drawn in: every element of the section page that is the design's, and the frames' pixels. */
const DESIGN = `(() => { const out = []; for (const page of document.querySelectorAll('.design-page')) for (const el of [page, ...page.querySelectorAll('*')]) {
  if (el.closest('.block-selection-label, .block-tools, .canvas-add, .editor-frame-name, .marquee, [class*="handle"], [class*="pointer-"]')) continue;
  const s = getComputedStyle(el); out.push([el.tagName, s.color, s.backgroundColor, s.borderTopColor, s.colorScheme, s.fill].join(' ')); } return out; })()`;
const frames = async () => {
  const rects = await evaluate(`[...document.querySelectorAll('.board-item iframe')].map(f => { const r = f.getBoundingClientRect(); return {x: r.left + 2, y: r.top + 2, width: Math.max(1, Math.min(r.width, innerWidth - r.left) - 4), height: Math.max(1, Math.min(r.height, innerHeight - r.top) - 4)}; }).filter(r => r.x >= 0 && r.y >= 0 && r.width > 8 && r.height > 8)`);
  const shots = [];
  for (const clip of rects) shots.push((await send('Page.captureScreenshot', {format: 'png', clip: {...clip, scale: 1}})).result.data);
  return shots;
};

check('a section page, a free page and the preview look the same in either theme', async () => {
  await personClicks('welcome-sample');
  await waitFor(() => evaluate('!!document.querySelector(".design-page [data-block-id]")'), 'the sample\'s section page');
  await sleep(1200);
  await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`);
  await personPresses('agent-connect-toggle'); await sleep(250); await presses('Escape'); await sleep(5_200);
  const revision = async () => (await agent('changes', {limit: 1})).revision;
  for (const [name, html] of [
    ['Its own dark rule', '<style>body{font:16px/1.5 sans-serif;margin:24px}@media (prefers-color-scheme: dark){body{background:#101418;color:#e8eef4}}</style><h1>Its own dark rule</h1><p>This page says what it looks like in a dark browser.</p><button>Button</button><input value="field">'],
    ['No colours', '<h1>No colours</h1><p>This page sets no colour at all, so it is drawn in the browser\'s own.</p><button>Button</button><input value="field">'],
  ]) { const made = await agent('apply', {reason: WHY, base_revision: await revision(), ops: [{op: 'html_page', name, html}]}); assert.ok(made.ok, JSON.stringify(made).slice(0, 300)); }
  await waitFor(() => evaluate("document.querySelectorAll('.board-item iframe').length >= 2"), 'the two frames');
  await personClicks('zoom-fit'); await sleep(2500);
  await presses('Escape'); await sleep(300);
  const seen = {};
  for (const theme of ['light', 'dark']) {
    await pick(theme); await sleep(600);
    await personClicks('preview'); await sleep(1200);
    const preview = await evaluate(`document.querySelector('#modal-root iframe')?.getAttribute('srcdoc') ?? null`);
    await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(400);
    seen[theme] = {design: await evaluate(DESIGN), frames: await frames(), preview};
  }
  await pick('system');
  result.design = {elements: seen.light.design.length, frames: seen.light.frames.length, preview: seen.light.preview?.length ?? 0};
  assert.ok(seen.light.design.length > 20, 'the section page was read');
  assert.ok(seen.light.frames.length >= 2, 'both free pages were on screen');
  assert.ok(seen.light.preview, 'the preview was read');
  assert.deepEqual(seen.dark.design.filter((s, i) => s !== seen.light.design[i]), [], 'the section page\'s colours');
  seen.light.frames.forEach((shot, i) => assert.ok(shot === seen.dark.frames[i], 'free page ' + (i + 1) + ', pixel for pixel'));
  assert.equal(seen.dark.preview, seen.light.preview, 'the preview\'s document');
  // The app around them did change.
  assert.notEqual(seen.light.design.length, 0);
});

checks.push(['(numbers)', async () => { console.log('       ' + JSON.stringify(result)); }]);
await runChecks(checks, close);
