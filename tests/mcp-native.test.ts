import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync, spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {createServer} from 'node:http';
import {existsSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {toolManifest, tools} from '../mcp/aphrodite-mcp/tools.mjs';

const triple = process.env.TAURI_ENV_TARGET_TRIPLE || execFileSync('rustc', ['-vV'], {encoding:'utf8'}).match(/^host: (.*)$/m)![1];
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

test('a single piped guide request is answered before either process exits', () => {
  const dir=mkdtempSync(join(tmpdir(),'aph-eof-'));
  const options={env:{...process.env,APHRODITE_ENDPOINT_FILE:join(dir,'absent')},
    input:'{"id":1,"method":"tools/call","params":{"name":"aphrodite_guide"}}\n'};
  try {
    const node=execFileSync(process.execPath,[nodeServer],options);
    const rust=execFileSync(native,[],options);
    assert.ok(node.length>0 && node.equals(rust));
  } finally {rmdirSync(dir);}
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
  let stall = false;
  const held:import("node:http").ServerResponse[]=[];
  let response:unknown = {z:1, a:'two'};
  const app = createServer(async (req,res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push(JSON.stringify([req.method,req.url,req.headers.authorization,req.headers['x-aphrodite-agent'],body]));
    if(stall){held.push(res);return;}
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
  await t.test('Astra 11 — four stalled calls leave ping responsive and oversized responses are refused',async()=>{
    stall=true;
    for(const {child} of running) for(let i=0;i<4;i++)
      child.stdin.write(JSON.stringify({id:i,method:'tools/call',params:{name:'aphrodite_get_contract'}})+'\n');
    const deadline=Date.now()+5000;
    while(held.length<8 && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(held.length,8);
    assert.match((await call('aphrodite_get_contract')).result.content[0].text,/four calls/);
    await rpc('ping');
    stall=false;
    for(const res of held.splice(0)) res.end('{}');
    for(const {out} of running) {
      const ids=[];
      for(let i=0;i<4;i++)ids.push(JSON.parse((await out.next()).value!.toString()).id);
      assert.deepEqual(ids.sort(),[0,1,2,3]);
    }
    response='x'.repeat(24*1024*1024);
    assert.match((await call('aphrodite_get_contract')).result.content[0].text,/exceeds 24 MiB/);
    response={};
  });
  await t.test('Opus 6 — every redirect, a refused port and the HTTP timeout agree', async()=>{
    for(status=300;status<400;status++)
      assert.match((await call('aphrodite_get_contract')).result.content[0].text,/not running/);
    status=200;stall=true;
    assert.match((await call('aphrodite_get_contract')).result.content[0].text,/did not answer in time/);
    await new Promise<void>(resolve=>{app.close(()=>resolve());app.closeAllConnections();});
    assert.match((await call('aphrodite_get_contract')).result.content[0].text,/not running/);
  });
});

const ping = '{"id":1,"method":"ping"}';
function rawTranscript(input: Buffer | string) {
  const dir=mkdtempSync(join(tmpdir(),'aph-frames-'));
  try {
    const options={input,env:{...process.env,APHRODITE_ENDPOINT_FILE:join(dir,'absent')},maxBuffer:2*1024*1024};
    const results=[[process.execPath,[nodeServer]],[native,[]]] as const;
    const lines=results.map(([bin,args])=>execFileSync(bin,[...args],options));
    assert.deepEqual(lines[1],lines[0]);
    return lines[0].toString('utf8').trimEnd().split('\n').map(s=>JSON.parse(s));
  } finally {rmdirSync(dir);}
}
test('Astra 10 — invalid UTF-8, a BOM, bare CR and CRLF leave the next ping readable',()=>{
  const out=rawTranscript(Buffer.concat([Buffer.from([255,10]),Buffer.from('\ufeff'+ping+'\r'+ping+'\r\n'+ping)]));
  assert.deepEqual(out.map(r=>r.error?.code??r.id),[-32700,1,1,1]);
});
test('Opus 4 — surrounding pings survive invalid octets and a lone surrogate escape',()=>{
  const out=rawTranscript(Buffer.concat([Buffer.from(ping+'\n'),Buffer.from([255,254,10]),
    Buffer.from('{"id":"\\ud800","method":"ping"}\r'+ping+'\n')]));
  assert.deepEqual(out.map(r=>r.error?.code??r.id),[1,-32700,-32700,1]);
});
test('Opus 5 — scalar frames and inherited object names have ordinary protocol results',()=>{
  for(const name of ['constructor','__proto__']){
    const q=(method:string)=>JSON.stringify({id:2,method,params:{name}});
    const out=rawTranscript(['null','12','[]',q('prompts/get'),q('tools/call'),ping,''].join('\n'));
    assert.equal(out.length,3);
    assert.equal(out[0].error.message,'Unknown prompt: '+name);
    assert.equal(out[1].result.content[0].text,'No such tool "'+name+'".');
  }
});
test('Astra 11 — an oversized frame is drained before the next ping',()=>{
  const out=rawTranscript(Buffer.concat([Buffer.alloc(24*1024*1024+1,32),Buffer.from('\n'+ping+'\n')]));
  assert.deepEqual(out.map(r=>r.error?.code??r.id),[-32700,1]);
});
