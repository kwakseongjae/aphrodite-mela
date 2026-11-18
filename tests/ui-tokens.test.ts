import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tokensCss,tokensDoc,primitives,themes} from '../src/ui/tokens';

/**
 * The app's own look has one source, `src/ui/tokens.ts`, and `src/ui/tokens.css` is what it renders.
 *
 * A value edited in the stylesheet and not in the source is the drift this refuses: the next build
 * would quietly put the old value back. Change the source, then `node scripts/build-ui-tokens.mjs`.
 */
test('the generated stylesheet is exactly what the source renders',()=>{
  const css=readFileSync(new URL('../src/ui/tokens.css',import.meta.url),'utf8');
  assert.equal(css,tokensCss(),'src/ui/tokens.css is out of date: run node scripts/build-ui-tokens.mjs');
});

test('the token table in the guide is the one the source renders',()=>{
  const doc=readFileSync(new URL('../docs/UI-SYSTEM.md',import.meta.url),'utf8');
  assert.ok(doc.includes(`<!-- tokens:start -->\n${tokensDoc()}<!-- tokens:end -->`),'docs/UI-SYSTEM.md has an old token table: run node scripts/build-ui-tokens.mjs');
});

test('every name the stylesheet defines is the app\'s own, so nothing already on the page is redefined',()=>{
  const names=[...tokensCss().matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]);
  assert.ok(names.length>50,'the stylesheet defines the tokens');
  for(const name of names)assert.match(name,/^--ui-/,`${name} is not prefixed, and could collide with a property an existing screen or a design already uses`);
});

test('the stylesheet holds custom properties and nothing a screen would draw differently',()=>{
  // `color-scheme` on :root would repaint native scrollbars and form controls on every existing screen
  // the moment the Mac is in dark mode. It is set by .ui-root in components.css, from a token.
  const declarations=[...tokensCss().replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([\w-]+)\s*:[^;{}]*;/g)].map(m=>m[1]);
  for(const property of declarations)assert.match(property,/^--ui-/,`tokens.css sets ${property}, which is not a custom property`);
});

test('both themes give every role a value, and a role that names a primitive names one that exists',()=>{
  const light=Object.keys(themes.light).sort(),dark=Object.keys(themes.dark).sort();
  assert.deepEqual(dark,light,'the dark theme defines the same roles as the light theme');
  for(const [theme,roles] of Object.entries(themes))for(const [role,value] of Object.entries(roles)){
    const ref=String(value).match(/^\{([\w-]+)\}$/);
    if(ref)assert.ok(ref[1] in primitives,`${theme}.${role} names {${ref[1]}}, which is not a primitive`);
  }
});
