import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {brandLockup} from '../src/design/logo';
test('six cutouts contain actual transparent and near-opaque pixels, not painted backgrounds',()=>{
 for(const id of ['aphrodite','apple-hand','paper-dove','review','recovery','night']){
  const png=readFileSync(`public/brand/cutouts/${id}.png`);assert.equal(png[24],8);assert.equal(png[25],6);assert.equal(png[28],0);
  const w=png.readUInt32BE(16),h=png.readUInt32BE(20),chunks:Buffer[]=[];
  for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=12+n;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=w*4;let prev=Buffer.alloc(stride),transparent=0,opaque=0;
  for(let y=0;y<h;y++){const filter=raw[y*(stride+1)],row=Buffer.alloc(stride);for(let x=0;x<stride;x++){const a=x>=4?row[x-4]:0,b=prev[x],c=x>=4?prev[x-4]:0,p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);const predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:c;row[x]=(raw[y*(stride+1)+1+x]+predict)&255;}for(let x=3;x<stride;x+=4){if(row[x]===0)transparent++;if(row[x]>=240)opaque++;}prev=row;}
  assert.ok(transparent>w*h*.2,`${id}: transparent canvas`);assert.ok(opaque>w*h*.1,`${id}: near-opaque subjects`);
 }
});
test('custom logo is font-independent vector artwork',()=>{assert.match(brandLockup,/fill-rule="evenodd"/);assert.doesNotMatch(brandLockup,/<text|font-family|✳/);});
