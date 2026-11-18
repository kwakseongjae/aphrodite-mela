import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,appendEvent,changeReceipt,readRun} from '../src/agent/run';
import {assemblyBrief,nodePath} from '../src/agent/context';
import {initialProject,makeBlock} from '../src/model';
test('run reports editor deltas without copy or image payloads and leaves usage unknown',()=>{
 const p=initialProject(),r=newRun(p,'Rebuild image','user-reported model',1280,720),before=structuredClone(p);
 p.pages[0].blocks[0].text='PRIVATE COPY';p.pages[0].blocks[0].layout={widthPx:240};
 const d=changeReceipt(before,p);assert.ok(!JSON.stringify(d).includes('PRIVATE COPY'));assert.ok(d.changedNodes[0].fields.includes('text'));
 appendEvent(r,p,'pointer:resize',d);assert.equal(r.events.length,1);assert.equal(r.usage,null);assert.equal(readRun(JSON.stringify(r))?.id,r.id);
 r.status='ended';appendEvent(r,p,'edit');assert.equal(r.events.length,1);
});
test('logs are bounded and truncation is explicit; malformed storage is rejected',()=>{
 const p=initialProject(),r=newRun(p,'','',1,1);for(let i=0;i<502;i++)appendEvent(r,p,'edit');assert.equal(r.events.length,500);assert.equal(r.dropped,2);
 assert.equal(readRun('{}'),null);assert.equal(readRun('{bad'),null);assert.equal(readRun(JSON.stringify({...r,events:[{kind:42}]})),null);
});
test('assembly context describes nested insertion target and human approval boundary',()=>{
 const p=initialProject(),a=makeBlock('frame'),b=makeBlock('moacard');b.parentId=a.id;p.pages[0].blocks=[a,b];
 assert.equal(nodePath(p.pages[0].blocks,b.id),`Page root / ${a.title} / ${b.title}`);
 const brief=assemblyBrief(p,b.id,a.id);assert.match(brief,/Pin selected frame/);assert.match(brief,/does NOT approve/);assert.match(brief,/session-only/);
});

test('a receipt names the html pages a change made or rewrote, without their html',()=>{
  const before=initialProject();
  const after=JSON.parse(JSON.stringify(before));
  after.pages.push({id:'free-1',name:'Briefing',blocks:[],kind:'html',html:'<p>PRIVATE PAGE</p>'});
  const made=changeReceipt(before,after);
  assert.deepEqual(made.changedPages,[{pageId:'free-1',html:'added'}]);
  assert.ok(!JSON.stringify(made).includes('PRIVATE PAGE'));
  const later=JSON.parse(JSON.stringify(after));later.pages[1].html='<p>Rewritten</p>';
  assert.deepEqual(changeReceipt(after,later).changedPages,[{pageId:'free-1',html:'changed'}]);
  assert.equal(changeReceipt(before,before).changedPages,undefined,'a receipt with no html page says nothing about them');
});
