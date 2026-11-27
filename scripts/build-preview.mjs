// From the repository root. Tauri's existing build hook prepares both sidecars for --target.
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {previewConfig, schemeForIdentifier} from './preview-config.mjs';

const {values} = parseArgs({options: {
  version:{type:'string'}, target:{type:'string'}, 'config-only':{type:'boolean'},
}});
const config = previewConfig(values.version);
const target = values.target || `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
if (!['aarch64-apple-darwin','x86_64-apple-darwin'].includes(target)) throw new Error('Choose one macOS architecture');
const file = 'src-tauri/target/preview.conf.json';
mkdirSync('src-tauri/target', {recursive:true});
if (!values['config-only']) config.bundle.createUpdaterArtifacts = false;
const template = readFileSync(new URL('../src-tauri/Info.preview.plist.in', import.meta.url), 'utf8');
const plist = template.replace('@IDENTIFIER@', config.identifier).replace('@SCHEME@', schemeForIdentifier(config.identifier)).replace('@SHORT_VERSION@', config.version.split('-')[0]);
writeFileSync('src-tauri/' + config.bundle.macOS.infoPlist, plist);
writeFileSync(file, JSON.stringify(config));
if (!values['config-only']) {
  console.log(`For release signing, generate the override with --config-only, supply the release workflow's signing credentials, and pass --config ${file} --target ${target} to tauri build.`);
  execFileSync('npm', ['run','tauri','--','build','--config',file,'--target',target,'--bundles','app','--no-sign'], {
    stdio:'inherit',
    env:{...process.env, TAURI_ENV_TARGET_TRIPLE:target},
  });
}
