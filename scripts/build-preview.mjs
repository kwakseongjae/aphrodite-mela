// From the repository root. Tauri's existing build hook prepares both sidecars for --target.
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {previewConfig} from './preview-config.mjs';

const {values} = parseArgs({options: {
  version:{type:'string'}, target:{type:'string'}, 'config-only':{type:'boolean'},
}});
const config = previewConfig(values.version);
const target = values.target || `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
if (!['aarch64-apple-darwin','x86_64-apple-darwin'].includes(target)) throw new Error('Choose one macOS architecture');
const file = 'src-tauri/target/preview.conf.json';
mkdirSync('src-tauri/target', {recursive:true});
if (!values['config-only']) config.bundle.createUpdaterArtifacts = false;
writeFileSync(file, JSON.stringify(config));
if (!values['config-only']) {
  console.log(`For release signing, generate the override with --config-only, set APHRODITE_PREVIEW_VERSION=${config.version}, supply the release workflow's signing credentials, and pass --config ${file} --target ${target} to tauri build.`);
  execFileSync('npm', ['run','tauri','--','build','--config',file,'--target',target,'--bundles','app','--no-sign'], {
    stdio:'inherit',
    env:{...process.env, APHRODITE_PREVIEW_VERSION:config.version, TAURI_ENV_TARGET_TRIPLE:target},
  });
}
