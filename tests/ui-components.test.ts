import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {scale} from '../src/ui/tokens';
import {rules,scenarios,value,clone,el,disabled,describe,type El,sheetKind,rawValues,outOfScope,strip,allowedUnits,allowedLengths,hasFlag,conditions} from './support/css';

/** Every sheet the system owns: any .css under src/ui at any depth, but the generated tokens.css. */
const src=new URL('../src/',import.meta.url);
const sheets=readdirSync(src,{recursive:true}).map(String).filter(f=>f.endsWith('.css')&&sheetKind(f)==='system').sort();
const read=(file:string)=>readFileSync(new URL(file,src),'utf8');
/** The sheets as one, in the order a page would load them, for the checks that ask the cascade. */
const system=sheets.map(read).join('\n');

/** What the sheet checks find in one sheet. A sheet anywhere under src/ui goes through this. */
function problems(file:string,css:string){
  return [...outOfScope(css).map(s=>file+': "'+s+'" styles something outside the parts'),...rawValues(css).map(v=>file+': raw value '+v)];
}

test('there are component sheets to check',()=>{
  assert.ok(sheets.includes('ui/components.css'),'src/ui/components.css exists');
});

/**
 * The new parts must not reach an existing screen, and colours and sizes come from the tokens only.
 * A selector that styles anything but a part would restyle markup the app already has; a raw value is
 * one the source does not know about, which the next theme or scale change will miss.
 */
test('every system sheet styles only the parts, with token values only',()=>{
  assert.deepEqual(sheets.flatMap(f=>problems(f,read(f))),[]);
});

test('a sheet in a folder under src/ui is checked like any other, and the ratchet leaves it to these checks',()=>{
  assert.equal(sheetKind('ui/screens/home.css'),'system');
  assert.equal(sheetKind('ui/screens/deep/panel.css'),'system');
  assert.equal(sheetKind('ui/tokens.css'),'generated','the root tokens.css is held by the drift test');
  assert.equal(sheetKind('ui/screens/tokens.css'),'system','only the root tokens.css is generated');
  assert.equal(sheetKind('workspace/home.css'),'legacy');
  assert.equal(problems('ui/screens/home.css','button { color: #fff; font-size: 1rem; }').length,3);
});

test('the scope check refuses a selector that styles something outside the parts',()=>{
  for(const selector of ['body:has(.ui-modal)','.ui-modal ~ #app','#app:has(.ui-toast) .topbar','.ui-root ~ *','button','*','.is-on',':not(.ui-x)',
    '.ui-x:not(.ui-y) ~ p',':is(.ui-a, button)','.ui-a + .b .c','.ui-x ~ .a .b'])
    assert.deepEqual(outOfScope(selector+'{x:1}'),[selector],selector);
  for(const selector of ['.ui-a','.ui-a:hover:not(:disabled)','.ui-root *','.ui-root *::before','.ui-a > b','.ui-switch:has(.ui-switch-input:disabled)',
    '.ui-select:has(> select:disabled)','.ui-x + .ui-y','.ui-x .a ~ .b','.ui-gallery-matrix tbody tr + tr td','.ui-a::placeholder'])
    assert.deepEqual(outOfScope(selector+'{x:1}'),[],selector);
  // What the reader cannot see into, it refuses rather than skips.
  for(const sheet of ['@layer x{button{color:var(--ui-text-1)}}','.ui-a{& ~ #app{x:1}}','@layer a; button{x:1}','@import "other.css"; .ui-a{x:1}','.ui-a{x:1} button'])
    assert.throws(()=>outOfScope(sheet),/cannot read/,sheet);
});

test('the scope check reads selectors the way a browser would',()=>{
  assert.deepEqual(rules('a{x:1} .ui-a, .ui-b:hover{y:2} @media (x){.ui-c{z:3}} @font-face{font-family:A} @keyframes k{from{x:1}to{x:2}}').map(r=>r.selector),['a','.ui-a','.ui-b:hover','.ui-c']);
});

