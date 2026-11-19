import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {commands,type Control} from '../src/agent/commands.mjs';
import {commandTable} from '../src/editor/command-palette';

/**
 * 0.3-2: no command outside the table. main.ts cannot be imported under tsx --test (it paints the DOM
 * at load), so like agent-op-actions.test.ts this reads the source: every data-action a dispatcher
 * answers to, every one the markup emits, every palette entry, every inspector field, every form and
 * every edit made by a gesture must be some row's control — and every control a row names must exist.
 */
const src=fileURLToPath(new URL('../src/',import.meta.url));
const read=(path:string)=>readFileSync(join(src,path),'utf8');
const main=read('main.ts');
const between=(text:string,from:string,to:string)=>{
  const start=text.indexOf(from);assert.ok(start>=0,`cannot find ${from}`);
  const end=text.indexOf(to,start);assert.ok(end>start,`cannot find ${to} after ${from}`);
  return text.slice(start,end);
};
const cases=(text:string)=>new Set([...text.matchAll(/case '([a-z][a-z0-9-]*)':/g)].map(m=>m[1]));

const controls=commands.flatMap(r=>r.controls.map(c=>({row:r.id,control:c})));
const named=<K extends Control['kind']>(kind:K)=>controls.filter((x):x is {row:string;control:Extract<Control,{kind:K}>}=>x.control.kind===kind);
const actionControls=new Set(named('action').map(x=>x.control.name));
const fieldControls=new Set(named('field').map(x=>x.control.name));
const formControls=new Set(named('form').map(x=>x.control.id));
const gestureControls=new Set<string>(named('gesture').map(x=>x.control.name));

/* ---- What the dispatchers answer to ---- */
const actionBody=between(main,'async function action(',"document.addEventListener('click'");
const handled=new Set([
  ...cases(actionBody),
  ...cases(read('editor/updates.ts')),
  ...cases(between(read('workspace/archive.ts'),'async function handle(','default: return false;')),
]);

