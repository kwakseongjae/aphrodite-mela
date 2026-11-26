import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {namedColours,declarations,canvasSheets,sheetKind} from './support/css';

/**
 * The older stylesheets hold no colour of their own, and can only lose font sizes, never gain them.
 *
 * 0.3-L5: every colour in them is a src/ui token now, so the colour line is no longer a count that may come down but a
 * floor: none, in every older sheet, and one that appears fails whatever the sheet. The font sizes are still counted.
 *
 * New screens use src/ui (tokens and parts). The sheets written before it are pinned here at the number
 * of distinct colours and distinct font sizes each held on 2026-11-18, when the system came in; F3–F5
 * move screens over and lower the pins as they go. A count that grows fails. A count that shrinks fails
 * too, asking for the pin to come down in the same change, so the ground gained is not given back.
 * `set` is a short hash of the sorted colours and sizes themselves, so swapping one for a new one fails
 * even though the counts hold.
 *
 * Legacy is every .css under src/ except src/ui at any depth (the system, which tests/ui-components.test.ts
 * checks instead), src/generated and src/vendor (built or copied from elsewhere); tests/support/css.ts sorts them. A new .css file there has no pin and fails: put new styles in src/ui.
 * CSS written inside .ts files is not counted; that is a known gap.
 *
 * page.css, patterns.css and moa.css are not counted either. They draw the person's design, on the
 * canvas and in the page it exports (render.ts reads all three), not the app's own screens: moving a
 * screen to src/ui never lowers them, and what a design may look like is not this system's to pin.
 */
const pins:Record<string,{sizes:number,set:string}>={
  'agent/agent.css':{sizes:2,set:'fcbaef50'},
  'design/component-explorer.css':{sizes:15,set:'e4439937'},
  'design/studio.css':{sizes:11,set:'1590246b'},
  'editor/pointer-editor.css':{sizes:2,set:'83ba3aab'},
  'reference.css':{sizes:7,set:'0d8ba2d0'},
  'style.css':{sizes:18,set:'da9bb4be'},
  'workspace/vault.css':{sizes:0,set:'0e7d07ee'},
};

const namedRe=new RegExp(`(?<![\\w-])(${namedColours.join('|')})(?![\\w-])`,'gi');
const fnRe=/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)/gi;
const hexRe=/#[0-9a-f]{3,8}\b/gi;

const hex=(h:string)=>{h=h.toLowerCase().slice(1);if(h.length===3||h.length===4)h=[...h].map(c=>c+c).join('');if(h.length===8&&h.endsWith('ff'))h=h.slice(0,6);return `#${h}`;};

export function colours(css:string){
  const seen=new Set<string>();
  for(const {value} of declarations(css)){
    for(const m of value.matchAll(fnRe))seen.add(m[0].toLowerCase().replace(/\s*([,/()])\s*/g,'$1').replace(/\s+/g,' '));
    for(const m of value.replace(fnRe,'').matchAll(hexRe))seen.add(hex(m[0]));
    for(const m of value.replace(fnRe,'').matchAll(namedRe))seen.add(m[1].toLowerCase());
  }
  return seen;
}