test('the raw-value check catches what it is meant to',()=>{
  for(const bad of ['color:#fff','width:12px','margin:.5px','background:rgb(0 0 0)','color: white','border-color:oklch(50% .1 150)',
    'font-size:0.8rem','font-size:13pt','font-size:small','color:red','color:gray','border: var(--ui-hairline) solid black','background:color-mix(in srgb, red 20%, transparent)','color:light-dark(red, blue)','width:2PX',
    'padding:1em','width:10vw','height:50vh','border-width:thin','transition:color 120ms','margin:var(--ui-x, 4px)','color:GRAY','x:1}@media (min-width: 40rem){.ui-a{y:1}'])
    assert.ok(rawValues('.ui-a{'+bad+'}').length,bad);
  // Allowed: a number with no unit, a share (% and fr), the whole viewport, and keywords that are not a colour or a size.
  assert.deepEqual(allowedUnits,['%','fr']);
  assert.deepEqual(allowedLengths,['100vh','100vw','100dvh']);
  for(const fine of ['width:var(--ui-space-2)','color:var(--ui-text-1)','font-weight:600','opacity:var(--ui-disabled-opacity)','margin:0','flex:1 1 auto',
    'width:100%','grid-template-columns:repeat(3, 1fr)','min-height:100vh','border-color:transparent','color:currentColor','font:inherit','background:none',
    'background:color-mix(in srgb, var(--ui-text-inverse) 14%, transparent)','height:calc(var(--ui-control-sm) - var(--ui-space-1) * 2)','font-weight:var(--ui-w-medium)',
    'src:url("/fonts/a-2px.woff2") format("woff2-variations")','font-feature-settings:"ss06" 1','white-space:nowrap'])
    assert.deepEqual(rawValues('.ui-a{'+fine+'}'),[],fine);
});

test('Korean text breaks between words, never inside one',()=>{
  const css=strip(read('ui/components.css'));
  const rule=css.match(/\.ui-root[^{]*\{[^}]*\}/);
  assert.ok(rule,'there is a .ui-root rule');
  assert.match(rule[0],/word-break:\s*keep-all/);
});

/**
 * The ring is drawn with box-shadow, and so are some states (a selected segment, a pressed primary
 * button). A state rule that comes later or weighs more replaces the ring rather than adding to it, so
 * this asks the cascade: for every focusable part, under each state the sheet gives it and under all of
 * them at once, focused from the keyboard (:focus-visible) and as the gallery shows it (.is-focus), does
 * the winning box-shadow still hold --ui-focus?
 */
const focusable:Record<string,'self'|'within'|'switch'>={
  'ui-btn':'self','ui-icon-btn':'self','ui-chip':'self','ui-seg-item':'self','ui-tab':'self','ui-row':'self','ui-attach':'self','ui-send':'self',
  'ui-search':'self','ui-fab':'self',
  'ui-input':'self','ui-textarea':'self',
  // A box around a native field takes focus from inside it.
  'ui-select':'within','ui-composer':'within',
  // The checkbox under the track (or the box) takes focus; the track (or the box) draws it.
  'ui-switch-track':'switch','ui-check-box':'switch',
  'ui-menu-item':'self','ui-option':'within','ui-ws':'self','ui-board-card-thumb':'self',
};

