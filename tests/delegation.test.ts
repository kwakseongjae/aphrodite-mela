import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELEGATION_KEY,
  startDelegation,
  endDelegation,
  isBlockedWhileDelegated,
  delegationBannerHtml,
  delegationSummary,
  readDelegation,
  writeDelegation,
agentPanelHtml} from '../src/agent/delegation';
import {fingerprint,initialProject} from '../src/model';

function memory():Pick<Storage,'getItem'|'setItem'|'removeItem'>&{data:Map<string,string>}{
  const data=new Map<string,string>();
  return {
    data,
    getItem:key=>data.get(key)??null,
    setItem:(key,value)=>{data.set(key,value);},
    removeItem:key=>{data.delete(key);},
  };
}

test('start/end round trip records fingerprints, receipts and is immutable',()=>{
  const project=initialProject();
  const started='2026-09-10T12:00:00.000Z';
  const d=startDelegation(project,{operator:'Codex',intent:'Rebuild the hero from the reference'},started);
  assert.equal(d.projectId,project.id);
  assert.equal(d.startedAt,started);
  assert.equal(d.operator,'Codex');
  assert.equal(d.intent,'Rebuild the hero from the reference');
  assert.equal(d.startFingerprint,fingerprint(project));
  assert.equal(d.receipts,0);
  assert.equal(d.endedAt,undefined);
  assert.equal(d.outcome,undefined);
  assert.deepEqual(d.scope,{approve:false,deletePages:false,changeSystem:true,export:true});
  assert.match(d.id,/^[0-9a-f-]{36}$/i);

  const snapshot={...d,scope:{...d.scope}};
  project.pages[0].blocks[0].title='Changed heading';
  const ended=endDelegation(d,project,'returned',4,'2026-09-10T12:08:00.000Z');
  assert.deepEqual(d,snapshot);
  assert.equal(ended.id,d.id);
  assert.equal(ended.endedAt,'2026-09-10T12:08:00.000Z');
  assert.equal(ended.receipts,4);
  assert.equal(ended.outcome,'returned');
  assert.equal(ended.endFingerprint,fingerprint(project));
  assert.notEqual(ended.endFingerprint,ended.startFingerprint);

  const partial=startDelegation(project,{operator:'Astra',intent:'n',scope:{deletePages:true,changeSystem:false,export:false,approve:true as unknown as false}});
  assert.deepEqual(partial.scope,{approve:false,deletePages:true,changeSystem:false,export:false});
  assert.throws(()=>startDelegation(project,{operator:'x'.repeat(101),intent:'ok'}));
  assert.throws(()=>startDelegation(project,{operator:'ok',intent:'y'.repeat(1201)}));
  const max=startDelegation(project,{operator:'x'.repeat(100),intent:'y'.repeat(1200)});
  assert.equal(max.operator.length,100);
  assert.equal(max.intent.length,1200);
});

test('blocked-action matrix: approve always, others follow scope, inactive is open',()=>{
  const project=initialProject();
  const active=startDelegation(project,{operator:'Codex',intent:'assemble'});
  const defaults=['page-delete','delete-page'] as const;
  const system=['choose-system','systems','import-md'] as const;
  const exp=['export','download-bundle','save-project'] as const;

  assert.equal(isBlockedWhileDelegated(undefined,'approve'),false);
  assert.equal(isBlockedWhileDelegated(active,'approve'),true);
  assert.equal(isBlockedWhileDelegated(active,'edit'),false);
  for(const a of defaults)assert.equal(isBlockedWhileDelegated(active,a),true,a);
  for(const a of system)assert.equal(isBlockedWhileDelegated(active,a),false,a);
  for(const a of exp)assert.equal(isBlockedWhileDelegated(active,a),false,a);

  const locked=startDelegation(project,{operator:'Astra',intent:'lock',scope:{deletePages:false,changeSystem:false,export:false}});
  for(const a of [...system,...exp])assert.equal(isBlockedWhileDelegated(locked,a),true,a);
  assert.equal(isBlockedWhileDelegated(locked,'approve'),true);

  const open=startDelegation(project,{operator:'Astra',intent:'open',scope:{deletePages:true,changeSystem:true,export:true}});
  for(const a of [...defaults,...system,...exp])assert.equal(isBlockedWhileDelegated(open,a),false,a);
  assert.equal(isBlockedWhileDelegated(open,'approve'),true);

  const ended=endDelegation(active,project,'timeout',1);
  assert.equal(isBlockedWhileDelegated(ended,'approve'),false);
  assert.equal(isBlockedWhileDelegated(ended,'page-delete'),false);
  assert.equal(isBlockedWhileDelegated(ended,'systems'),false);
  assert.equal(isBlockedWhileDelegated(ended,'export'),false);
});

