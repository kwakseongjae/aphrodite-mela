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
/** The person's own press on what is on screen: a trusted mouse event at the middle of the element. */
const pressOn = async selector => {
  const p = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return null; b.scrollIntoView({block: 'nearest'}); const r = b.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
  assert.ok(p, 'on screen: ' + selector);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1});
  await sleep(250);
};
const openDetails = selector => evaluate(`(() => { const d = document.querySelector(${JSON.stringify(selector)}); if (!d) return false; d.open = true; return true; })()`);
const checked = selector => evaluate(`[...document.querySelectorAll(${JSON.stringify(selector + ' [data-scheme]')})].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.scheme)`);

check('the app follows the Mac until the person picks', async () => {
  assert.equal(await root(), null, 'no theme on the root');
  assert.equal(await paper(), LIGHT, 'a light Mac, the light paper');
  await mac('dark'); await sleep(150);
  assert.equal(await paper(), DARK, 'a dark Mac, the dark paper');
  await mac('light'); await sleep(150);
  assert.equal(await paper(), LIGHT, 'and back');
});

check('the script that picks the theme before the first paint is in the built page and is served', async () => {
  const {readFileSync} = await import('node:fs');
  assert.match(readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), /<script src="\/theme\.js"><\/script>[\s\S]*<link rel="stylesheet"/, 'dist/index.html loads /theme.js before its sheets');
  const served = await evaluate("fetch('/theme.js').then(r => r.status + ' ' + r.headers.get('content-type'))");
  assert.match(served, /^200 .*javascript/, 'the preview server serves it: ' + served);
});

check('a picked theme holds over the Mac and over a reload', async () => {
  // Home's theme menu, pressed by the person, once the first-launch sheet is out of the way
  await personClicks('welcome-dismiss'); await sleep(300); await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(300);
  assert.ok(await openDetails('details.folio-theme'), 'home has a theme menu');
  await pressOn('details.folio-theme [data-scheme="dark"]'); await sleep(150);
  assert.equal(await root(), 'dark', 'home\'s menu picks dark');
  assert.deepEqual(await checked('details.folio-theme'), ['dark'], 'and marks it');
  const metas = () => evaluate(`[...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content.toLowerCase())`);
  assert.deepEqual(await metas(), [DARK, DARK], 'the browser bar takes the picked paper');
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
  assert.deepEqual(await metas(), [LIGHT, DARK], 'and each bar colour answers its own Mac setting again');
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

check('a pick kept by another tab is shown here, and following the Mac again too', async () => {
  const told = scheme => evaluate(`(() => { localStorage.setItem('aphrodite-theme', ${JSON.stringify(scheme)}); window.dispatchEvent(new StorageEvent('storage', {key: 'aphrodite-theme', newValue: ${JSON.stringify(scheme)}})); return true; })()`);
  await told('dark'); await sleep(200);
  assert.equal(await root(), 'dark', 'the other tab\'s dark');
  await told('system'); await sleep(200);
  assert.equal(await root(), null, 'and its following the Mac');
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
    await evaluate(`(() => { const f = document.querySelector('.board-item iframe'); f.dataset.l5 = 'kept'; return true; })()`);
    if (theme === 'dark') {
      // The Mac goes dark as well: the design must answer neither.
      await mac('dark'); await sleep(200);
      assert.ok(await openDetails('details.help-fab'), 'the editor has a help menu');
      await pressOn('details.help-fab [data-theme-menu] [data-scheme="dark"]'); await sleep(300);
      assert.deepEqual(await checked('details.help-fab [data-theme-menu]'), ['dark'], 'the help menu marks the pick in place');
      await evaluate(`document.querySelector('details.help-fab').open = false, true`);
    } else {
      await personClicks('commands'); await sleep(500);
      await evaluate(`(() => { const i = document.querySelector('#command-search'); i.value = '테마'; i.dispatchEvent(new Event('input', {bubbles: true})); return true; })()`); await sleep(400);
      await pressOn('#modal-root [data-action="hub-theme"][data-scheme="light"]'); await sleep(500);
      await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(300);
    }
    assert.equal(await root(), theme, 'picked ' + theme + ' by the person');
    assert.equal(await evaluate(`document.querySelector('.board-item iframe')?.dataset.l5 ?? null`), 'kept', 'the board was not drawn again: its frames are the same');
    await sleep(600);
    await personClicks('preview'); await sleep(1200);
    const preview = await evaluate(`document.querySelector('#modal-root iframe')?.getAttribute('srcdoc') ?? null`);
    await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(400);
    await personClicks('export'); await sleep(900);
    await evaluate(`document.querySelector('#modal-root [data-action="export-tab"][data-view="html"]')?.click(), true`); await sleep(600);
    const code = await evaluate(`document.querySelector('#modal-root .export-code')?.textContent ?? null`);
    await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(400);
    await personClicks('component-explorer'); await sleep(1200);
    await evaluate(`document.querySelector('#modal-root [data-action="explorer-kind-pick"][data-kind="hero"]')?.click(), true`); await sleep(2500);
    const catalog = [];
    for (const clip of await evaluate(`[...document.querySelectorAll('#modal-root .explorer-preview')].slice(0, 2).map(e => { const r = e.getBoundingClientRect(); return {x: r.left + 2, y: r.top + 2, width: r.width - 4, height: r.height - 4}; }).filter(r => r.width > 8 && r.height > 8 && r.y + r.height < innerHeight)`))
      catalog.push((await send('Page.captureScreenshot', {format: 'png', clip: {...clip, scale: 1}})).result.data);
    await evaluate(`document.querySelector('[data-action="close-modal"]')?.click(), true`); await sleep(400);
    seen[theme] = {design: await evaluate(DESIGN), frames: await frames(), preview, code, catalog, paper: await paper()};
  }
  await pick('system'); await mac('light');
  result.design = {elements: seen.light.design.length, frames: seen.light.frames.length, preview: seen.light.preview?.length ?? 0};
  assert.ok(seen.light.design.length > 20, 'the section page was read');
  assert.notEqual(seen.light.paper, seen.dark.paper, 'the app around them did change');
  assert.ok(seen.light.code && seen.light.code.includes('<html') && seen.light.code.length > 500, 'the exported index.html was read');
  assert.equal(seen.dark.code, seen.light.code, 'the exported index.html');
  assert.ok(seen.light.catalog.length >= 2, 'the catalog showed its previews');
  assert.equal(seen.dark.catalog.length, seen.light.catalog.length, 'as many catalog previews in both');
  seen.light.catalog.forEach((shot, i) => assert.ok(shot === seen.dark.catalog[i], 'catalog preview ' + (i + 1) + ', pixel for pixel'));
  assert.ok(seen.light.frames.length >= 2, 'both free pages were on screen');
  assert.equal(seen.dark.frames.length, seen.light.frames.length, 'as many free pages in both');
  seen.light.frames.forEach((shot, i) => assert.ok(shot === seen.dark.frames[i], 'free page ' + (i + 1) + ', pixel for pixel, its own dark rule unanswered'));
  assert.ok(seen.light.preview, 'the preview was read');
  assert.deepEqual(seen.dark.design, seen.light.design, 'the section page\'s colours, every element');
  assert.ok(seen.light.design.every(s => / light /.test(s)), 'every element of the section page is drawn light');
  assert.equal(seen.dark.preview, seen.light.preview, 'the preview\'s document');
});

checks.push(['(numbers)', async () => { console.log('       ' + JSON.stringify(result)); }]);
await runChecks(checks, close);
