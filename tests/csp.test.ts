/**
 * 0.3-P2: the app's own policy comes from one place (src/csp.mjs) for the desktop app and the browser
 * build, and frame-src is narrow in both: a free page cannot send its frame to an address outside.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appPolicy} from '../src/csp.mjs';
import config from '../vite.config.ts';

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
