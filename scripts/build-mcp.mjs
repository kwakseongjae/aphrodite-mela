// Build the independent stdio executable, without linking Tauri or starting a window.
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {toolManifest, tools, refusalText, FALLBACK_CALLER} from '../mcp/aphrodite-mcp/tools.mjs';
import {promptManifest, prompts} from '../mcp/aphrodite-mcp/prompts.mjs';
import {protocol} from '../mcp/aphrodite-mcp/protocol.mjs';

import {previewConfig, stableConfig} from './preview-config.mjs';

const build = process.env.APHRODITE_PREVIEW_VERSION ? previewConfig(process.env.APHRODITE_PREVIEW_VERSION) : stableConfig;
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || execFileSync('rustc', ['-vV'], {encoding:'utf8'}).match(/^host: (.+)$/m)[1];
const bin = 'src-tauri/bin';
const target = 'src-tauri/target/mcp';
const marker = 'APHRODITE_TEMPLATE_ARGUMENT';
const routes = Object.fromEntries(tools.map(({name,route,body,params}) => {
  const select = body || params;
  if (select && !select.fields) throw new Error(`Missing argument projection for ${name}`);
  return [name, {...route, fields:select?.fields || {}}];
}));
const templates = Object.fromEntries(prompts.map(prompt => {
  if (prompt.arguments.length > 1) throw new Error(`Extend prompt substitution for ${prompt.name}`);
  const arg = prompt.arguments[0]?.name;
  return [prompt.name, {arg, empty:prompt.build()[0].content.text, parts:prompt.build({[arg]:marker})[0].content.text.split(marker)}];
}));
const manifest = {version:stableConfig.version, identifier:stableConfig.identifier, ...protocol, fallbackCaller:FALLBACK_CALLER, tools:toolManifest(), routes,
  prompts:promptManifest(), templates,
  refused:refusalText({},marker).split(marker),
  board:refusalText({error:'',open:{name:marker}},403).split(marker),
  boardWithId:refusalText({error:'',open:{name:marker,project_id:marker}},403).split(marker),
};
const path = bin + '/mcp-manifest.json';
const json = JSON.stringify(manifest);
if (process.argv[2] === '--check-manifest') {
  if (readFileSync(process.argv[3] || path, 'utf8') !== json) {
    console.error('The generated MCP manifest differs from its source. Regenerate it with node scripts/build-mcp.mjs.');
    process.exitCode = 1;
  }
} else {
  mkdirSync(bin, {recursive: true});
  if (!existsSync(path) || readFileSync(path, 'utf8') !== json) writeFileSync(path, json);
  execFileSync('cargo',['build','--locked','--manifest-path','mcp/native/Cargo.toml','--release','--target',triple,'--target-dir',target],{stdio:'inherit', env:{...process.env, APHRODITE_BUILD_IDENTIFIER:build.identifier, APHRODITE_BUILD_VERSION:build.version}});
  copyFileSync(`${target}/${triple}/release/aphrodite-mcp`,`${bin}/aphrodite-mcp-${triple}`);
}
