import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {rules,scenarios,value,clone,el,disabled,describe,type El} from './support/css';

const dir=new URL('../src/ui/',import.meta.url);
const sheets=readdirSync(dir).filter(f=>f.endsWith('.css')&&f!=='tokens.css');
const read=(file:string)=>readFileSync(new URL(file,dir),'utf8');
const strip=(css:string)=>css.replace(/\/\*[\s\S]*?\*\//g,'');

/** Every selector in a sheet, with @font-face and keyframe steps left out: they select nothing. */
function selectors(css:string){
  const out:string[]=[];
  const body=strip(css).replace(/@font-face\s*\{[^}]*\}/g,'').replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^}]*\})*\s*\}/g,'');
  for(const m of body.matchAll(/([^{};]+)\{/g)){
    const prelude=m[1].trim();
    if(prelude.startsWith('@'))continue;
    out.push(...prelude.split(',').map(s=>s.trim()).filter(Boolean));
  }
  return out;
}

test('there are component sheets to check',()=>{
  assert.ok(sheets.includes('components.css'),'src/ui/components.css exists');
});

/**
 * The new parts must not reach an existing screen. A selector without a `.ui-` class (a bare `button`,
 * a `*`, a `.is-on` on its own) would restyle markup the app already has, which is exactly what this
 * chunk promised not to do. `:not(.ui-x)` does not count: it matches everything else.
 */
test('every selector in the new sheets is scoped to a .ui- class',()=>{
  for(const file of sheets)for(const selector of selectors(read(file))){
    const positive=selector.replace(/:not\([^)]*\)/g,'');
    assert.match(positive,/\.ui-[\w-]/,`${file}: "${selector}" is not scoped to a .ui- class`);
  }
});

test('the scope check reads selectors the way a browser would',()=>{
  assert.deepEqual(selectors('a{x:1} .ui-a, .ui-b:hover{y:2} @media (x){.ui-c{z:3}} @font-face{font-family:A}'),['a','.ui-a','.ui-b:hover','.ui-c']);
});

/**
 * Colours and sizes come from the tokens only, as in the approved mockup's check-raw.sh. A raw value
 * here is a value the source does not know about, which the next theme or scale change will miss.
 */
const raw=/#[0-9a-fA-F]{3,8}\b|\b\d*\.?\d+px\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|:\s*(?:white|black)\b/g;

test('the new sheets hold no raw colour or px value, only tokens',()=>{
  for(const file of sheets){
    const hits=strip(read(file)).split('\n').flatMap((line,i)=>[...line.matchAll(raw)].map(m=>`${file}:${i+1}: ${m[0]}`));
    assert.deepEqual(hits,[],`raw values outside tokens.css`);
  }
});

test('the raw-value check catches what it is meant to',()=>{
  for(const bad of ['color:#fff','width:12px','margin:.5px','background:rgb(0 0 0)','color: white','border-color:oklch(50% .1 150)'])
    assert.ok(bad.match(raw),bad);
  for(const fine of ['width:var(--ui-space-2)','color:var(--ui-text-1)','font-weight:600','opacity:var(--ui-disabled-opacity)','.ui-white-space{}'])
    assert.equal(fine.match(raw),null,fine);
});

test('Korean text breaks between words, never inside one',()=>{
  const css=strip(read('components.css'));
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
  'ui-input':'self','ui-textarea':'self',
  // A box around a native field takes focus from inside it.
  'ui-select':'within','ui-composer':'within',
  // The checkbox under the track takes focus; the track draws it.
  'ui-switch-track':'switch',
};

function focused(chain:El[],how:'self'|'within'|'switch',from:'keyboard'|'gallery'){
  const target=chain.at(-1)!,above=chain.slice(0,-1);
  if(from==='gallery'){(how==='switch'?above.find(e=>e.classes.has('ui-switch'))!:target).classes.add('is-focus');return chain;}
  for(const e of above)e.states.add('focus-within');
  if(how==='within')target.states.add('focus-within');
  if(how==='self')for(const s of ['focus','focus-visible','focus-within'])target.states.add(s);
  if(how==='switch'){
    target.prev=target.prev?.length?target.prev:[el(['ui-switch-input'])];
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
    for(const chain of [...seen,all_at_once])for(const from of ['keyboard','gallery'] as const){
      const c=focused(chain.map(clone),how,from);
      const shadow=value(all,c,'box-shadow')??'none';
      if(!shadow.includes('var(--ui-focus)'))lost.push(describe(c)+': box-shadow '+shadow);
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
  const every=scenarios(rules(read('components.css')));
  for(const part of Object.keys(focusable))assert.ok(every.some(c=>c.at(-1)!.classes.has(part)),'.'+part+' is not drawn: take it off the focusable list');
});

test('every interactive part keeps its keyboard focus ring in every state',()=>{
  assert.deepEqual(ringsLost(read('components.css')),[]);
});

test('the ring check sees a state rule that replaces the ring',()=>{
  const sheet='.ui-seg-item:focus-visible, .ui-seg-item.is-focus { outline: none; box-shadow: 0 0 0 var(--ui-ring) var(--ui-focus); }\n'+
    '.ui-seg-item.is-on, .ui-seg-item[aria-checked="true"] { box-shadow: var(--ui-shadow-seg); }';
  assert.deepEqual(ringsLost(sheet).length,6,'on, aria-checked and both at once, from the keyboard and in the gallery');
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
});

test('the bundled face is named so that no design on the canvas picks it up by accident',()=>{
  // Designs name `Pretendard` (src/design/fonts.ts). Declaring that name would swap their Hangul.
  const families=sheets.flatMap(file=>[...strip(read(file)).matchAll(/@font-face\s*\{[^}]*font-family:\s*["']?([^"';]+)["']?/g)].map(m=>m[1]));
  assert.deepEqual(families,['Pretendard Variable']);
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
