import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
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
  assert.equal(preview.build.beforeBuildCommand, `export APHRODITE_PREVIEW_VERSION='${version}' && ${stable.build.beforeBuildCommand}`);
  assert.deepEqual(preview.bundle.fileAssociations, stable.bundle.fileAssociations.map((a: object) => ({...a, rank:'Alternate'})));
  assert.match(stable.plugins.updater.endpoints[0], /\/releases\/latest\/download\/latest.json$/);
  assert.match(preview.plugins.updater.endpoints[0], /\/releases\/download\/preview-channel\/preview\.json$/);
  const scheme = 'aphrodite-preview';
  const link = openLink('b1', 'p1', scheme);
  assert.equal(link, 'aphrodite-preview://open?board=b1&page=p1');
  assert.deepEqual(readOpenLink(link, scheme), {board:'b1', page:'p1'});
  assert.equal(readOpenLink(link, 'aphrodite'), undefined);
  assert.equal(readOpenLink(openLink('b1'), scheme), undefined);
  assert.throws(() => previewConfig('0.3.0'));
  assert.throws(() => previewConfig('0.3.0-preview.01'));
});

test('the local command selects one target, the preview hook and an unsigned app bundle', t => {
  const dir = mkdtempSync(join(tmpdir(), 'aph-preview-build-'));
  const npm = join(dir,'npm');
  const script = fileURLToPath(new URL('../scripts/build-preview.mjs', import.meta.url));
  writeFileSync(npm, '#!/bin/sh\nprintf "%s\\n" "$TAURI_ENV_TARGET_TRIPLE" "$@" > invocation\n', {mode:0o700});
  t.after(()=>rmSync(dir,{recursive:true}));
  const target = 'x86_64-apple-darwin';
  const args = [script,'--target',target,'--version',version];
  const env = {...process.env, PATH:dir+':'+process.env.PATH};
  execFileSync(process.execPath,args,{cwd:dir,env});
  assert.deepEqual(readFileSync(join(dir,'invocation'),'utf8').trim().split('\n'),
    [target,'run','tauri','--','build','--config','src-tauri/target/preview.conf.json','--target',target,'--bundles','app','--no-sign']);
  const config = () => JSON.parse(readFileSync(join(dir,'src-tauri/target/preview.conf.json'),'utf8'));
  assert.equal(config().bundle.createUpdaterArtifacts,false);
  execFileSync(process.execPath,[...args,'--config-only'],{cwd:dir,env});
  assert.equal(config().bundle.createUpdaterArtifacts,undefined);
  assert.equal(config().version,version);
  const plistPath = join(dir, 'src-tauri', config().bundle.macOS.infoPlist);
  const plist = JSON.parse(execFileSync('plutil',['-convert','json','-o','-',plistPath], {encoding:'utf8'}));
  assert.equal(plist.CFBundleShortVersionString, '0.3.0');
  assert.equal(config().bundle.macOS.bundleVersion, '12');
  assert.deepEqual(plist.CFBundleURLTypes,[{CFBundleURLName:config().identifier+'.open', CFBundleURLSchemes:['aphrodite-preview']}]);
});
