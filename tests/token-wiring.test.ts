import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticTokens} from '../src/design/tokens';

const page=readFileSync(new URL('../src/page.css',import.meta.url),'utf8');
const patterns=readFileSync(new URL('../src/patterns.css',import.meta.url),'utf8');
const css=page+patterns;

/**
 * The page is painted from the contract, not from constants. A colour that is not behind a token is
 * a decision the renderer made for itself, which no design system can reach — which is how importing
 * a brand used to leave its notices the wrong red.
 */
test('every colour the page is painted with is behind a token',()=>{
  const loose=[...css.matchAll(/(^|[^(,])(#[0-9a-fA-F]{3,8})\b/g)].map(m=>m[2]);
  // Not theme colours: a shadow, and white text over a photograph. Both exist to stay legible
  // whatever the design system says, so a system must not be able to reach them.
  const allowed=new Set(['#fff','#000','#0000000d']);
  const stray=loose.filter(hex=>!allowed.has(hex.toLowerCase()));
  assert.deepEqual(stray,[],`these colours are not behind a token: ${stray.join(', ')}`);
});

test('each token is actually read by the page',()=>{
  for(const name of semanticTokens){
    if(name==='muted'){
      assert.match(css,/var\(--muted-fade,/,'dimmed text asks the system how faded it should be');
      continue;
    }
    assert.match(css,new RegExp(`var\\(--${name},`),`nothing reads --${name}`);
  }
});

test('a token always carries the value the renderer used before it existed',()=>{
  for(const [,name,fallback] of css.matchAll(/var\((--(?:surface|line|danger|success|warning)),\s*([^)]+)\)/g)){
    assert.match(fallback.trim(),/^#[0-9a-fA-F]{3,6}$/,`${name} falls back to something that is not a colour: ${fallback}`);
  }
});

test('text that has its own colour keeps it',()=>{
  // The brand-coloured index in a numbered feature row is dimmed, not recoloured: a muted colour is
  // for text that takes the ink, and this takes the brand.
  assert.match(css,/\.feature-symbol\{[^}]*color:var\(--brand\)/);
  const numbered=css.match(/\[data-variant="numbered"\][^{]*\.feature-symbol\{([^}]*)\}/);
  assert.ok(numbered,'the numbered variant still styles its index');
  assert.doesNotMatch(numbered![1],/color:/,'and does not overwrite the brand colour with muted');
});
