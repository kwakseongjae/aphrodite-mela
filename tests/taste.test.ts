import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deriveTaste,renderTaste,parseTaste,mergeTaste,EMPTY,type TasteProject,type TasteRun} from '../src/design/taste';

const projects=(): TasteProject[]=>[
  {id:'p1',brief:'따뜻하고 편집적인',systemName:'Atelier',font:'serif',variants:['hero:stacked','cta:panel']},
  {id:'p2',systemName:'Atelier',font:'serif',variants:['hero:stacked']},
  {id:'p3',systemName:'Toss',font:'sans',variants:['hero:full-bleed']},
];
const runs=(): TasteRun[]=>[
  {id:'r1',intent:'특징 섹션을 추가해 주세요',vibeWrote:['b1:title','b1:text'],personRewrote:['b1:title'],discarded:2},
  {id:'r2',vibeWrote:['b2:title','b2:label'],personRewrote:['b2:title','b2:label'],discarded:1},
];

test('consent off derives nothing at all, not merely nothing shown',()=>{
  const t=deriveTaste(projects(),runs(),'off','','2026-09-16');
  assert.deepEqual({...t,updated:''},EMPTY);
  assert.equal(t.chosen.length+t.corrected.length+t.rejected.length+t.said.length,0);
});

test('every line carries a count and the ids it came from',()=>{
  const t=deriveTaste(projects(),runs(),'global','2026-09-14','2026-09-16');
  for(const key of ['chosen','corrected','rejected','said'] as const)
    for(const line of t[key]){
      assert.ok(line.evidence.length>0,`${key}: "${line.text}" claims nothing`);
      assert.equal(line.count,line.evidence.length);
    }
});

test('what the machine wrote and the person rewrote is the sharpest signal',()=>{
  const t=deriveTaste(projects(),runs(),'global','2026-09-14','2026-09-16');
  const title=t.corrected.find(l=>l.text.includes('title'));
  assert.ok(title,'the title was rewritten in both runs');
  assert.equal(title!.count,2);
  assert.deepEqual(title!.evidence,['r1','r2']);
  // A field the person changed that Get Vibe never touched is not a correction of anything.
  const stray=deriveTaste([],[{id:'r9',vibeWrote:[],personRewrote:['b1:title']}],'global','','2026-09-16');
  assert.equal(stray.corrected.length,0);
});

test('anything chosen once is a project, not a habit',()=>{
  const t=deriveTaste(projects(),[],'global','','2026-09-16');
  assert.ok(t.chosen.some(l=>l.text.startsWith('hero:stacked')),'twice counts');
  assert.ok(!t.chosen.some(l=>l.text.startsWith('cta:panel')),'a variant used once does not');
  assert.ok(t.chosen.some(l=>l.text.startsWith('Atelier')),'two projects on Atelier counts');
  assert.ok(!t.chosen.some(l=>l.text.startsWith('Toss')),'one project on Toss says nothing about taste');
});

test('their own words are quoted, never summarised',()=>{
  const t=deriveTaste(projects(),runs(),'global','','2026-09-16');
  assert.ok(t.said.some(l=>l.text==='"따뜻하고 편집적인" (brief)'));
  assert.ok(t.said.some(l=>l.text.includes('특징 섹션을 추가해 주세요')));
});

test('the file round-trips, including the consent line',()=>{
  const t=deriveTaste(projects(),runs(),'global','2026-09-14','2026-09-16');
  const back=parseTaste(renderTaste(t));
  assert.equal(back.consent,'global');
  assert.equal(back.since,'2026-09-14');
  assert.equal(back.updated,'2026-09-16');
  for(const key of ['chosen','corrected','rejected','said'] as const)
    assert.deepEqual(back[key].map(l=>l.text),t[key].map(l=>l.text),key);
});

test('a line the person struck out does not come back',()=>{
  const derived=deriveTaste(projects(),runs(),'global','','2026-09-16');
  const onFile=parseTaste(renderTaste(derived));
  const struck={...onFile,chosen:onFile.chosen.filter(l=>!l.text.startsWith('Atelier'))};
  const merged=mergeTaste(derived,struck,derived);
  assert.ok(!merged.chosen.some(l=>l.text.startsWith('Atelier')),'it was removed on purpose');
  assert.ok(merged.chosen.length>0,'the rest survives');
});

test('a line the person wrote themselves is kept',()=>{
  const derived=deriveTaste(projects(),[],'global','','2026-09-16');
  const onFile=parseTaste(renderTaste(derived));
  onFile.chosen.push({text:'I like a lot of air at the top',count:0,evidence:[]});
  const merged=mergeTaste(derived,onFile,derived);
  assert.ok(merged.chosen.some(l=>l.text==='I like a lot of air at the top'),'their own line survives a re-derive');
});

test('a hand-edited file with no evidence brackets still reads',()=>{
  const t=parseTaste('# Taste\nconsent: project · since 2026-09-01\n\n## Chosen\n- serif, always\n');
  assert.equal(t.consent,'project');
  assert.deepEqual(t.chosen,[{text:'serif, always',count:0,evidence:[]}]);
});

/**
 * The file has to be readable or it is just a hidden profile in a text editor. Seventeen UUIDs on
 * one line is not readable, so the bracket shows a few short ids and says how many there were — and
 * the true count has to survive being read back.
 */
test('a long evidence list stays readable and keeps its count',()=>{
  const many=Array.from({length:15},(_,i)=>`${String(i).padStart(8,'0')}-4444-4444-4444-121212121212`);
  const t={...EMPTY,consent:'global' as const,since:'2026-09-14',updated:'2026-09-16',
    chosen:[{text:'Atelier — 14 of 17 projects',count:many.length,evidence:many}]};
  const text=renderTaste(t);
  const line=text.split('\n').find(l=>l.startsWith('- Atelier'))!;
  assert.ok(line.length<120,`a line nobody reads is no better than no file: ${line.length} chars`);
  assert.match(line,/15×/,'it says how many');
  const back=parseTaste(text);
  assert.equal(back.chosen[0].count,15,'the count survives the round trip');
  assert.equal(back.chosen[0].evidence.length,4,'only the shown ids come back, and that is honest');
});