/** For a part drawn beside a hidden input: the label it sits in, and the input before it. */
const drawnFor:Record<string,[host:string,input:string]>={'ui-switch-track':['ui-switch','ui-switch-input'],'ui-check-box':['ui-check','ui-check-input']};
function focused(chain:El[],how:'self'|'within'|'switch',from:'keyboard'|'gallery'){
  const target=chain.at(-1)!,above=chain.slice(0,-1);
  const [host,input]=drawnFor[Object.keys(drawnFor).find(k=>target.classes.has(k))??'ui-switch-track'];
  if(from==='gallery'){(how==='switch'?above.find(e=>e.classes.has(host))!:target).classes.add('is-focus');return chain;}
  for(const e of above)e.states.add('focus-within');
  if(how==='within')target.states.add('focus-within');
  if(how==='self')for(const s of ['focus','focus-visible','focus-within'])target.states.add(s);
  if(how==='switch'){
    target.prev=target.prev?.length?target.prev:[el([input])];
    for(const input of target.prev)for(const s of ['focus','focus-visible'])input.states.add(s);
  }
  return chain;
}

/** Each way a focused part shows no ring in the given sheet; [] when the ring always wins. */
export function ringsLost(css:string){
  const all=rules(css),lost:string[]=[];
  const every=scenarios(all).filter(c=>!c.at(-1)!.element&&!disabled(c));
  for(const [part,how] of Object.entries(focusable)){
    const seen=every.filter(c=>c.at(-1)!.classes.has(part));
    if(!seen.length)continue;
    // Every state at once, on the shortest document that holds the part.
    const all_at_once=[...seen].sort((a,b)=>a.length-b.length)[0].map(clone),t=all_at_once.at(-1)!;
    for(const c of seen){
      const s=c.at(-1)!;s.classes.forEach(k=>t.classes.add(k));s.attrs.forEach((v,k)=>t.attrs.set(k,v));s.states.forEach(k=>t.states.add(k));
      if(s.prev)t.prev=[el([...(t.prev??[]).flatMap(p=>[...p.classes]),...s.prev.flatMap(p=>[...p.classes])],[...(t.prev??[]).flatMap(p=>[...p.states]),...s.prev.flatMap(p=>[...p.states])])];
    }
    for(const media of conditions(all))for(const chain of [...seen,all_at_once])for(const from of ['keyboard','gallery'] as const){
      const c=focused(chain.map(clone),how,from),when=media.length?' in '+media[0]:'';
      const shadow=value(all,c,'box-shadow',media)??'none';
      if(!shadow.includes('var(--ui-focus)'))lost.push(describe(c)+when+': box-shadow '+shadow);
      // Forced-colours mode drops box-shadow and paints a transparent outline in the system colour.
      const outline=value(all,c,'outline',media)??'none';
      if(outline!=='var(--ui-ring) solid transparent')lost.push(describe(c)+when+': outline '+outline);
    }
  }
  return lost;
}

test('the cascade reader picks the declaration a browser would',()=>{
  const sheet=rules('.a{x:1} .a.b{x:2} .a:hover{x:3} .p > .a{y:1} .q .a{y:2} .s + .a{z:1} .a:not(.b){w:1} .a{v:1 !important} .a.b.c{v:2} .a::after{u:1} @media (m){.a{t:1}}');
  assert.equal(value(sheet,[el(['a','b'])],'x'),'2');
  assert.equal(value(sheet,[el(['a','b'],['hover'])],'x'),'3','same weight: the later rule');
  assert.equal(value(sheet,[el(['p']),el(['a'])],'y'),'1');
  assert.equal(value(sheet,[el(['q']),el(['p']),el(['a'])],'y'),'2');
  assert.equal(value(sheet,[el(['p']),el(['x']),el(['a'])],'y'),undefined,'> is the parent only');
  const after=el(['a']);after.prev=[el(['s'])];
  assert.equal(value(sheet,[after],'z'),'1');
  assert.equal(value(sheet,[el(['a','b'])],'w'),undefined);
  assert.equal(value(sheet,[el(['a','b','c'])],'v'),'1','!important outweighs specificity');
  const pe=el();pe.element='after';
  assert.equal(value(sheet,[el(['a']),pe],'u'),'1');
  assert.equal(value(sheet,[el(['a'])],'u'),undefined,'a pseudo-element rule does not reach its host');
  assert.equal(value(sheet,[el(['a'])],'t'),undefined);
  assert.equal(value(sheet,[el(['a'])],'t',['@media (m)']),'1');
});

