import {test} from 'node:test';
import assert from 'node:assert/strict';
import {semanticTokens,typeRoles,paintedToday,isColour,mix,resolveTokens,tokenVars,sanitizeTypeRole,sanitizeTypeScale,MUTED_MIX} from '../src/design/tokens';
import {initialProject,parseProject} from '../src/model';

const atelier={foreground:'#292d27',background:'#faf8f3'};

test('a system that says nothing is painted exactly as it is painted today',()=>{
  const resolved=resolveTokens(atelier);
  assert.equal(resolved.line,'#dfe3eb','the variable the page css already reads');
  assert.equal(resolved.danger,'#ba3030','the red the notice component shows');
  assert.equal(resolved.success,'#187345');
  assert.equal(resolved.warning,'#a76600');
  assert.equal(resolved.surface,'#d9d4c8');
  for(const name of semanticTokens)assert.ok(isColour(resolved[name]),`${name} resolved to a colour`);
});

test('a system that names a token wins over what we paint today',()=>{
  const toss={...atelier,surface:'#f2f4f6',line:'#e5e8eb',muted:'#8b95a1'};
  const resolved=resolveTokens(toss);
  assert.equal(resolved.surface,'#f2f4f6');
  assert.equal(resolved.line,'#e5e8eb');
  assert.equal(resolved.muted,'#8b95a1');
  assert.equal(resolved.danger,paintedToday.danger,'what it does not name stays as it was');
});

test('nonsense is ignored rather than painted',()=>{
  const resolved=resolveTokens({...atelier,line:'red' as string,danger:'#xyzxyz' as string,surface:'' as string});
  assert.equal(resolved.line,paintedToday.line);
  assert.equal(resolved.danger,paintedToday.danger);
  assert.equal(resolved.surface,paintedToday.surface);
  assert.equal(isColour('#abc'),false,'three digits are not accepted; the renderer writes six');
  assert.equal(isColour('#AABBCC'),true);
  assert.equal(isColour(42),false);
});

test('muted defaults to what dimmed text already looks like over the paper',()=>{
  const resolved=resolveTokens(atelier);
  assert.equal(resolved.muted,mix('#292d27','#faf8f3',MUTED_MIX));
  assert.equal(mix('#000000','#ffffff',0.5),'#808080');
  assert.equal(mix('#000000','#ffffff',1),'#000000');
  assert.equal(mix('#000000','#ffffff',0),'#ffffff');
  assert.equal(mix('nope','#ffffff'),'nope','a bad colour is handed back rather than blended into nonsense');
});

test('the css names every token once',()=>{
  const css=tokenVars(atelier);
  for(const name of semanticTokens)assert.match(css,new RegExp(`--${name}:#[0-9a-f]{6}`),name);
  assert.equal(css.split(';').length,semanticTokens.length);
});

test('a type role keeps only what a page can be painted with',()=>{
  assert.deepEqual(sanitizeTypeRole({family:'Nanum Myeongjo',size:48,weight:650,lineHeight:1.156}),{family:'Nanum Myeongjo',size:48,weight:700,lineHeight:1.16});
  assert.equal(sanitizeTypeRole({size:2}),undefined,'two pixels is not a size');
  assert.equal(sanitizeTypeRole({size:5000}),undefined);
  assert.equal(sanitizeTypeRole({weight:50}),undefined);
  assert.equal(sanitizeTypeRole({lineHeight:9}),undefined);
  assert.equal(sanitizeTypeRole({}),undefined);
  assert.equal(sanitizeTypeRole('serif'),undefined);
  assert.equal(sanitizeTypeRole(null),undefined);
});

test('a type scale keeps the three roles and drops anything else',()=>{
  const scale=sanitizeTypeScale({heading:{size:48},body:{size:16},caption:{size:11},footer:{size:9}});
  assert.deepEqual(Object.keys(scale!).sort(),[...typeRoles].sort());
  assert.equal((scale as Record<string,unknown>).footer,undefined,'a role we cannot paint is not kept');
  assert.equal(sanitizeTypeScale({heading:{size:2}}),undefined,'nothing usable means no scale at all');
  assert.equal(sanitizeTypeScale([]),undefined);
});

test('a project round-trips the new half of the contract, and drops what it cannot paint',()=>{
  const base=initialProject();
  const raw=JSON.parse(JSON.stringify(base));
  raw.system.surface='#f2f4f6';
  raw.system.line='#e5e8eb';
  raw.system.danger='not a colour';
  raw.system.type={heading:{family:'Nanum Myeongjo',size:48},body:{size:16},footer:{size:9}};
  raw.system.carried={'color.link':'#1b64da','color.primary-hover':'#2272eb','BAD KEY':'x'};
  const parsed=parseProject(JSON.stringify(raw));
  assert.equal(parsed.system.surface,'#f2f4f6','a real value survives');
  assert.equal(parsed.system.line,'#e5e8eb');
  assert.equal(parsed.system.danger,undefined,'a bad value is dropped, not thrown');
  assert.deepEqual(parsed.system.type?.heading,{family:'Nanum Myeongjo',size:48});
  assert.equal(parsed.system.type?.caption,undefined);
  assert.deepEqual(parsed.system.carried,{'color.link':'#1b64da','color.primary-hover':'#2272eb'},'what nothing renders is still carried, verbatim');
  assert.equal(JSON.parse(JSON.stringify(parsed)).system.carried['color.link'],'#1b64da','and survives being saved again');
});

test('an old project without any of this still opens and paints as before',()=>{
  const parsed=parseProject(JSON.stringify(initialProject()));
  for(const token of semanticTokens)assert.equal((parsed.system as Record<string,unknown>)[token],undefined);
  assert.equal(parsed.system.type,undefined);
  const resolved=resolveTokens(parsed.system);
  assert.equal(resolved.danger,paintedToday.danger,'and resolves to what the renderer paints today');
});
