import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/* 0.3-P3-fix1 #9: the app's own screens are light whatever the Mac is set to, and the ui- parts follow the rest of the
   app until there is a theme setting (F3: then this becomes that setting's value). The gallery keeps its own switch. */
test('the app document is the light theme, and the ui gallery still switches', () => {
  const app = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /<html\b[^>]*\sdata-theme="light"[^>]*>/, 'index.html fixes the light theme');
  const gallery = readFileSync(new URL('../ui-gallery.html', import.meta.url), 'utf8');
  assert.doesNotMatch(gallery, /<html\b[^>]*data-theme=/, 'the gallery sets its theme from its own picker');
  assert.match(gallery, /data-theme-pick="dark"/);
});

/* 0.3-L4 ③: before the page has painted, the window and the browser bar show the paper the app is drawn on, not the old grey-green. */
test('the window and the browser bar start on the paper colour the app draws its background with', async () => {
  const {primitives,themes} = await import('../src/ui/tokens.ts');
  const light = themes.light;
  const resolve = (v: string): string => { const m = /^\{(.+)\}$/.exec(v); return m ? resolve((primitives as Record<string,string>)[m[1]]) : v; };
  const paper = resolve((light as Record<string,string>)['bg-app']).toLowerCase();
  const tauri = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  for (const w of tauri.app.windows) assert.equal(String(w.backgroundColor).toLowerCase(), paper, 'tauri.conf.json window backgroundColor');
  const app = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(/<meta name="theme-color" content="([^"]+)"/.exec(app)?.[1].toLowerCase(), paper, 'index.html theme-color');
});
