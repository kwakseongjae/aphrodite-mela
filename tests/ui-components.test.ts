import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

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

test('every interactive part shows a keyboard focus ring',()=>{
  const css=strip(read('components.css'));
  // A box that holds a native field (select, composer) shows it with :focus-within.
  const focus=css.match(/([^{}]*:focus-(?:visible|within)[^{}]*)\{[^}]*var\(--ui-focus\)/g)?.join(',')??'';
  for(const part of ['ui-btn','ui-icon-btn','ui-chip','ui-seg-item','ui-tab','ui-row','ui-attach','ui-send','ui-switch','ui-input','ui-textarea','ui-select','ui-composer'])
    assert.match(focus,new RegExp(`\\.${part}\\b[^,]*:focus`),`.${part} has no :focus-visible or :focus-within rule in the focus colour`);
});