/** Top-level tokens of a value, keeping a function and its arguments as one token. */
function tokens(value:string){
  const out:string[]=[];let depth=0,cur='';
  for(const ch of value){
    if(ch==='(')depth++;
    if(ch===')')depth--;
    if(depth===0&&/[\s/]/.test(ch)){if(cur)out.push(cur);cur='';if(ch==='/')out.push('/');continue;}
    cur+=ch;
  }
  if(cur)out.push(cur);
  return out;
}
const sizeLike=/^(?:-?\d*\.?\d+(?:px|r?em|%|pt|vw|vh|vmin|vmax|cqw|cqi|ch|ex)|(?:calc|clamp|min|max|var)\(.*\)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i;

export function sizes(css:string){
  const seen=new Set<string>();
  const norm=(v:string)=>v.replace(/!important/i,'').trim().toLowerCase().replace(/\s+/g,' ');
  for(const {prop,value} of declarations(css)){
    if(prop==='font-size'){const v=norm(value);if(!/^(inherit|initial|unset|revert|revert-layer)$/.test(v))seen.add(v);}
    if(prop==='font'){
      const parts=tokens(norm(value));
      const slash=parts.indexOf('/');
      const size=slash>0?parts[slash-1]:parts.find(t=>sizeLike.test(t)&&!/^var\(/.test(t));
      if(size&&sizeLike.test(size)&&!(slash<0&&parts.length===1))seen.add(size);
    }
  }
  return seen;
}

const src=new URL('../src/',import.meta.url);
/** The sheets that draw the person's design rather than the app. */
const canvas=canvasSheets;
const legacy=readdirSync(src,{recursive:true}).map(String).filter(f=>f.endsWith('.css')&&sheetKind(f)==='legacy').sort();

test('the counters read colours and sizes the way they are written',()=>{
  assert.deepEqual([...colours('.a{color:#FFF;background:#ffffff;border:1px solid rgb(0 0 0 / .1)} .white:hover{fill:White;stroke:rgb(0 0 0/.1)}')].sort(),['#ffffff','rgb(0 0 0/.1)','white']);
  assert.deepEqual([...colours('.a{background:url("x.svg#fff");content:"#abc red";color:var(--ink,#292d27)}')],['#292d27']);
  assert.deepEqual([...sizes('.a{font:600 13px/1.4 Arial}.b{font-size:12px}.c{font:inherit}.d{font-size:clamp(12px, 2vw, 14px)}.e{font:14px/1.55 Arial,sans-serif}.f{font-size:12px !important}')].sort(),['12px','13px','14px','clamp(12px, 2vw, 14px)']);
});

test('every older stylesheet has a pin, and nothing in src/ outside src/ui is new',()=>{
  assert.deepEqual(legacy.filter(f=>!(f in pins)),[],'a stylesheet outside src/ui with no pin: new styles belong in src/ui');
  assert.deepEqual(Object.keys(pins).filter(f=>!legacy.includes(f)),[],'a pinned stylesheet is gone: remove its pin');
});

test('the canvas stylesheets left out of the count are the ones the exported page is made of',()=>{
  const render=readFileSync(new URL('render.ts',src),'utf8');
  for(const f of canvas){
    assert.ok(existsSync(new URL(f,src)),`${f} is gone: take it off the canvas list`);
    assert.ok(render.includes(`'./${f}?raw'`),`${f} is no longer part of the exported page: pin it with the app's own sheets`);
  }
});

/** The first eight hex digits of a sha-256 over a sheet's sorted colours and sorted sizes. */
export function setOf(css:string){
  return createHash('sha256').update([...colours(css)].sort().join('\n')+'\n--\n'+[...sizes(css)].sort().join('\n')).digest('hex').slice(0,8);
}

/** What is wrong with one older sheet against its pin, as lines to report. */
function drift(file:string,css:string,pin:{sizes:number,set:string}){
  const report:string[]=[];
  const raw=[...colours(css)],now=sizes(css).size,set=setOf(css);
  if(raw.length)report.push(file+': '+raw.join(', ')+'. An older sheet holds no colour of its own: use the src/ui tokens.');
  if(now>pin.sizes)report.push(file+': '+now+' distinct sizes, more than the '+pin.sizes+' pinned. Use the src/ui tokens instead.');
  if(now<pin.sizes)report.push(file+': '+now+' distinct sizes, fewer than the '+pin.sizes+' pinned. Lower the pin to '+now+', with set \''+set+'\', in tests/ui-ratchet.test.ts.');
  if(!report.length&&set!==pin.set)report.push(file+': the same count, but a size was swapped for a new one (set '+set+', pinned '+pin.set+'). Use the src/ui tokens instead.');
  return report;
}

test('the ratchet refuses any colour, and sees a size swapped for a new one, not only a count that grows',()=>{
  const before='.a{color:var(--ui-text-1);font-size:12px}';
  const pin={sizes:1,set:setOf(before)};
  assert.deepEqual(drift('x.css',before,pin),[]);
  assert.equal(drift('x.css','.a{color:#111;font-size:12px}',pin).length,1,'one raw colour is one too many');
  assert.equal(drift('x.css','.a{color:var(--ui-text-1);font-size:13px}',pin).length,1,'a size swapped');
});

test('no older stylesheet holds a colour or gains a font size, and one that loses a size lowers its pin',()=>{
  const report:string[]=[];
  for(const file of legacy){
    const pin=pins[file];
    if(pin)report.push(...drift(file,readFileSync(new URL(file,src),'utf8'),pin));
  }
  assert.deepEqual(report,[]);
});

/**
 * Colour variables an older sheet may use: the system's own, and the person's design's own (--paper, --ink, --brand,
 * --swatch: set on an element by the markup, so a preview shows that design's colours, not the app's). --muted, --green
 * and the like are raw colours under another name.
 */
const designVariables=['paper','ink','brand','on-brand','swatch'];
export function foreignColourVariables(css:string){
  const colourProp=/^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|text-decoration(-color)?|caret-color|fill|stroke|column-rule(-color)?|accent-color)$/;
  const found=new Set<string>();
  for(const {prop,value} of declarations(css))if(colourProp.test(prop))for(const m of value.matchAll(/var\(\s*--([\w-]+)/g))if(!m[1].startsWith('ui-')&&!designVariables.includes(m[1]))found.add(prop+': --'+m[1]);
  return [...found];
}

/* 0.3-L4 ④, then 0.3-L5 for every older sheet: no raw colour and no colour variable but --ui-. */
test('every older sheet paints only with the system tokens',()=>{
  assert.deepEqual(foreignColourVariables('.a{color:var(--muted);background:var(--ui-bg-panel);border:1px solid var(--border);width:var(--w)}'),['color: --muted','border: --border']);
  assert.deepEqual(legacy.flatMap(f=>foreignColourVariables(readFileSync(new URL(f,src),'utf8')).map(x=>f+': '+x)),[]);
});

/**
 * 0.3-L5: the app's own markup writes no colour either. A raw colour in a .ts file is the person's design, the brand's
 * artwork, an example in a message, or arithmetic on colours, never the app's chrome; these are the files that hold one,
 * and why. A file added here needs one of those reasons.
 */
const holdsColours:Record<string,string>={
  'agent/bridge.ts':'an example hex in an error an agent reads',
  'agent/commands.mjs':'an example hex in a command description an agent reads',
  'design/component-theme.ts':'each design system\'s own accent, for the person\'s components',
  'design/contrast.ts':'black or white text chosen against a design\'s colour',
  'design/logo.ts':'the brand lockup\'s golden apple, artwork',
  'design/omd.ts':'an example token in a comment',
  'design/presets.ts':'design-system presets for the person\'s pages',
  'design/studio.ts':'the brand kit\'s colour swatches, shown as the brand\'s data',
  'design/tokens.ts':'the person\'s design tokens and their defaults',
  'free-page.ts':'the white document a free page is framed in',
  'library-render.ts':'a design system\'s components as the person\'s page draws them',
  'main.ts':'two theme-draft accents for the person\'s design, and the hex example in a message',
  'model.ts':'the design systems a board can use',
  'page-export.ts':'the white ground of an exported picture or video page',
  'reference.ts':'the white a reference picture is flattened onto before it is read',
  'ui/tokens.ts':'the source of every token',
  'workspace/workspaces.ts':'the colours a person can pick for a workspace avatar',
};
test('a raw colour in the app\'s code is only in the files that draw the person\'s design, the brand or an example',()=>{
  const code=readdirSync(src,{recursive:true}).map(String).filter(f=>/\.(ts|tsx|mjs)$/.test(f)&&!/^(generated|vendor)\//.test(f)).sort();
  const raw=/#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i;
  const found=code.filter(f=>raw.test(readFileSync(new URL(f,src),'utf8')));
  assert.deepEqual(found,Object.keys(holdsColours).sort());
});
