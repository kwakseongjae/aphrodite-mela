import {test} from 'node:test';
import assert from 'node:assert/strict';
import {designMarkdown} from '../src/design/contract';
import {importDesignMarkdown,initialProject,systems} from '../src/model';
import {semanticTokens,resolveTokens} from '../src/design/tokens';

const atelier=systems.find(s=>s.id==='atelier')!;

test('the contract states every colour the page is painted with, not only what was chosen',()=>{
  const p=initialProject();
  const md=designMarkdown(p);
  const resolved=resolveTokens(p.system);
  for(const name of semanticTokens){
    assert.match(md,new RegExp(`^${name}: ${resolved[name]}$`,'m'),`${name} is missing from the contract`);
  }
  assert.match(md,/^primary: #[0-9a-f]{6}$/mi);
});

test('the fonts it states are the fonts the pages use',()=>{
  const md=designMarkdown(initialProject());
  assert.match(md,/heading font: Georgia.*Nanum Myeongjo/,'including the Korean faces Georgia cannot draw');
  assert.match(md,/body font: Arial.*Pretendard/);
  assert.doesNotMatch(md,/Headings: Georgia, Times New Roman, serif;/,'the old sentence claimed a Latin-only stack');
});

test('a type scale is described in words a person can act on',()=>{
  const p=initialProject();
  p.system.type={heading:{family:'Nanum Myeongjo',size:48,weight:700,lineHeight:1.1},body:{size:16}};
  const md=designMarkdown(p);
  assert.match(md,/^heading: family Nanum Myeongjo, 48px, weight 700, line-height 1\.1$/m);
  assert.match(md,/^body: 16px$/m,'a role that only sets a size says only that');
  assert.doesNotMatch(md,/^caption:/m,'and a role nobody set is not invented');
});

test('what this prototype cannot paint is written down rather than dropped',()=>{
  const p=initialProject();
  p.system.carried={'color.link':'#1b64da','color.primary-hover':'#2272eb'};
  const md=designMarkdown(p);
  assert.match(md,/design-md:carried/);
  assert.match(md,/not painted by this prototype/);
  assert.match(md,/^color\.link: #1b64da$/m);
});

test('a contract this app wrote comes back with everything it said',()=>{
  const source=initialProject();
  Object.assign(source.system,{surface:'#f2f4f6',line:'#e5e8eb',muted:'#8b95a1',danger:'#e42939',carried:{'color.link':'#1b64da'}});
  const back=importDesignMarkdown(designMarkdown(source),'toss.md',atelier);
  assert.equal(back.accent,source.system.accent);
  assert.equal(back.surface,'#f2f4f6');
  assert.equal(back.line,'#e5e8eb');
  assert.equal(back.muted,'#8b95a1');
  assert.equal(back.danger,'#e42939');
  assert.equal(back.carried?.['color.link'],'#1b64da','carried tokens survive the round trip');
});

test('importing keeps a colour it cannot paint instead of losing it',()=>{
  const back=importDesignMarkdown(['primary: #3182f6','surface: #f2f4f6','link blue: #1b64da','weak background: #e8f3ff'].join('\n'),'brand.md',atelier);
  assert.equal(back.accent,'#3182f6');
  assert.equal(back.surface,'#f2f4f6');
  assert.deepEqual(back.carried,{'link-blue':'#1b64da','weak-background':'#e8f3ff'},'a human label becomes a key without losing which colour it was');
});

test('an import with nothing labelled is still refused',()=>{
  assert.throws(()=>importDesignMarkdown('a page about the colour #3182f6','x.md',atelier),/찾지 못했습니다/);
});

test('a brand is met in its own vocabulary, in preference order',()=>{
  // The shape real design documents use: a labelled list, body colour named before the muted one.
  const brand=[
    '## 2. Color Palette & Roles',
    'primary: #3182f6',
    'canvas: #ffffff',
    'foreground: #191f28',
    'body: #4e5968',
    'muted: #8b95a1',
    'surface: #f2f4f6',
    'border: #e5e8eb',
    'error red: #e42939',
  ].join('\n');
  const s=importDesignMarkdown(brand,'brand.md',atelier);
  assert.equal(s.line,'#e5e8eb','a brand says border where we say line');
  assert.equal(s.muted,'#8b95a1','not the body colour it mentioned first');
  assert.equal(s.surface,'#f2f4f6');
  assert.equal(s.danger,'#e42939','and error where we say danger');
  assert.equal(s.carried?.body,'#4e5968','the colour we did not take is still kept');
});

test('a token we implement is never left in carried as well',()=>{
  const s=importDesignMarkdown(['primary: #3182f6','border: #e5e8eb','hairline: #cccccc'].join('\n'),'b.md',atelier);
  assert.equal(s.line,'#e5e8eb');
  assert.equal(s.carried?.hairline,undefined,'a synonym of a token we took is not carried twice');
  assert.equal(s.carried?.border,undefined);
});