test('every focusable part is in the sheet',()=>{
  const every=scenarios(rules(system));
  for(const part of Object.keys(focusable))assert.ok(every.some(c=>c.at(-1)!.classes.has(part)),'.'+part+' is not drawn: take it off the focusable list');
});

test('every interactive part keeps its keyboard focus ring in every state',()=>{
  assert.deepEqual(ringsLost(system),[]);
});

test('the ring check sees a state rule that replaces the ring',()=>{
  const sheet='.ui-seg-item:focus-visible, .ui-seg-item.is-focus { outline: var(--ui-ring) solid transparent; box-shadow: 0 0 0 var(--ui-ring) var(--ui-focus); }\n'+
    '.ui-seg-item.is-on, .ui-seg-item[aria-checked="true"] { box-shadow: var(--ui-shadow-seg); }';
  assert.deepEqual(ringsLost(sheet).length,6,'on, aria-checked and both at once, from the keyboard and in the gallery');
  const media=ringsLost(sheet.split('\n')[0]+'\n@media (forced-colors: active) { .ui-seg-item.is-focus { box-shadow: none; } }');
  assert.ok(media.length&&media.every(l=>l.includes(' in @media (forced-colors: active)')),'a rule inside @media is read too');
});

/**
 * A disabled part does not answer the pointer: hovering or pressing it changes nothing it draws. A row
 * can be a button (:disabled) or another element (.is-disabled); a select box is disabled through the
 * native <select> inside it, and then also looks disabled.
 */
const disabledWays:Record<string,{classes?:string[],states?:string[]}[]>={
  'ui-btn':[{states:['disabled']}],'ui-icon-btn':[{states:['disabled']}],'ui-chip':[{states:['disabled']}],'ui-seg-item':[{states:['disabled']}],
  'ui-tab':[{states:['disabled']}],'ui-attach':[{states:['disabled']}],'ui-send':[{states:['disabled']}],'ui-input':[{states:['disabled']}],'ui-textarea':[{states:['disabled']}],
  'ui-row':[{states:['disabled']},{classes:['is-disabled']}],'ui-search':[{states:['disabled']}],'ui-fab':[{states:['disabled']}],'ui-menu-item':[{states:['disabled']},{classes:['is-disabled']}],
  'ui-option':[{states:[hasFlag('> .ui-option-input:disabled')]},{classes:['is-disabled']}],'ui-ws':[{states:['disabled']}],
  'ui-select':[{states:[hasFlag('> select:disabled')]},{classes:['is-disabled']}],
};
export function litWhileDisabled(css:string){
  const all=rules(css),lit:string[]=[];
  for(const media of conditions(all))for(const [part,ways] of Object.entries(disabledWays))for(const way of ways){
    const at=[el([part,...(way.classes??[])],way.states??[])];
    for(const pointer of ['hover','active']){
      const on=at.map(clone);on[0].states.add(pointer);
      for(const prop of ['background','border','color','box-shadow','filter'])
        if(value(all,on,prop,media)!==value(all,at,prop,media))lit.push(describe(on)+': '+prop+' '+value(all,on,prop,media));
    }
  }
  return lit;
}

test('a disabled part does not light up under the pointer',()=>{
  assert.deepEqual(litWhileDisabled(system),[]);
});

test('a select box whose select is disabled looks disabled',()=>{
  const all=rules(system);
  for(const prop of ['background','color'])
    assert.equal(value(all,[el(['ui-select'],[hasFlag('> select:disabled')])],prop),value(all,[el(['ui-select','is-disabled'])],prop),prop);
});

