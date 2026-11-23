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