test('banner escapes operator and intent and keeps reclaim + receipt hooks',()=>{
  const project=initialProject();
  const d=startDelegation(project,{operator:'<script>alert(1)</script>',intent:'Click "ok" & <b>go</b>'},'2026-09-10T12:00:00.000Z');
  const ko=delegationBannerHtml(d,'ko');
  const en=delegationBannerHtml(d,'en');
  assert.match(ko,/에이전트가 조작 중/);
  assert.match(ko,/data-action="delegation-return"/);
  assert.match(ko,/<span data-delegation-receipts>/);
  assert.match(ko,/제어 회수/);
  assert.match(ko,/방향 승인은 잠겨 있습니다/);
  assert.doesNotMatch(ko,/<script>/);
  assert.doesNotMatch(ko,/<b>go<\/b>/);
  assert.match(ko,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(ko,/Click &quot;ok&quot; &amp; &lt;b&gt;go&lt;\/b&gt;/);
  assert.match(en,/Agent is operating/);
  assert.match(en,/Take control/);
  assert.match(en,/Approve is locked/);
  assert.match(en,/data-action="delegation-return"/);
  assert.doesNotMatch(en,/<script>/);
});

test('storage is tolerant of throws, bad JSON, and foreign-project active records',()=>{
  const project=initialProject();
  const other=initialProject();
  const storage=memory();
  const d=startDelegation(project,{operator:'Codex',intent:'keep going'});
  writeDelegation(storage,d);
  assert.equal(storage.data.get(DELEGATION_KEY),JSON.stringify(d));
  assert.deepEqual(readDelegation(storage,project.id),d);
  assert.deepEqual(readDelegation(storage,other.id),d);

  writeDelegation(storage,undefined);
  assert.equal(storage.data.has(DELEGATION_KEY),false);
  assert.equal(readDelegation(storage,project.id),undefined);

  storage.setItem(DELEGATION_KEY,'{bad');
  assert.equal(readDelegation(storage,project.id),undefined);
  storage.setItem(DELEGATION_KEY,JSON.stringify({id:1}));
  assert.equal(readDelegation(storage,project.id),undefined);

  const boom={
    getItem:()=>{throw new Error('denied');},
    setItem:()=>{throw new Error('denied');},
    removeItem:()=>{throw new Error('denied');},
  };
  assert.equal(readDelegation(boom,project.id),undefined);
  writeDelegation(boom,d);
  writeDelegation(boom,undefined);
});

test('summary names operator, intent, window, receipts, fingerprint change and outcome',()=>{
  const project=initialProject();
  const open=startDelegation(project,{operator:'Astra',intent:'Pin the frame then insert cards'},'2026-09-10T12:00:00.000Z');
  const openText=delegationSummary(open);
  assert.match(openText,/operator: Astra/);
  assert.match(openText,/intent: Pin the frame then insert cards/);
  assert.match(openText,/started: 2026-09-10T12:00:00.000Z/);
  assert.match(openText,/ended: open/);
  assert.match(openText,/receipts: 0/);
  assert.match(openText,/fingerprint changed: no/);
  assert.match(openText,/outcome: active/);

  const same=endDelegation(open,project,'ended-by-agent',7,'2026-09-10T12:04:00.000Z');
  const sameText=delegationSummary(same);
  assert.match(sameText,/ended: 2026-09-10T12:04:00.000Z/);
  assert.match(sameText,/receipts: 7/);
  assert.match(sameText,/fingerprint changed: no/);
  assert.match(sameText,/outcome: ended-by-agent/);

  project.name='Form & Field revised';
  const changed=endDelegation(open,project,'returned',2,'2026-09-10T12:05:00.000Z');
  assert.match(delegationSummary(changed),/fingerprint changed: yes/);
  assert.match(delegationSummary(changed),/outcome: returned/);
});

test('agent panel lists scope, timeline and the take-control button',()=>{
  const d=startDelegation(initialProject(),{operator:'Codex computer use',intent:'Rebuild the hero',scope:{deletePages:false,changeSystem:false,export:true}},'2026-09-10T08:00:00.000Z');
  const html=agentPanelHtml(d,[{seq:1,kind:'run:started',at:'2026-09-10T08:00:01.000Z'},{seq:2,kind:'catalog:added',at:'2026-09-10T08:00:09.000Z'}],'en');
  assert.match(html,/Agent console/);
  assert.match(html,/Codex computer use/);
  assert.match(html,/data-action="delegation-return"/);
  assert.match(html,/Frame<span>Whole space/);
  assert.match(html,/Approve direction<span>locked/);
  assert.match(html,/Change design system<span>locked/);
  assert.match(html,/Export · save<span>allowed/);
  assert.ok(html.indexOf('#2')<html.indexOf('#1'),'newest receipt first');
  const ko=agentPanelHtml(d,[],'ko');
  assert.match(ko,/아직 기록이 없습니다/);
  assert.match(ko,/프레임<span>전체 공간/);
});

test('frame-scoped delegation validates frameId, blocks other frames, and names the frame in the panel',()=>{
  const project=initialProject();
  const frameId=project.pages[0].id;
  project.pages.push({id:'other-page',name:'About',blocks:[]});
  const scoped=startDelegation(project,{operator:'Codex',intent:'Stay on home',scope:{frameId,deletePages:true}});
  assert.equal(scoped.scope.frameId,frameId);
  assert.throws(()=>startDelegation(project,{operator:'Codex',intent:'n',scope:{frameId:'missing-page'}}),{message:'frameId must be a page of this project'});

  assert.equal(isBlockedWhileDelegated(scoped,'page',{id:frameId}),false);
  assert.equal(isBlockedWhileDelegated(scoped,'page',{id:'other-page'}),true);
  assert.equal(isBlockedWhileDelegated(scoped,'frame-move',{id:frameId}),false);
  assert.equal(isBlockedWhileDelegated(scoped,'frame-preset',{id:frameId}),false);
  assert.equal(isBlockedWhileDelegated(scoped,'frame-move',{id:'other-page'}),true);
  assert.equal(isBlockedWhileDelegated(scoped,'frame-preset',{id:'other-page'}),true);
  assert.equal(isBlockedWhileDelegated(scoped,'page-delete'),true);
  assert.equal(isBlockedWhileDelegated(scoped,'delete-page'),true);
  assert.equal(isBlockedWhileDelegated(scoped,'add-page'),true);
  assert.equal(isBlockedWhileDelegated(scoped,'new-frame'),true);
  assert.equal(isBlockedWhileDelegated(scoped,'edit'),false);
  assert.equal(isBlockedWhileDelegated(scoped,'approve'),true);

  const unscoped=startDelegation(project,{operator:'Astra',intent:'whole space'});
  assert.equal(unscoped.scope.frameId,undefined);
  assert.equal(isBlockedWhileDelegated(unscoped,'add-page'),false);
  assert.equal(isBlockedWhileDelegated(unscoped,'page',{id:'other-page'}),false);
  assert.equal(isBlockedWhileDelegated(unscoped,'frame-move',{id:'other-page'}),false);

  const en=agentPanelHtml(scoped,[],'en',{frameName:'Home & <x>'});
  assert.match(en,/Frame<span>Home &amp; &lt;x&gt;/);
  assert.doesNotMatch(en,/<x>/);
  const ko=agentPanelHtml(scoped,[],'ko',{frameName:'홈'});
  assert.match(ko,/프레임<span>홈/);
  assert.doesNotMatch(ko,/전체 공간/);

  const storage=memory();
  writeDelegation(storage,scoped);
  assert.deepEqual(readDelegation(storage,project.id),scoped);
});
