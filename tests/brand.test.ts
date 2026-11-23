import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {inflateSync} from 'node:zlib';
import {textOutputs,sha,ROOT,COPIES} from '../scripts/build-brand.mjs';

/**
 * The brand has one source, brand/, and scripts/build-brand.mjs places it where the product shows it.
 *
 * Text outputs (SVG, logo.ts, the inline logo on the site) are pure functions of the originals, so they are compared as
 * text. PNG, ICNS, ICO and TIFF are written by rsvg-convert, sips and the Tauri CLI, and their bytes change with the
 * tool, so a rebuild here would be flaky. brand/outputs.json records the SHA-256 of each source and of each file that
 * was written, and this test holds the files to it: a source changed without a rebuild, or a built file replaced by
 * hand, fails. Change the source, then npm run brand.
 */
const at=(p:string)=>readFileSync(ROOT+p);

test('every text file the brand script writes is what a rebuild would write',()=>{
 for(const [path,text] of Object.entries(textOutputs()))assert.equal(at(path).toString('utf8'),text,path+' is out of date: run npm run brand');
});

test('every built binary matches the record of the sources it was built from',()=>{
 const rec=JSON.parse(at('brand/outputs.json').toString('utf8')) as Record<string,{from:Record<string,string>;sha256:string;size?:[number,number]}>;
 const expected=['public/brand/apple-mark.png','site/assets/brand/app-icon.png','src-tauri/icons/icon.icns','src-tauri/icons/icon.ico',
  'src-tauri/dmg/background.png','src-tauri/dmg/background@2x.png','src-tauri/dmg/background.tiff',...COPIES.map(c=>c[1])];
 assert.deepEqual(Object.keys(rec).sort(),[...expected].sort(),'brand/outputs.json lists a different set of files than the script writes');
 for(const [to,row] of Object.entries(rec)){
  for(const [from,hash] of Object.entries(row.from))assert.equal(sha(from),hash,from+' changed since '+to+' was built: run npm run brand');
  assert.equal(sha(to),row.sha256,to+' is not the file the script wrote');
  if(row.size){const b=at(to);assert.deepEqual([b.readUInt32BE(16),b.readUInt32BE(20)],row.size,to+' size');}
 }
 for(const [from,to] of COPIES)assert.ok(at(from).equals(at(to)),to+' is not a copy of '+from);
});

test('the old apple is in no tracked file',()=>{
 // built from pieces so this file does not contain what it looks for
 const old=Buffer.from(['M23 13C9 5',' 1 18 6 31'].join(''));
 const files=execFileSync('git',['ls-files','-z'],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(f=>f&&existsSync(ROOT+f));
 const hits=files.filter(f=>at(f).includes(old));
 assert.deepEqual(hits,[],'the old symbol path is still in '+hits.join(', '));
});

function rgba(path:string){
 const png=at(path);assert.equal(png[24],8);assert.equal(png[25],6);assert.equal(png[28],0);
 const w=png.readUInt32BE(16),h=png.readUInt32BE(20),chunks:Buffer[]=[];
 for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=12+n;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=w*4;let prev=Buffer.alloc(stride);const out:Buffer[]=[];
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],row=Buffer.alloc(stride);for(let x=0;x<stride;x++){const a=x>=4?row[x-4]:0,b=prev[x],c=x>=4?prev[x-4]:0,p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);const g=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:c;row[x]=(raw[y*(stride+1)+1+x]+g)&255;}out.push(row);prev=row;}
 return {w,h,alpha:(x:number,y:number)=>out[y][x*4+3]};
}

test('at 16 px the inside of the A is open and the crossbar and legs are solid pixels',()=>{
 const {w,h,alpha}=rgba('brand/favicon-16.png');assert.deepEqual([w,h],[16,16]);
 // the counter's apex, the space under the crossbar between the legs, the crossbar, and one pixel inside each leg
 for(const [x,y] of [[7,7],[7,8],[5,11],[6,11],[7,11],[8,11],[9,11]])assert.ok(alpha(x,y)<=8,'open pixel '+x+','+y+' is '+alpha(x,y));
 for(const [x,y] of [[7,10],[3,11],[12,11],[3,9],[12,9]])assert.ok(alpha(x,y)>=250,'solid pixel '+x+','+y+' is '+alpha(x,y));
});
