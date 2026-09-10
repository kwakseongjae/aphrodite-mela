import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='lab/artifacts/c2-compact/';
const a=JSON.parse(readFileSync(root+'final-600/project.aphrodite.json','utf8'));
const b=JSON.parse(readFileSync(root+'final-300/project.aphrodite.json','utf8'));
assert.deepEqual(a.pages[0].blocks.map((n:any)=>[n.kind,n.provider]),[['input','mui'],['cards','mui']]);
assert.equal(a.pages[0].blocks[1].layout.height,600);assert.equal(b.pages[0].blocks[1].layout.height,300);
for(const name of ['final-600','final-300']){
 const p=JSON.parse(readFileSync(root+name+'/project.aphrodite.json','utf8'));
 const s=JSON.parse(readFileSync(root+name+'/SCENE.json','utf8'));
 assert.deepEqual(s.pages[0].nodes.map((n:any)=>n.instanceId),p.pages[0].blocks.map((n:any)=>n.id));
 const html=readFileSync(root+name+'/index.html','utf8');
 assert.ok(html.includes('height:auto;flex:1;min-height:64px'));
 assert.ok(html.includes('A thoughtful place to start.'));
 assert.ok(html.includes('you@studio.com'));
}
a.pages[0].blocks[1].layout.height=300;assert.deepEqual(a,b);
console.log('PASS: final native exports differ only in card height; providers, content, tokens, all remaining fields and SCENE identities preserved.');
