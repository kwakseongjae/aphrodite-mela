import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync, spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {createServer} from 'node:http';
import {existsSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {toolManifest, tools} from '../mcp/aphrodite-mcp/tools.mjs';

const triple = execFileSync('rustc', ['-vV'], {encoding:'utf8'}).match(/^host: (.*)$/m)![1];
const native = `src-tauri/bin/aphrodite-mcp-${triple}`;
const nodeServer = 'mcp/aphrodite-mcp/index.mjs';

const buildScript = 'scripts/build-mcp.mjs';
const manifestFile = 'src-tauri/bin/mcp-manifest.json';

before(() => {
  if (existsSync(manifestFile)) execFileSync(process.execPath,[buildScript,'--check-manifest',manifestFile]);
  execFileSync(process.execPath,[buildScript],{stdio:'inherit',env:{...process.env,TAURI_ENV_TARGET_TRIPLE:triple}});
});

test('the generated native manifest agrees with its sources, including call plumbing', () => {
  const generated=JSON.parse(readFileSync(manifestFile,'utf8'));
  assert.deepEqual(generated.tools,toolManifest());
  execFileSync(process.execPath,[buildScript,'--check-manifest',manifestFile]);
  const dir=mkdtempSync(join(tmpdir(),'aph-manifest-'));
  const fixture=join(dir,'stale.json');
  try {
    generated.routes.aphrodite_guide.path='/outdated';
    writeFileSync(fixture,JSON.stringify(generated));
    const check=spawnSync(process.execPath,[buildScript,'--check-manifest',fixture],{encoding:'utf8'});
    assert.equal(check.status,1);
    assert.match(check.stderr,/manifest differs/);
  } finally {unlinkSync(fixture);rmdirSync(dir);}
});

async function* frames(stream:Readable):AsyncGenerator<Buffer> {
  let parts:Buffer[]=[];
  for await (const chunk of stream) {
    let bytes=Buffer.from(chunk);
    for(let lf=bytes.indexOf(10);lf>=0;lf=bytes.indexOf(10)){
      parts.push(bytes.subarray(0,lf+1));
      yield Buffer.concat(parts);
      parts=[];bytes=bytes.subarray(lf+1);
    }
    if(bytes.length)parts.push(bytes);
  }
  assert.equal(parts.length,0,'unterminated protocol frame');
}

test('the transcript retains every byte of the line terminator', async () => {
  const out:Buffer[]=[];
  for await (const frame of frames(Readable.from([Buffer.from('a\r'),Buffer.from('\nb\n')]))){out.push(frame);}
  assert.deepEqual(out.map(b=>b.toString()),['a\r\n','b\n']);
});

test('both stdio servers return identical lines and send identical loopback calls', {timeout:45000}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'aph-transcript-'));
  const file = join(dir,'endpoint.json');
  const calls:string[] = [];
  let status = 200;
  let response:unknown = {z:1, a:'two'};
  const app = createServer(async (req,res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push(JSON.stringify([req.method,req.url,req.headers.authorization,req.headers['x-aphrodite-agent'],body]));
    res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(response));
  });
  await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));
  const port=(app.address() as {port:number}).port;
  const endpoint=(pid:number,token:string)=>writeFileSync(file,JSON.stringify({pid,token,base:`http://127.0.0.1:${port}`}));
  t.after(()=>{app.closeAllConnections();app.close();try{unlinkSync(file);}catch{}rmdirSync(dir);});
  const clients = [[process.execPath,[nodeServer]],[native,[]]] as const;
  const running=clients.map(([cmd,args])=>{
    const child=spawn(cmd,[...args],{stdio:['pipe','pipe','inherit'],env:{...process.env,APHRODITE_ENDPOINT_FILE:file}});
    t.after(()=>child.kill());
    return {child,out:frames(child.stdout)};
  });
  let id=0;
  async function line(input:string) {
    const answers=await Promise.all(running.map(async ({child,out})=>{
      child.stdin.write(input+'\n');
      const next=await out.next();
      assert.equal(next.done,false);
      return next.value!;
    }));
    assert.ok(answers[0].equals(answers[1]),input);
    return JSON.parse(answers[0].toString('utf8'));
  }
  const rpc=(method:string,params:unknown={})=>line(JSON.stringify({jsonrpc:'2.0',id:++id,method,params}));
  const call=(name:string,args:unknown={})=>rpc('tools/call',{name,arguments:args});
  for(const protocolVersion of ['2024-11-05','2025-03-26','2025-06-18','unknown'])
    await rpc('initialize',{protocolVersion,clientInfo:{name:'Test_Client. 하나'}});
  await rpc('tools/list');
  const prompts=(await rpc('prompts/list')).result.prompts;
  for(const p of prompts) for(const args of [{},Object.fromEntries(p.arguments.map((a:{name:string})=>[a.name,'한글 {text} "$&"']))])
    await rpc('prompts/get',{name:p.name,arguments:args});
  await line('broken json');
  await line('{"method":"ping"}');
  for(const {child} of running)child.stdin.write('{"method":"notifications/initialized"}\n{"method":"unknown"}\n');
  await rpc('ping');
  await rpc('unknown');
  await rpc('prompts/get',{name:'missing'});
  await call('missing');
  for(const stale of [false,true]){
    if(stale)endpoint(2147483647,'dead');
    assert.equal((await call('aphrodite_get_contract')).result.isError,true);
    assert.equal((await call('aphrodite_guide')).result.isError,false);
  }
  assert.deepEqual(calls,[]);
  endpoint(process.pid,'live');
  for(const tool of tools) {
    const args=Object.fromEntries(Object.keys(tool.inputSchema.properties??{}).map(k=>[k,'여 백?!']));
    for(const input of [{},args]) {
      await call(tool.name,input);
      assert.equal(calls.at(-1),calls.at(-2),tool.name);
    }
  }
  await call('aphrodite_apply_edits',{ops:[{offset:0.0000001,width:100000000000000000000}]});
  assert.equal(calls.at(-1),calls.at(-2),'the JSON body uses the same number spelling');
  await line('{"id":1e-7,"method":"ping"}');
  endpoint(process.pid,'rotated');
  status=403;response={error:'writing is off',open:{name:'B',project_id:'p'}};
  assert.match((await call('aphrodite_apply_edits')).result.content[0].text,/writing is off.*"B"/);
  assert.match(calls.at(-1)!,/Bearer rotated/);
  status=200;response={png:'YQ==',mime:'image/png',z:1,a:2};
  await call('aphrodite_get_render');
  response={guide:'Live guide'};await call('aphrodite_guide');
  response={html:'x'.repeat(1024*1024)};await call('aphrodite_get_page_html');
});
