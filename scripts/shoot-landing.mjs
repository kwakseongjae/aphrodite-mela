/**
 * Full-page screenshots of the landing page, in both languages.
 *
 * `chrome --screenshot` hangs here: the page pulls a webfont and asks GitHub for the latest release,
 * and headless waits on both. Driving it over CDP lets us reload with a language pinned, wait for the
 * DOM rather than the network, and capture beyond the viewport.
 *
 *   node scripts/shoot-landing.mjs <out-dir>
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {openPage, sleep} from './lib/headless.mjs';

const out = resolve(process.argv[2] ?? 'lab/landing-shots');
mkdirSync(out, {recursive: true});
const page = `file://${resolve('site/index.html')}`;

const {evaluate, send, close} = await openPage(page, {cdp: 9351, profile: '/tmp/aphrodite-shot'});
try {
  for (const lang of ['en', 'ko']) {
    // Width first, then reload, then measure. Measuring before the override reads the headless
    // default of 756px, and the page answers with its own narrow layout — a true screenshot of a
    // size nobody asked for.
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 2, mobile: false,
    });
    await evaluate(`(() => { try { localStorage.setItem('aphrodite.lang', ${JSON.stringify(lang)}); } catch {} })()`);
    await evaluate('location.reload()');
    await sleep(1500);
    const {w, h} = JSON.parse(await evaluate(
      `JSON.stringify({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})`));
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: h, deviceScaleFactor: 2, mobile: false,
    });
    await sleep(500);
    const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
    const data = shot.result?.data;
    if (!data) throw new Error(`no image came back for ${lang}`);
    const file = join(out, `landing-${lang}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`  ${lang}: ${w}×${h} → ${file}`);

    // Individual sections too. A 6000px page is not something anyone reviews; a section is.
    for (const sel of ['.keeps', '.leaves']) {
      const box = JSON.parse(await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return 'null';
        const r = el.getBoundingClientRect();
        return JSON.stringify({x: 0, y: Math.round(r.top + scrollY), width: 1440, height: Math.round(r.height)});
      })()`));
      if (!box) continue;
      const cut = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true, clip: {...box, scale: 1.5},
      });
      const name = join(out, `${sel.slice(1)}-${lang}.png`);
      writeFileSync(name, Buffer.from(cut.result.data, 'base64'));
      console.log(`      ${sel} → ${name}`);
    }
    await send('Emulation.clearDeviceMetricsOverride');
  }
} finally { close(); }
