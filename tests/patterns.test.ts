import test from 'node:test';
import assert from 'node:assert/strict';
import { patternSpecs, type PatternKind } from '../src/patterns';
import { initialProject, makeBlock, parseProject, fingerprint, isApproved, catalog } from '../src/model';
import { componentIdentity, sceneManifest } from '../src/components';
import { patternHtml, planningHtml } from '../src/pattern-render';

test('all registered kinds and every pattern variation/state survive project and scene round trips',()=>{
  assert.equal(catalog.length,35);
  for (const kind of Object.keys(patternSpecs) as PatternKind[]) for(const variant of patternSpecs[kind].variants) for(const state of patternSpecs[kind].states){
    const p=initialProject(), b=makeBlock(kind); b.variant=variant;b.options={state,density:'compact',columns:2};p.pages[0].blocks=[b];
    const restored=parseProject(JSON.stringify(p));assert.deepEqual(restored.pages[0].blocks[0],b);
    const node=sceneManifest(restored).pages[0].nodes[0];assert.equal(node.variant,variant);assert.equal(node.options.state,state);
    assert.ok(patternHtml(b).length>100);assert.equal(componentIdentity(b).componentId,`aphrodite.${kind}`);
  }
});
test('invalid pattern options and cross-component variants reject import',()=>{
  for(const options of [{columns:99},{state:'missing'},{density:'" onclick="bad'},{media:'calendar'},{columns:'3'},{unknown:true}]){
    const p=initialProject();p.pages[0].blocks=[{...makeBlock('table'),options:options as never}];assert.throws(()=>parseProject(JSON.stringify(p)));
  }
  const p=initialProject();p.pages[0].blocks=[{...makeBlock('button'),variant:'week'}];assert.throws(()=>parseProject(JSON.stringify(p)));
});
test('variation/state edits invalidate approval; hero calendar retains editable child data',()=>{
  const p=initialProject(),b=p.pages[0].blocks[1];p.approvedFingerprint=fingerprint(p);
  b.options={media:'calendar',mediaText:'월|사용자 업무|진행 중',placeholder:'제품 미리보기'};
  assert.equal(isApproved(p),false);const q=parseProject(JSON.stringify(p));
  assert.equal(sceneManifest(q).pages[0].nodes[1].children[0].slots.text,'월|사용자 업무|진행 중');
});
test('all user-controlled pattern text is escaped, including status attributes',()=>{
  const payload='</script><img src=x onerror="alert(1)">';
  for(const kind of Object.keys(patternSpecs) as PatternKind[]){const b=makeBlock(kind);b.title=b.label=payload;b.text=`${payload}|${payload}|${payload}`;const html=patternHtml(b);assert.ok(!html.includes('<img'));assert.ok(!html.includes('</script>'));assert.ok(html.includes('&lt;'));}
});
test('planner variations render different editable structures and table exposes bounded controls',()=>{
  const text='월|검토|진행 중\n화|개발|완료';assert.match(planningHtml(text,'week'),/kit-lane/);assert.match(planningHtml(text,'agenda'),/kit-agenda/);assert.match(planningHtml(text,'board'),/<h3>진행 중/);
  assert.match(patternHtml(makeBlock('table')),/data-kit-search/);assert.match(patternHtml(makeBlock('table')),/scope="col"/);
});
