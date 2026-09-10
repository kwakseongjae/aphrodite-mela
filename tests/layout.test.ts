import test from 'node:test';
import assert from 'node:assert/strict';
import { initialProject,makeBlock,parseProject,fingerprint } from '../src/model';
import { canParent,validLayout,validateTree } from '../src/layout';
import { sceneManifest } from '../src/components';
test('nested frames round-trip with official provider, layout and scene provenance',()=>{
 const p=initialProject(), f=makeBlock('frame'), b=makeBlock('button');b.provider='mui';b.parentId=f.id;b.layout={width:70,x:40,y:50};f.layout={mode:'free',height:400};p.pages[0].blocks=[f,b];
 assert.deepEqual(parseProject(JSON.stringify(p)).pages,p.pages);
 const scene=sceneManifest(p).pages[0].nodes[1];assert.equal(scene.componentId,'mui.button');assert.equal(scene.parentId,f.id);assert.equal(scene.layout.width,70);
 const before=fingerprint(p);b.layout.width=80;assert.notEqual(fingerprint(p),before);
});
test('invalid parents, cycles, excessive depth and unsupported adapters reject',()=>{
 const p=initialProject(),a=makeBlock('frame'),b=makeBlock('frame');p.pages[0].blocks=[a,b];a.parentId=b.id;b.parentId=a.id;
 assert.equal(validateTree([a,b]),false);assert.throws(()=>parseProject(JSON.stringify(p)));
 delete a.parentId;delete b.parentId;assert.equal(canParent([a,b],a.id,'missing'),false);
 const chain=Array.from({length:9},()=>makeBlock('frame'));chain.forEach((x,i)=>{if(i)x.parentId=chain[i-1].id;});assert.equal(validateTree(chain),false);
 const table=makeBlock('table');table.provider='seed';p.pages[0].blocks=[table];assert.throws(()=>parseProject(JSON.stringify(p)));
});
test('layout whitelist rejects CSS injection, fractions, NaN and out of bounds',()=>{
 for(const l of [{width:101},{x:-1},{height:9999},{mode:'absolute'},{padding:'1px;display:none'},{evil:1},{columns:1.5},{gap:NaN},[]])assert.equal(validLayout(l),false);
 assert.equal(validLayout({width:10,height:100,mode:'flow',columns:4,padding:0}),true);
});
