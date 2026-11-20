/**
 * 0.3-P2: the app's own policy comes from one place (src/csp.mjs) for the desktop app and the browser
 * build, and frame-src is narrow in both: a free page cannot send its frame to an address outside.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appPolicy} from '../src/csp.mjs';
import config from '../vite.config.ts';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const directives = (csp: string) => new Map(csp.split(';').map(d => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));

test('the desktop app runs under the policy src/csp.mjs gives it', () => {
  const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.equal(conf.app.security.csp, appPolicy('desktop'));
});

test('the browser build is served with the policy src/csp.mjs gives it', () => {
  const resolved = config as {preview?: {headers?: Record<string, string>}};
  assert.equal(resolved.preview?.headers?.['Content-Security-Policy'], appPolicy('browser'));
});

test('a frame may be sent to the asset protocol on the desktop, and nowhere in the browser build', () => {
  assert.deepEqual(directives(appPolicy('desktop')).get('frame-src'), ['asset:', 'http://asset.localhost']);
  assert.deepEqual(directives(appPolicy('browser')).get('frame-src'), ["'none'"]);
});

test('only the browser build allows inline scripts, which a srcdoc frame needs to run its own', () => {
  assert.deepEqual(directives(appPolicy('desktop')).get('script-src'), ["'self'"]);
  assert.deepEqual(directives(appPolicy('browser')).get('script-src'), ["'self'", "'unsafe-inline'"]);
});

test('board media plays: the app may load media from the asset protocol and blob: URLs', () => {
  for (const target of ['desktop', 'browser'] as const) {
    const media = directives(appPolicy(target)).get('media-src') ?? [];
    for (const source of ['asset:', 'http://asset.localhost', 'blob:', 'data:']) assert.ok(media.includes(source), `${target}: ${source}`);
  }
});

/* 0.3-P2-fix1: the browser bundle may be put on any static server, so it carries the policy in its own
   index.html. The desktop bundle does not: Tauri gives the window its policy, and two policies would both
   apply, which closes the asset frames. Both bundles are built here and read. */
test('the browser bundle carries the policy in its index.html, and the desktop bundle does not', () => {
  const vite = new URL('../node_modules/.bin/vite', import.meta.url).pathname;
  const root = mkdtempSync(join(tmpdir(), 'aphrodite-csp-'));
  try {
    const built = (env: Record<string, string>, out: string) => {
      const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('TAURI_ENV_')));
      const run = spawnSync(vite, ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {cwd: new URL('..', import.meta.url).pathname, env: {...base, ...env}, encoding: 'utf8'});
      assert.equal(run.status, 0, run.stderr);
      return readFileSync(join(out, 'index.html'), 'utf8');
    };
    const browser = built({}, join(root, 'browser'));
    const metas = browser.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g) ?? [];
    assert.equal(metas.length, 1);
    assert.equal(metas[0], `<meta http-equiv="Content-Security-Policy" content="${appPolicy('browser')}">`);
    assert.ok(browser.indexOf(metas[0]) < browser.indexOf('<script'), 'before any script');
    const desktop = built({TAURI_ENV_PLATFORM: 'darwin'}, join(root, 'desktop'));
    assert.doesNotMatch(desktop, /Content-Security-Policy/);
  } finally { rmSync(root, {recursive: true}); }
});
