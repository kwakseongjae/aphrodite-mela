import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokensJson,semanticTokens,resolveTokens,paintedToday} from '../src/design/tokens';
import {initialProject} from '../src/model';

const system=()=>initialProject().system;

/**
 * The export is the product's promise: hand this folder to a coding agent and it builds what you
 * approved. A contract that names three colours while the page paints nine breaks that promise
 * quietly — whoever picks it up guesses the rest back out of the HTML.
 */
test('every colour the app paints with is in the contract',()=>{
  const out=tokensJson(system()) as {color:Record<string,{$value:string}>};
  for(const name of semanticTokens)
    assert.ok(out.color[name],`${name} is resolved and painted but never handed over`);
  for(const name of ['primary','background','foreground'])
    assert.ok(out.color[name],`${name} missing`);
});

test('a default is written down, not left out',()=>{
  // "Unopinionated" here would just move the decision into someone else's constants.
  const out=tokensJson(system()) as {color:Record<string,{$value:string}>};
  assert.equal(out.color.danger.$value,paintedToday.danger);
  assert.equal(out.color.line.$value,paintedToday.line);
});

test('a system that names a token wins over the default',()=>{
  const out=tokensJson({...system(),danger:'#ff0000',surface:'#101010'}) as {color:Record<string,{$value:string}>};
  assert.equal(out.color.danger.$value,'#ff0000');
  assert.equal(out.color.surface.$value,'#101010');
  assert.equal(out.color.danger.$value,resolveTokens({...system(),danger:'#ff0000'}).danger,'the export and the renderer resolve the same way');
});

test('the shape is DTCG, so a build tool can read it without a converter',()=>{
  const out=tokensJson(system()) as Record<string,any>;
  assert.match(String(out.$schema),/designtokens\.org/);
  for(const entry of Object.values(out.color as Record<string,{$type:string;$value:string}>)){
    assert.equal(entry.$type,'color');
    assert.match(entry.$value,/^#[0-9a-fA-F]{6}$/);
  }
  assert.equal(out.radius.$type,'dimension');
  assert.match(String(out.radius.$value),/px$/);
});

test('the typefaces travel, and the scale only when there is one',()=>{
  const bare=tokensJson(system()) as Record<string,any>;
  assert.ok(bare.font.heading.$value,'a page has a heading face even with no scale set');
  assert.equal('type' in bare,false,'an empty scale is not an empty object in the file');
  const scaled=tokensJson({...system(),type:{heading:{size:64,weight:400,lineHeight:1.05}}}) as Record<string,any>;
  assert.equal(scaled.type.heading.fontSize.$value,'64px');
  assert.equal(scaled.type.heading.fontWeight.$value,400);
  assert.equal(scaled.type.heading.lineHeight.$value,1.05);
});
