import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeBox,localDelta} from '../src/editor/geometry';
import {applyEditorCommand} from '../src/editor/commands';
import {pointerLabPage} from '../src/editor/pointer-lab';
import {initialProject,parseProject,fingerprint} from '../src/model';
import {layoutStyle,validLayout} from '../src/layout';
import {sceneManifest} from '../src/components';
test('CSS zoom converts pointer deltas without double-applying DPR',()=>{
 for(const scale of [.7,.85,1,1.25]){const d=localDelta({x:100,y:200},{x:100+80*scale,y:200+40*scale},scale);assert.ok(Math.abs(d.x-80)<1e-9);assert.ok(Math.abs(d.y-40)<1e-9);}
 assert.throws(()=>localDelta({x:0,y:0},{x:1,y:1},0));
});
test('eight resize handles preserve opposite edge in free layout and enforce bounds',()=>{
 const b={x:100,y:100,width:220,height:220};
 for(const h of ['n','ne','e','se','s','sw','w','nw'] as const){const r=resizeBox(b,{x:20,y:10},h,true);assert.ok(r.width>=64&&r.height>=100);if(h.includes('w'))assert.equal(r.x+r.width,320);if(h.includes('n'))assert.equal(r.y+r.height,320);}
 assert.deepEqual(resizeBox(b,{x:60,y:0},'e',true),{...b,width:280});
 assert.equal(resizeBox(b,{x:9999,y:0},'w',true).width,64);
 assert.equal(resizeBox(b,{x:-9999,y:0},'w',true).x,0);
 const flow=resizeBox(b,{x:20,y:10},'nw',false);assert.equal(flow.x,b.x);assert.equal(flow.y,b.y);
});
test('preview math never mutates persisted scene; resize and move each round-trip as one command',()=>{
 const p=initialProject(),page=pointerLabPage();p.pages=[page];p.activePageId=page.id;const card=page.blocks[3],a=page.blocks[1],b=page.blocks[2];
 const before=JSON.stringify(p),hash=fingerprint(p);
 resizeBox({x:12,y:48,width:220,height:220},{x:60,y:0},'e',true);assert.equal(fingerprint(p),hash);
 assert.equal(applyEditorCommand(page.blocks,{type:'resize',id:card.id,layout:{...card.layout,widthPx:280,height:240}}),true);
 const resized=JSON.stringify(p);
 assert.equal(applyEditorCommand(page.blocks,{type:'move',id:card.id,parentId:b.id,x:8,y:40}),true);
 assert.equal(card.parentId,b.id);assert.equal(card.layout?.widthPx,280);
 assert.equal(parseProject(resized).pages[0].blocks[3].parentId,a.id);
 assert.equal(parseProject(before).pages[0].blocks[3].layout?.widthPx,220);
 const restored=parseProject(JSON.stringify(p));const node=sceneManifest(restored).pages[0].nodes.find(n=>n.instanceId===card.id)!;assert.equal(node.layout.widthPx,280);assert.equal(node.parentId,b.id);
 assert.match(layoutStyle(card,page.blocks),/width:280px/);
});
test('commands reject cyclic moves, unknown peers, and malformed dimensions without mutation',()=>{
 const page=pointerLabPage(),[root,a,b,card]=page.blocks;
 for(const command of [{type:'move',id:root.id,parentId:a.id},{type:'move',id:card.id,parentId:b.id,beforeId:a.id},{type:'resize',id:card.id,layout:{widthPx:Infinity}}] as const){const before=JSON.stringify(page);assert.equal(applyEditorCommand(page.blocks,command),false);assert.equal(JSON.stringify(page),before);}
 for(const widthPx of [0,63,2001,2.5,'280px'])assert.equal(validLayout({widthPx}),false);
});
