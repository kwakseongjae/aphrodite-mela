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

/** OKLCH lightness, chroma and hue of an sRGB colour (Björn Ottosson's OKLab). */
function oklch(r:number,g:number,b:number){
  const lin=(c:number)=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
  const [R,G,B]=[lin(r),lin(g),lin(b)];
  const l=Math.cbrt(0.4122214708*R+0.5363325363*G+0.0514459929*B),m=Math.cbrt(0.2119034982*R+0.6806995451*G+0.1073969566*B),s=Math.cbrt(0.0883024619*R+0.2817188376*G+0.6299787005*B);
  const L=0.2104542553*l+0.7936177850*m-0.0040720468*s,a=1.9779984951*l-2.4285922050*m+0.4505937099*s,bb=0.0259040371*l+0.7827717662*m-0.8086757660*s;
  return {L,C:Math.hypot(a,bb),h:(Math.atan2(bb,a)*180/Math.PI+360)%360};
}
/** Every colour the stylesheet writes, as [token, colour, OKLCH]: hex values and rgb() in roles, shadows and scrims. */
function written(css:string){
  const out:[string,string,{L:number,C:number,h:number}][]=[];
  for(const m of css.matchAll(/(--ui-[\w-]+)\s*:\s*([^;]+);/g)){
    for(const h of m[2].matchAll(/#([0-9a-f]{6})\b/gi))out.push([m[1],h[0],oklch(...[0,2,4].map(i=>parseInt(h[1].slice(i,i+2),16)) as [number,number,number])]);
    for(const c of m[2].matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g))out.push([m[1],c[0]+')',oklch(+c[1],+c[2],+c[3])]);
  }
  return out;
}

test('green means success and nothing else: no green or green-tinted value but the ok- colours',()=>{
  // 0.3-L3, the owner's pick of direction A (11/23): the accent is ink, the neutrals are warm paper. A colour
  // leaning green (OKLCH hue 115–180; the warm paper and ink sit at 70–105) by more than a trace of chroma may only be one of the ok- primitives.
  const found=written(tokensCss());
  assert.ok(found.length>60,'the reader finds the colours');
  const green=found.filter(([name,,c])=>c.h>=115&&c.h<=180&&c.C>=0.003&&!/^--ui-ok-/.test(name)).map(([name,value,c])=>`${name} ${value} (hue ${c.h.toFixed(0)}, chroma ${c.C.toFixed(3)})`);
  assert.deepEqual(green,[]);
  assert.ok(found.some(([name,,c])=>/^--ui-ok-/.test(name)&&c.h>=115&&c.h<=180),'success is still green');
});

test('the green reader sees a green-tinted grey, a green in a shadow and lets a warm grey through',()=>{
  const seen=(css:string)=>written(css).filter(([name,,c])=>c.h>=115&&c.h<=180&&c.C>=0.003&&!/^--ui-ok-/.test(name)).map(([name])=>name);
  assert.deepEqual(seen(':root{--ui-n-500:#848985;--ui-shadow:0 1px 2px rgb(19 22 20 / 0.06);--ui-n-600:#5B584E;--ui-ok-600:#2F7A4A}'),['--ui-n-500','--ui-shadow']);
});

test('both themes give every role a value, and a role that names a primitive names one that exists',()=>{
  const light=Object.keys(themes.light).sort(),dark=Object.keys(themes.dark).sort();
  assert.deepEqual(dark,light,'the dark theme defines the same roles as the light theme');
  for(const [theme,roles] of Object.entries(themes))for(const [role,value] of Object.entries(roles)){
    const ref=String(value).match(/^\{([\w-]+)\}$/);
    if(ref)assert.ok(ref[1] in primitives,`${theme}.${role} names {${ref[1]}}, which is not a primitive`);
  }
});
