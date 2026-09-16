import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/moa.css',import.meta.url),'utf8');
/** A fallback inside `var(--x, #hex)` is the contract's own default, not a colour of its own. */
const withoutFallbacks=css.replace(/var\(--[a-z-]+,\s*#[0-9a-fA-F]{3,8}\)/g,'VAR');

/**
 * The product's one promise is that a single design contract drives everything. The app recipe
 * opted out of it: sixty-seven hard-coded colours and a single `var(--brand)`, so swapping the
 * design system left the whole app screen untouched — and on a dark system its headings and figures
 * went dark-on-dark and could not be read.
 *
 * This is not a style preference. A screen that ignores the contract is a screen the product cannot
 * honestly claim to have made.
 */
test('the app recipe names no colour of its own',()=>{
  const hex=withoutFallbacks.match(/#[0-9a-fA-F]{3,8}/g)??[];
  assert.deepEqual(hex,[],`hard-coded colours are back: ${hex.join(', ')}`);
  const literals=(withoutFallbacks.match(/:[^;{}]*\b(?:white|black)\b/g)??[]).filter(l=>!l.includes('space'));
  assert.deepEqual(literals,[],`literal colours are back: ${literals.join(', ')}`);
});

test('it paints from the layers, and the layers come from the contract',()=>{
  for(const layer of ['--moa-ground','--moa-face','--moa-line','--moa-quiet','--moa-wash'])
    assert.match(css,new RegExp(`${layer}\\s*:`),`${layer} is not defined`);
  // Each layer has to be built out of the contract, or it is a constant with a nicer name.
  const block=css.match(/\[data-app-frame\][^{]*\{([^}]*)\}/)?.[1]??'';
  for(const layer of ['--moa-ground','--moa-face','--moa-line','--moa-quiet','--moa-wash']){
    const value=block.match(new RegExp(`${layer}\\s*:([^;]*)`))?.[1]??'';
    assert.match(value,/var\(--(paper|ink|brand)/,`${layer} does not read the contract: ${value}`);
  }
});

test('status colours are the contract\'s, not a second opinion',()=>{
  assert.match(css,/var\(--success/,'done is the contract\'s success');
  assert.match(css,/var\(--warning/,'waiting is the contract\'s warning');
});
