import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {initialProject,makeBlock,fingerprint,isApproved,dropStaleApproval} from '../src/model';
import {themeProposal} from '../src/design/theme-proposal';
import {unzipSync,strFromU8} from 'fflate';

const PNG1='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG2='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAf/2Q==';
const payload= (url:string)=>url.slice(url.indexOf(',')+1);
const bytesOf=(url:string)=>{const bin=atob(payload(url));const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;};

const built=await build({entryPoints:['src/export.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'raw-assets',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}}]});
const {collectUploads,exportBundle}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));

function fixture(){
  const p=initialProject();
  p.pages[0].blocks=[makeBlock('hero'),makeBlock('products')];
  p.pages[0].blocks[0].image=PNG1;
  p.pages[0].blocks[1].image='';
  p.pages[0].blocks[1].text='Lamp A|$100\nLamp B|$200';
  p.pages[0].blocks[1].itemImages=[PNG1,PNG2];
  p.reference=JPEG;
  return p;
}

test('collectUploads de-duplicates data-URL images and names them by payload hash',()=>{
  const p=fixture(),uploads=collectUploads(p);
  assert.equal(uploads.length,3);
  assert.deepEqual(uploads.map((u:{mime:string})=>u.mime),['image/png','image/png','image/jpeg']);
  assert.match(uploads[0].name,/^assets\/uploads\/[0-9a-f]{8}\.png$/);
  assert.match(uploads[1].name,/^assets\/uploads\/[0-9a-f]{8}\.png$/);
  assert.match(uploads[2].name,/^assets\/uploads\/[0-9a-f]{8}\.jpg$/);
  assert.notEqual(uploads[0].name,uploads[1].name);
  assert.equal(uploads[0].bytes.length,bytesOf(PNG1).length);
  assert.equal(uploads[1].bytes.length,bytesOf(PNG2).length);
  assert.equal(uploads[2].bytes.length,bytesOf(JPEG).length);
  assert.deepEqual(uploads[0].bytes,bytesOf(PNG1));
  assert.equal(uploads[0].dataUrl,PNG1);
  assert.equal(uploads[1].dataUrl,PNG2);
  assert.equal(uploads[2].dataUrl,JPEG);
});

test('exportBundle writes upload files, rewrites HTML, lists usages, and keeps project data URLs',async()=>{
  const p=fixture(),originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false} as Response);
  try{
    const files=unzipSync(await exportBundle(p));
    const uploads=collectUploads(p);
    for(const u of uploads){
      assert.ok(files[u.name],u.name);
      assert.equal(files[u.name].length,u.bytes.length);
    }
    const html=strFromU8(files['index.html']);
    assert.doesNotMatch(html,/data:image/);
    assert.match(html,new RegExp(uploads[0].name.replace(/[.]/g,'\\.')));
    assert.match(html,new RegExp(uploads[1].name.replace(/[.]/g,'\\.')));
    const listing=strFromU8(files['UPLOADS.md']);
    assert.match(listing,/hero/);
    assert.match(listing,/products/);
    assert.match(listing,/reference/);
    const json=strFromU8(files['project.aphrodite.json']);
    assert.match(json,/data:image\/png;base64,/);
    assert.match(json,/data:image\/jpeg;base64,/);
    assert.equal(JSON.parse(json).reference,JPEG);
  }finally{globalThis.fetch=originalFetch;}
});

/**
 * The vendor runtime is a lazy chunk now, and a provider block rendered before it arrives draws a
 * frame that says "loading". That frame must never reach a handoff: the exported HTML is opened on
 * somebody else's machine, where nothing is going to finish loading on its behalf.
 */
