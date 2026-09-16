import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

/* The window would not close. ⌘W and the red button both ended in "Command plugin:window|destroy
   not allowed by ACL", and the only way out was force-quitting from the Dock — because the app
   called a window command that capabilities/default.json never granted. Nothing failed at build
   time; it failed in the hands of the person using it. This reads the calls out of the source and
   insists the grants keep up. */

const sources = (dir: string): string[] =>
  readdirSync(dir, {withFileTypes: true}).flatMap(e =>
    e.isDirectory() ? (e.name === 'vendor' || e.name === 'generated' ? [] : sources(join(dir, e.name)))
      : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);

const code = sources('src').map(f => readFileSync(f, 'utf8')).join('\n');
const granted: string[] = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8')).permissions;

test('every window command the app calls is one the app is allowed to call',() => {
  // getCurrentWindow().close(), .destroy(), .minimize() … each needs core:window:allow-<name>.
  const called = new Set([...code.matchAll(/getCurrentWindow\(\)\.([a-zA-Z]+)\(/g)].map(m => m[1]));
  called.delete('onCloseRequested');   // an event subscription, not a command
  assert.ok(called.size, 'the scan found no window calls at all, which means it stopped working');
  for (const name of called) {
    const kebab = name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    assert.ok(
      granted.includes(`core:window:allow-${kebab}`) || granted.includes('core:window:default'),
      `src calls getCurrentWindow().${name}() but capabilities/default.json does not allow core:window:allow-${kebab}. ` +
      `A missing grant here is not a build error — it is a window that will not close.`,
    );
  }
});

test('the plugins the app imports are the plugins it is allowed to use',() => {
  const plugins = new Set([...code.matchAll(/@tauri-apps\/plugin-([a-z-]+)/g)].map(m => m[1]));
  for (const plugin of plugins) {
    assert.ok(
      granted.some(p => p.startsWith(`${plugin}:`)),
      `src imports @tauri-apps/plugin-${plugin} but no ${plugin}: permission is granted`,
    );
  }
});
