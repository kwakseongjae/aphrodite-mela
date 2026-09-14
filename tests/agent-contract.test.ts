import {test} from 'node:test';
import assert from 'node:assert/strict';
import {designContract,designTokens,componentVocabulary,componentKinds,describeImage,MAX_BLOCKS} from '../src/agent/contract';
import {initialProject,makeBlock,type Project} from '../src/model';

function project():Project{
  const p=initialProject();
  p.name='빛공방';p.brief='따뜻하고 편집적인 조명 브랜드';
  p.pages[0].blocks=[makeBlock('hero',true),makeBlock('features',true)];
  p.pages[0].blocks[0].image='local:0123456789abcdef';
  return p;
}

test('the contract names pages, frames and components in design words',()=>{
  const p=project();
  const c=designContract(p,p.pages[0].blocks[1].id) as Record<string,any>;
  assert.equal(c.schema,'aphrodite.contract/1');
  assert.equal(c.project.name,'빛공방');
  assert.equal(c.project.page_count,1);
  assert.equal(c.system.id,p.system.id);
  assert.deepEqual(c.selection,{block_id:p.pages[0].blocks[1].id,kind:'features',page_id:p.pages[0].id});
  const page=c.pages[0];
  assert.equal(page.page_id,p.pages[0].id);
  assert.equal(page.active,true);
  assert.equal(page.block_count,2);
  assert.equal(page.blocks[0].kind,'hero');
  assert.equal(page.blocks[0].image,'local:0123456789abcdef','a local reference passes through as-is');
  assert.ok(page.frame.preset,'the frame carries its preset and width');
});

test('nothing is selected is said plainly rather than guessed at',()=>{
  const p=project();
  assert.equal((designContract(p,'') as Record<string,any>).selection,null);
  assert.equal((designContract(p,'no-such-block') as Record<string,any>).selection,null);
});

test('concise leaves body text out and detailed puts it back',()=>{
  const p=project();
  p.pages[0].blocks[0].text='A long paragraph about light.';
  const concise=(designContract(p,'') as Record<string,any>).pages[0].blocks[0];
  assert.equal(concise.text,undefined);
  assert.equal(concise.text_length,29);
  const detailed=(designContract(p,'',{format:'detailed'}) as Record<string,any>).pages[0].blocks[0];
  assert.equal(detailed.text,'A long paragraph about light.');
});

test('an inline image is described, never carried',()=>{
  assert.equal(describeImage(''),'');
  assert.equal(describeImage('local:0123456789abcdef'),'local:0123456789abcdef');
  assert.equal(describeImage('/assets/lighting-hero.png'),'/assets/lighting-hero.png');
  const inline=describeImage(`data:image/png;base64,${'A'.repeat(4000)}`);
  assert.match(inline,/^inline:image\/png:\d+$/);
  const p=project();
  p.pages[0].blocks[0].image=`data:image/jpeg;base64,${'A'.repeat(200_000)}`;
  const c=JSON.stringify(designContract(p,''));
  assert.ok(c.length<4_000,`the contract stayed small (${c.length} chars)`);
  assert.match(c,/inline:image\/jpeg:/);
});

test('a big project comes back trimmed with a way to ask for less',()=>{
  const p=project();
  for(let i=0;i<12;i++)p.pages.push({id:`page-${i}`,name:`Page ${i}`,blocks:[makeBlock('cta')]});
  const c=designContract(p,'') as Record<string,any>;
  assert.equal(c.pages.length,8);
  assert.equal(c.truncated,true);
  assert.match(c.hint,/page_id/);
  const one=designContract(p,'',{pageId:'page-3'}) as Record<string,any>;
  assert.equal(one.pages.length,1);
  assert.equal(one.pages[0].page_id,'page-3');
  assert.equal(one.truncated,undefined);
});

test('too many components on one page are trimmed and flagged',()=>{
  const p=project();
  p.pages[0].blocks=Array.from({length:MAX_BLOCKS+5},()=>makeBlock('cta'));
  const c=designContract(p,'') as Record<string,any>;
  assert.equal(c.pages[0].blocks.length,MAX_BLOCKS);
  assert.equal(c.pages[0].block_count,MAX_BLOCKS+5);
  assert.equal(c.pages[0].blocks_truncated,true);
  assert.equal(c.truncated,true);
});

test('asking for a page that is not there says which ones are',()=>{
  const p=project();
  const c=designContract(p,'',{pageId:'nope'}) as Record<string,any>;
  assert.match(c.error,/no page "nope"/);
  assert.match(c.error,new RegExp(p.pages[0].id));
});

test('tokens come back with the variable names the page is painted with',()=>{
  const p=project();
  const css='--brand:#344e41;--on-brand:#fff;--paper:#faf8f3;--ink:#292d27;--radius:2px;--heading:Georgia,serif;--body:system-ui';
  const t=designTokens(p,css) as Record<string,any>;
  assert.equal(t.schema,'aphrodite.tokens/1');
  assert.equal(t.tokens['--brand'],'#344e41');
  assert.equal(t.tokens['--radius'],'2px');
  assert.equal(t.css,css);
  assert.match(t.usage,/var\(--brand\)/,'it says to use the names, not the values');
  assert.ok(t.fonts.heading.length>0);
});

test('the component vocabulary lists every kind with its variants and providers',()=>{
  const v=componentVocabulary() as Record<string,any>;
  assert.equal(v.schema,'aphrodite.components/1');
  const hero=v.components.find((c:any)=>c.component_kind==='hero');
  assert.ok(hero,'hero is in the catalogue');
  assert.ok(hero.variants.includes('stacked'));
  assert.ok(hero.name&&hero.description&&hero.group);
  assert.deepEqual(componentKinds().slice(0,3),['frame','navigation','hero']);
  assert.ok(componentKinds().length>10);
});
