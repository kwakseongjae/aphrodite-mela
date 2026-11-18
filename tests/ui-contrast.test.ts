import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrastRatio} from '../src/design/contrast';
import {pairs,resolve,themes,type Theme} from '../src/ui/tokens';

const components=readFileSync(new URL('../src/ui/components.css',import.meta.url),'utf8');

/**
 * Contrast is computed from the source, in both themes, so a value cannot be nudged into a pair that
 * no longer reads. 4.5 for text, 3 for large text and for graphics (WCAG 2.1, 1.4.3 and 1.4.11).
 */
for(const theme of Object.keys(themes) as Theme[]){
  test(`every foreground reads on its background in the ${theme} theme`,()=>{
    const short:string[]=[];
    for(const {fg,bg,min,short:known} of pairs){
      const a=resolve(theme,fg),b=resolve(theme,bg);
      assert.ok(a&&b,`${fg} on ${bg} does not resolve to two colours in ${theme}`);
      const ratio=contrastRatio(a,b);
      if(known?.[theme]){
        assert.ok(ratio<min,`${fg} on ${bg} reaches ${ratio.toFixed(2)}:1 in ${theme} now: remove its \`short\` note in tokens.ts`);
        assert.ok(known[theme]!.length>20,`${fg} on ${bg} is let off in ${theme} without a reason`);
        continue;
      }
      if(ratio<min)short.push(`${fg} on ${bg}: ${ratio.toFixed(2)}:1, under ${min}`);
    }
    assert.deepEqual(short,[],`pairs under their minimum in ${theme}`);
  });
}

test('a pair is let off its minimum in one place only, and never a text pair',()=>{
  const let_off=pairs.filter(p=>p.short);
  assert.deepEqual(let_off.map(p=>`${p.fg}/${p.bg}`),['accent/bg-panel'],'a new exception needs the owner, not a test edit');
  for(const p of let_off)assert.equal(p.min,3,'text has no exceptions');
});

test('the ratios are the ones the approved direction showed',()=>{
  // Read off lab/review-board/proposals/0.3-F/shots/06-system-*.png: the resolver agrees with the sheet.
  const seen=(theme:Theme,fg:string,bg:string)=>Number(contrastRatio(resolve(theme,fg)!,resolve(theme,bg)!).toFixed(2));
  assert.equal(seen('light','text-1','bg-panel'),16.07);
  assert.equal(seen('light','text-2','bg-panel'),5.44);
  assert.equal(seen('light','text-3','bg-panel'),3.52);
  assert.equal(seen('light','on-select','select'),4.77);
  assert.equal(seen('light','agent-text','agent-soft'),4.70);
  assert.equal(seen('dark','text-1','bg-panel'),15.49);
  assert.equal(seen('dark','text-3','bg-panel'),4.56);
  assert.equal(seen('dark','select','bg-canvas'),3.82);
});

test('every colour a component writes text in is checked against a background',()=>{
  const checked=new Set(pairs.map(p=>p.fg));
  const used=new Set([...components.matchAll(/(?:^|[;{\s])color\s*:\s*var\(--ui-([\w-]+)\)/g)].map(m=>m[1]));
  assert.ok(used.size>5,'components.css writes text in token colours');
  for(const role of used)assert.ok(checked.has(role),`components.css writes text in --ui-${role}, which no pair in tokens.ts checks`);
});