/** Motion is decoration: with reduced motion asked for, nothing in the parts moves or fades. */
const reduced='@media (prefers-reduced-motion: reduce)';
test('every transition stops when the system asks for reduced motion',()=>{
  const all=rules(system),moving:string[]=[];
  for(const chain of scenarios(all)){
    const t=value(all,chain,'transition');
    if(t&&t!=='none'&&value(all,chain,'transition',[reduced])!=='none')moving.push(describe(chain)+': '+t);
  }
  assert.deepEqual(moving,[]);
});

/**
 * The app's typeface ships with it. A url() that reaches the network would make the window depend on
 * a connection and tell a server every time it opens.
 */
test('every file the new sheets load is bundled in public/, and none comes from the network',()=>{
  const urls=sheets.flatMap(file=>[...strip(read(file)).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m=>m[1]));
  assert.ok(urls.some(u=>u.endsWith('.woff2')),'the bundled typeface is declared');
  for(const url of urls){
    assert.match(url,/^\/[\w./-]+$/,`${url} is not a path inside the app`);
    assert.ok(existsSync(new URL(`../public${url}`,import.meta.url)),`${url} is not in public/`);
  }
  assert.ok(existsSync(new URL('../public/fonts/LICENSE.txt',import.meta.url)),'the OFL travels with the font file');
  assert.ok(existsSync(new URL('../public/fonts/GeistMono-OFL.txt',import.meta.url)),'the OFL travels with the mono file');
  // Where each file came from and which version it is, next to the licences.
  const sources=readFileSync(new URL('../public/fonts/SOURCES.txt',import.meta.url),'utf8');
  for(const file of urls.map(u=>u.split('/').pop()!))assert.ok(sources.includes(file),file+' has no source in public/fonts/SOURCES.txt');
});

test('the bundled faces are named so that no design on the canvas picks them up by accident',()=>{
  // Designs name `Pretendard` (src/design/fonts.ts) and may name `Geist Mono` from a web font. Declaring
  // either name in the app's own document would swap the face a section page on the board draws with.
  const families=sheets.flatMap(file=>[...strip(read(file)).matchAll(/@font-face\s*\{[^}]*font-family:\s*["']?([^"';]+)["']?/g)].map(m=>m[1]));
  assert.deepEqual(families,['Pretendard Variable','Geist Mono Variable']);
});

test('the mono face is the bundled Geist Mono, with the bundled Pretendard behind it for Hangul',()=>{
  const mono=String(scale['font-mono']);
  assert.match(mono,/^"Geist Mono Variable", "Pretendard Variable",/,'a path or a size in Korean falls to Pretendard, not to the system');
  assert.match(mono,/monospace$/);
});

test('the app loads the tokens before the parts, from index.html and not from app code',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const tokens=html.indexOf('href="/src/ui/tokens.css"'),parts=html.indexOf('href="/src/ui/components.css"');
  assert.ok(tokens>0&&parts>tokens,'index.html links src/ui/tokens.css, then src/ui/components.css');
  assert.ok(parts<html.indexOf('<script'),'the sheets load before the app script');
  // The source is for the build script and the tests; the app reads the generated stylesheet.
  const appCode=readdirSync(new URL('../src/',import.meta.url),{recursive:true}).map(String).filter(f=>/\.tsx?$/.test(f)&&!f.startsWith('ui/'));
  for(const file of appCode)assert.doesNotMatch(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),/from\s+['"][./]*ui\/tokens/,`${file} imports src/ui/tokens.ts`);
});

test('the gallery is a development page, never part of the app bundle',()=>{
  // Vite serves any root .html in dev; a build only takes index.html unless the config names more.
  assert.ok(existsSync(new URL('../ui-gallery.html',import.meta.url)),'ui-gallery.html exists');
  const config=readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8');
  assert.doesNotMatch(config,/ui-gallery|rollupOptions\s*:\s*\{[^}]*input/,'vite.config.ts adds the gallery (or another page) to the build');
  assert.doesNotMatch(readFileSync(new URL('../index.html',import.meta.url),'utf8'),/gallery/,'index.html loads the gallery sheet');
});
