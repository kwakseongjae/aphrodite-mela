import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {initialProject,makeBlock} from '../src/model';
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
