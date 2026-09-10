import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeBlock,initialProject,parseProject,fingerprint} from '../src/model';
import {planVibe,applyVibe} from '../src/design/vibe';
import {verifyReference,referenceIssue} from '../src/design/bridge';
import {referenceDefaults} from '../src/design/reference-defaults';
const opts={copy:true,images:false,replace:false};
test('reference scaffold fills without replacing reviewed hero or project identity; edited blocks stay protected',()=>{
 const hero=makeBlock('hero',true);hero.title='당신의 공간에 어울리는 빛';
 const features=Object.assign(makeBlock('features'),referenceDefaults.features);
 const cta=Object.assign(makeBlock('cta'),referenceDefaults.cta);
 const footer=Object.assign(makeBlock('footer'),referenceDefaults.footer,{title:'My project'});
 const blocks=[hero,features,cta,footer],before=JSON.stringify(blocks);
 const plan=planVibe(blocks,'lighting',opts);assert.equal(JSON.stringify(blocks),before);
 assert.equal(plan.changes.length,8);assert.ok(!plan.changes.some(c=>c.id===hero.id));
 applyVibe(blocks,plan);assert.equal(hero.title,'당신의 공간에 어울리는 빛');assert.equal(footer.title,'My project');
 assert.equal(planVibe(blocks,'lighting',opts).changes.length,0);
 const edited=Object.assign(makeBlock('cta'),referenceDefaults.cta,{filled:true});
 assert.equal(planVibe([edited],'lighting',opts).changes.length,0);
});
test('Get Vibe previews without mutation, fills fields individually, preserves custom copy and geometry',()=>{
 const b=makeBlock('hero');b.title='Keep my title';b.layout={mode:'flow',width:640};
 const before=JSON.stringify(b),plan=planVibe([b],'lighting',opts);
 assert.equal(JSON.stringify(b),before);assert.equal(plan.changes.length,2);
 applyVibe([b],plan);assert.equal(b.title,'Keep my title');assert.equal(b.label,'Explore the collection');assert.equal(b.layout.width,640);
 assert.equal(planVibe([b],'lighting',opts).changes.length,0);
});
test('default pattern content is fillable despite filled=true; missing assets and unsupported kinds are explicit',()=>{
 const blocks=[makeBlock('stats'),makeBlock('hero'),makeBlock('calendar')];
 const plan=planVibe(blocks,'commerce',{...opts,images:true});
 assert.ok(plan.changes.some(c=>c.id===blocks[0].id));assert.deepEqual(plan.missingAssets,[blocks[1].id]);assert.ok(plan.unsupported.includes(blocks[2].id));
});
test('stale preview rejects atomically, replacement is opt in and roundtrip preserves results',()=>{
 const p=initialProject();p.pages[0].blocks=[makeBlock('hero')];const b=p.pages[0].blocks[0];
 const plan=planVibe([b],'lighting',opts);b.label='Changed';const before=JSON.stringify(b);
 assert.throws(()=>applyVibe([b],plan),/stale/);assert.equal(JSON.stringify(b),before);
 const next=planVibe([b],'lighting',{...opts,replace:true});applyVibe([b],next);
 assert.equal(fingerprint(parseProject(JSON.stringify(p))),fingerprint(p));
});
test('OmD source hashes bind exact snapshots; product colors not marketing colors; raw source survives save',async()=>{
 for(const id of ['karrot','toss']){
  const md=readFileSync(new URL('../public/design-sources/'+id+'.md',import.meta.url),'utf8');
  const ds=await verifyReference(id,md);assert.equal(ds.accent,id==='karrot'?'#ff6f0f':'#3182f6');
  const p=initialProject();p.system=ds;assert.equal(parseProject(JSON.stringify(p)).system.originalMarkdown,md);
  await assert.rejects(verifyReference(id,md+'\n'),/hash mismatch/);
 }
 assert.match(referenceIssue('toss','Font assets'),/local proposal, not submitted/);
});
test('generated hero is separate from reference image and latest receipt is roundtrip-safe',()=>{
 const p=initialProject();const b=makeBlock('hero');p.pages[0].blocks=[b];
 const plan=planVibe([b],'lighting',{...opts,images:true});applyVibe([b],plan);
 assert.equal(b.image,'/assets/lighting-hero.png');assert.equal(b.filled,true);
 p.pages[0].vibeReceipt={packId:'lighting',changedFields:plan.changes.length,source:'local-authored-demo',imageSource:'bundled-generated',modelCalled:false};
 assert.deepEqual(parseProject(JSON.stringify(p)).pages[0].vibeReceipt,p.pages[0].vibeReceipt);
 const malformed=JSON.parse(JSON.stringify(p));malformed.pages[0].vibeReceipt.modelCalled=true;
 assert.throws(()=>parseProject(JSON.stringify(malformed)),/Get Vibe/);
});
