import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openLink, readOpenLink} from '../src/board-file';

const stable = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const version = '0.3.0-preview.12';

test('the preview override keeps the board format and separates the installed app, links and updates', async () => {
  const {previewConfig} = await import(new URL('../scripts/preview-config.mjs', import.meta.url).href);
  const preview = previewConfig(version);
  assert.equal(stable.identifier, 'studio.aphrodite.mela');
  assert.equal(stable.productName, 'Aphrodite');
  assert.equal(stable.version, JSON.parse(readFileSync('package.json', 'utf8')).version);
  assert.equal(preview.identifier, stable.identifier + '.preview');
  assert.equal(preview.productName, 'Aphrodite Preview');
  assert.equal(preview.version, version);
  assert.deepEqual(preview.bundle.fileAssociations, stable.bundle.fileAssociations.map((a: object) => ({...a, rank:'Alternate'})));
  assert.match(stable.plugins.updater.endpoints[0], /\/releases\/latest\/download\/latest.json$/);
  assert.match(preview.plugins.updater.endpoints[0], /\/releases\/download\/preview-channel\/latest.json$/);
  const scheme = 'aphrodite-preview';
  const link = openLink('b1', 'p1', scheme);
  assert.equal(link, 'aphrodite-preview://open?board=b1&page=p1');
  assert.deepEqual(readOpenLink(link, scheme), {board:'b1', page:'p1'});
  assert.equal(readOpenLink(link, 'aphrodite'), undefined);
  assert.equal(readOpenLink(openLink('b1'), scheme), undefined);
  const plist = readFileSync('src-tauri/' + preview.bundle.macOS.infoPlist, 'utf8');
  assert.match(plist, /<string>aphrodite-preview<\/string>/);
  assert.ok(plist.includes(preview.identifier + '.open'));
  assert.ok(!plist.includes('<string>aphrodite</string>'));
  assert.throws(() => previewConfig('0.3.0'));
  assert.throws(() => previewConfig('0.3.0-preview.01'));
});