test('an export never ships the placeholder a lazy chunk leaves behind',async()=>{
  const p=initialProject();
  // The sample project points at bundled photographs the export would try to fetch; this test is
  // about the vendor runtime, so give it a page that needs nothing off disk.
  for(const page of p.pages)for(const b of page.blocks){b.image='';b.itemImages=[];}
  p.reference=undefined;
  const block=makeBlock('button',true);
  (block as unknown as {provider:string}).provider='mui';
  p.pages[0].blocks.push(block);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false} as Response);
  let files;
  try{files=unzipSync(await exportBundle(p));}finally{globalThis.fetch=originalFetch;}
  const html=Object.entries(files).filter(([name])=>name.endsWith('.html')).map(([,bytes])=>strFromU8(bytes)).join('');
  assert.doesNotMatch(html,/official-pending/,'the runtime had not arrived when the pages were rendered');
  assert.match(html,/official-component official-action/,'the real component is in the bundle');
});

/* Codex 2026-11-22, high 5: the theme draft ZIP is built from the candidate, which cloned the old
   fingerprint, so a candidate that restored the approved accent shipped as approved. */
test('a theme draft that restores an approved accent is exported as a draft',async()=>{
  const p=initialProject();p.pages[0].blocks=[makeBlock('hero')];const accent=p.system.accent;
  p.approvedFingerprint=fingerprint(p);p.system.accent='#2255cc';
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:false} as Response);
  let files:Record<string,Uint8Array>;
  try{files=unzipSync(await exportBundle(themeProposal(p,accent,p.system.font).candidate));}finally{globalThis.fetch=originalFetch;}
  assert.equal(JSON.parse(strFromU8(files['project.aphrodite.json'])).approvedFingerprint,undefined,'the project in the ZIP carries no fingerprint');
  assert.match(strFromU8(files['PROMPT.md']),/DRAFT/,'and its prompt says draft');
});

/* Codex 2026-11-22 (check 2): the bundle read its documents before it waited on a picture and its
   pages after, so a board edited in between shipped approved documents around the edited page. */
test('an export reads the board it started from, even when the board changes while it waits',async()=>{
  const p=initialProject();const hero=p.pages[0].blocks.find(b=>b.kind==='hero')!;
  hero.image='/assets/lighting-hero.png';hero.title='Reviewed title';p.approvedFingerprint=fingerprint(p);
  let reached=()=>{},release=()=>{};
  const waiting=new Promise<void>(r=>{reached=r;}),held=new Promise<void>(r=>{release=r;});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(async(url:string)=>{if(String(url)==='/assets/lighting-hero.png'){reached();await held;}return {ok:true,arrayBuffer:async()=>new Uint8Array([1]).buffer};}) as unknown as typeof fetch;
  let files:Record<string,Uint8Array>;
  try{
    const pending=exportBundle(p);
    await waiting;
    hero.title='Edited during export';dropStaleApproval(p);
    release();
    files=unzipSync(await pending);
  }finally{globalThis.fetch=originalFetch;}
  assert.equal(isApproved(p),false,'the live board is a draft now');
  const json=JSON.parse(strFromU8(files['project.aphrodite.json']));
  assert.equal(isApproved(json),true,'the project in the ZIP is the approved one it started from');
  assert.match(strFromU8(files['PROMPT.md']),/Approved for the exact exported composition/);
  assert.match(strFromU8(files['DESIGN.md']),/Visually approved/);
  const html=strFromU8(files['index.html']);
  assert.match(html,/Reviewed title/,'the page is the same board');
  assert.doesNotMatch(html,/Edited during export/,'and not the one edited while it waited');
});

/* Codex 2026-11-22 (check 3): pictures were looked up under whichever board was open when the lookup ran. */
test('an export looks its pictures up under the board it started from',async()=>{
  const p=initialProject();p.pages[0].blocks=[makeBlock('hero')];p.pages[0].blocks[0].image='local:0123456789abcdef';
  const asked:string[]=[];
  const pending=exportBundle(p,async(_id:string,projectId:string)=>{asked.push(projectId);return {bytes:new Uint8Array([1]),mime:'image/png'};});
  const started=p.id;p.id='another-board';
  await pending;
  assert.ok(asked.length>0,'a picture was looked up');
  assert.deepEqual([...new Set(asked)],[started]);
});
