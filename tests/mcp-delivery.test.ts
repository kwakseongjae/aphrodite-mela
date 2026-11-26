import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';

test('Astra 14 — the verification gate leaves a running app alone by default',async t=>{
  const home=mkdtempSync(join(tmpdir(),'aph-gate-'));
  const dirs=['Library','Application Support','studio.aphrodite.mela'].reduce<string[]>((paths,part)=>[...paths,join(paths.at(-1)!,part)],[home]);
  const file=join(dirs.at(-1)!,'agent-endpoint.json');
  mkdirSync(dirs.at(-1)!,{recursive:true});
  let visits=0;
  const app=createServer((_,res)=>{visits++;res.end('{}');});
  await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));
  t.after(()=>{app.close();unlinkSync(file);for(const p of dirs.reverse())rmdirSync(p);});
  writeFileSync(file,JSON.stringify({pid:process.pid,base:'http://127.0.0.1:'+(app.address() as {port:number}).port,token:'fixture'}));
  const env:NodeJS.ProcessEnv={...process.env,HOME:home};
  delete env.APHRODITE_ENDPOINT_FILE;
  delete env.APHRODITE_MCP_EXECUTABLE;
  const gate=await promisify(execFile)(process.execPath,['scripts/verify-mcp.mjs'],{env}).catch(e=>({stdout:e.stdout}));
  assert.equal(visits,0);
  assert.match(gate.stdout,/all 12 checks passed/);
});

test('Astra 15 — the standalone Cargo instructions prepare both sidecars',()=>{
  const doc=readFileSync('docs/DEVELOPMENT.md','utf8');
  assert.match(doc,/node scripts\/build-vision\.mjs[\s\S]{0,160}node scripts\/build-mcp\.mjs/);
});

test('Opus 10 — the release transcript runs the matrix executable and the guide links directly to its docs',()=>{
  const release=readFileSync('.github/workflows/release.yml','utf8');
  assert.match(release.slice(0,release.indexOf('run: npm test')), /TAURI_ENV_TARGET_TRIPLE: \$\{\{ matrix.target \}\}/);
  const transcript=readFileSync('tests/mcp-native.test.ts','utf8');
  assert.match(transcript,/const triple = process.env.TAURI_ENV_TARGET_TRIPLE/);
  const doc=readFileSync('docs/AGENT-CONNECT.md','utf8');
  assert.match(doc,/learn\.chatgpt\.com\/docs\/extend\/mcp/);
});