/* ---- What the markup emits, in every source file that builds it ---- */
function sources(dir:string):string[]{
  return readdirSync(dir).flatMap(name=>{
    const path=join(dir,name);
    if(statSync(path).isDirectory())return name==='vendor'||name==='generated'?[]:sources(path);
    return path.endsWith('.ts')?[path]:[];
  });
}
const emitted=new Map<string,string>();
for(const path of sources(src)){
  const text=readFileSync(path,'utf8'),where=path.slice(src.length);
  const add=(name:string)=>{if(!emitted.has(name))emitted.set(name,where);};
  for(const m of text.matchAll(/data-action=\\?"([a-z][a-z0-9-]*)\\?"/g))add(m[1]);
  for(const m of text.matchAll(/data-action="\$\{[^}]*?'([a-z][a-z0-9-]*)'\s*:\s*'([a-z][a-z0-9-]*)'\}"/g)){add(m[1]);add(m[2]);}
  for(const m of text.matchAll(/\b(?:button|iconButton)\(\s*'([a-z][a-z0-9-]*)'/g))add(m[1]);
  // Object tables the markup is built from (dock, help menu, palette) — not a type union like action:'command'|'click'.
  for(const m of text.matchAll(/\baction:\s*'([a-z][a-z0-9-]*)'(?!\s*\|)/g))add(m[1]);
  for(const m of text.matchAll(/dataset\.action\s*=\s*'([a-z][a-z0-9-]*)'/g))add(m[1]);
}

/**
 * Palette entries whose action no dispatcher answers to: choosing them does nothing. They are wrong
 * today (0.3-2 step 1 reports them and changes no behaviour). Fixing one means taking it off this list.
 */
const DEAD_PALETTE=['delete','desktop','duplicate','mobile'];
/** Handlers nothing on screen emits: reachable only through an agent's `act`. Listed so a new one is noticed. */
const HIDDEN_HANDLERS=['about','apply-asset','assemble-focus','update-reveal'];

test('every data-action a dispatcher answers to is some row’s control, and every row’s action has a handler',()=>{
  for(const name of handled)assert.ok(actionControls.has(name),`case '${name}' is in no row of src/agent/commands.mjs`);
  for(const {row,control} of named('action'))assert.ok(handled.has(control.name),`${row} names the action "${control.name}", which no dispatcher handles`);
});

test('every data-action the markup emits is some row’s control',()=>{
  assert.ok(emitted.size>100,`found ${emitted.size} emitted actions`);
  for(const [name,where] of emitted)if(!DEAD_PALETTE.includes(name))assert.ok(actionControls.has(name),`${where} emits "${name}", which is in no row`);
});

test('what is emitted but never handled, and handled but never shown, are exactly the known lists',()=>{
  assert.deepEqual([...emitted.keys()].filter(n=>!handled.has(n)).sort(),DEAD_PALETTE);
  assert.deepEqual([...handled].filter(n=>!emitted.has(n)).sort(),HIDDEN_HANDLERS);
});

test('every command-palette entry is some row’s control',()=>{
  const palette=commandTable({hasSelection:true,canUndo:true,canRedo:true,approved:false,viewport:'desktop',pages:[{id:'a',name:'A',active:false},{id:'b',name:'B',active:true}]});
  for(const entry of palette){
    if(DEAD_PALETTE.includes(entry.action))continue;
    assert.ok(actionControls.has(entry.action),`palette "${entry.id}" runs "${entry.action}", which is in no row`);
    if(entry.action==='editor-mode')assert.ok(named('action').some(x=>x.control.name==='editor-mode'&&x.control.data?.mode===entry.data?.mode),`editor-mode ${entry.data?.mode} is a row's control`);
  }
});

test('the editor modes are split between rows by the mode they name',()=>{
  const modes=named('action').filter(x=>x.control.name==='editor-mode').map(x=>`${x.control.data?.mode}:${x.row}`).sort();
  assert.deepEqual(modes,['agent:human.agent-mode','design:chrome.editor-mode','dev:chrome.editor-mode']);
});

/* ---- Inspector fields: the change and input handlers, and the space's frame presets ---- */
const kebab=(s:string)=>s.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`);
const changeBody=between(main,"document.addEventListener('change'","document.addEventListener('submit'");
const inputBody=between(main,"document.addEventListener('input'","document.addEventListener('change'");
const spaceBody=between(main,"space.addEventListener('change'","document.addEventListener('keydown'");
const fields=new Set<string>();
for(const body of [changeBody,inputBody]){
  for(const m of body.matchAll(/\bid\s*===\s*'([a-z][a-z0-9-]*)'/g))fields.add(m[1]);
  for(const m of body.matchAll(/\[((?:'[a-z0-9-]+',?\s*)+)\]\.includes\(target\.id\)/g))for(const id of m[1].matchAll(/'([a-z0-9-]+)'/g))fields.add(id[1]);
  for(const m of body.matchAll(/target\.dataset\.([a-zA-Z]+)/g))fields.add(`data-${kebab(m[1])}`);
}
for(const m of spaceBody.matchAll(/select\[(data-[a-z-]+)\]/g))fields.add(m[1]);

test('every inspector field the handlers read is some row’s control, and every row’s field is read',()=>{
  assert.ok(fields.size>=20,`found ${fields.size} fields`);
  for(const name of fields)assert.ok(fieldControls.has(name),`the field "${name}" is in no row`);
  for(const name of fieldControls)assert.ok(fields.has(name),`a row names the field "${name}", which no handler reads`);
});

/* ---- Forms ---- */
const submitBody=between(main,"document.addEventListener('submit'",'/** Palette keys');
const forms=new Set<string>();
for(const m of submitBody.matchAll(/form\.id\s*===\s*'([a-z][a-z0-9-]*)'/g))forms.add(m[1]);
for(const m of submitBody.matchAll(/\[((?:'[a-z0-9-]+',?\s*)+)\]\.includes\(form\.id\)/g))for(const id of m[1].matchAll(/'([a-z0-9-]+)'/g))forms.add(id[1]);

test('every form the submit handler answers to is some row’s control, and every row’s form is answered',()=>{
  assert.ok(forms.size>=15,`found ${forms.size} forms`);
  for(const id of forms)assert.ok(formControls.has(id),`the form "${id}" is in no row`);
  for(const id of formControls)assert.ok(forms.has(id),`a row names the form "${id}", which the submit handler does not answer`);
});

/* ---- Gestures: every edit made outside the dispatchers and the agent channel ---- */
const gestureMarkers:Record<string,string>={
  'catalog-drop':"before?'catalog:drop':'catalog:add'",
  'block-move-drop':"getData('application/aphrodite-move')",
  'layer-reorder':"'layer:move'",
  'pointer':'`pointer:${command.type}`',
  'frame-move':"'frame:move'",
  'media-drop':"'media:drop'",
  'media-paste':"'media:paste'",
  'undo-key':"history(e.shiftKey ? 'redo' : 'undo'",
  'redo-key':"history(e.shiftKey ? 'redo' : 'undo'",
};

test('every edit committed outside a dispatcher is a gesture some row names',()=>{
  const covered=[
    actionBody,changeBody,submitBody,spaceBody,
    between(main,'function applyBatch(','(window as unknown as {aphroditeAgent'),
  ];
  const lines=main.split('\n');
  let offset=0,outside=0;
  for(const line of lines){
    const at=offset;offset+=line.length+1;
    if(!/\bcommit\(/.test(line)||/^function commit\(/.test(line))continue;
    if(covered.some(region=>{const start=main.indexOf(region);return at>=start&&at<start+region.length;}))continue;
    outside++;
    const gesture=Object.entries(gestureMarkers).find(([,marker])=>line.includes(marker))?.[0];
    assert.ok(gesture,`main.ts commits outside the dispatchers with no gesture to name it: ${line.trim().slice(0,120)}`);
    assert.ok(gestureControls.has(gesture!),`the gesture "${gesture}" is in no row`);
  }
  assert.ok(outside>=5,`found ${outside} gesture commits`);
  for(const name of gestureControls){
    const marker=gestureMarkers[name];
    assert.ok(marker&&main.includes(marker),`a row names the gesture "${name}", which main.ts does not have`);
  }
});

test('a control that runs two rows is one the interface tells apart',()=>{
  const seen=new Map<string,string[]>();
  for(const {row,control} of controls){
    const key=control.kind==='form'?`form:${control.id}`:`${control.kind}:${control.name}:${JSON.stringify(control.kind==='gesture'||control.kind==='listener'?{}:control.data??{})}`;
    seen.set(key,[...(seen.get(key)??[]),row]);
  }
  const shared=[...seen].filter(([,rows])=>rows.length>1).map(([key,rows])=>`${key} ${rows.join(' ')}`).sort();
  // apply-sample/apply-local: a hero or collection selected takes the picture, otherwise it becomes the reference.
  // language-settings-form: the interface language is a setting, the content language is an edit.
  assert.deepEqual(shared,[
    'action:apply-local:{} edit.image edit.reference',
    'action:apply-sample:{} edit.image edit.reference',
    'form:language-settings-form edit.content-language chrome.language',
  ]);
});
