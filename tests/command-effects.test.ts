import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {commands,commandById,gradeOfKind} from '../src/agent/commands.mjs';

/**
 * 0.3-2 review (Codex, 11/18): a control graded `chrome` opened an address in the browser. Grades are
 * what auto-allow and the in-app agent will read, so a command that leaves the app — opens something
 * in another app, reaches the network, writes or deletes a file, writes the clipboard, downloads — has
 * to say so. This finds every such effect in the source, follows it back through the helpers that
 * carry it to the control that runs it, and holds that control's row to `outside`.
 */
const src=fileURLToPath(new URL('../src/',import.meta.url));
function sources(dir:string):string[]{
  return readdirSync(dir).flatMap(name=>{
    const path=join(dir,name);
    if(statSync(path).isDirectory())return name==='vendor'||name==='generated'?[]:sources(path);
    return path.endsWith('.ts')?[path]:[];
  });
}
const tree:Record<string,string>=Object.fromEntries(sources(src).map(path=>[path.slice(src.length),readFileSync(path,'utf8')]));

/** Tauri commands that reach outside the app's own state: another app, the network, or files. */
const EXTERNAL_COMMANDS=[
  'open_external','open_link','update_check','update_download','update_notes','update_open','update_reveal','fonts_install',
  'image_library_delete','image_library_import','image_library_reveal','references_add','references_delete','references_fetch',
  'taste_write','taste_forget','vault_document','vault_sync','workspace_write',
  // A board file the person opened from Finder, read by the path macOS gave (0.3-P3): never a path from the page or a link.
  'opened_file_read',
];
/** Tauri commands that only read, or are the agent channel's own plumbing. */
const INTERNAL_COMMANDS=[
  'agent_bridge_reply','agent_bridge_start','fonts_installed','image_library_list','image_library_read','recognize_reference',
  'references_list','references_poster','render_free_page','render_page','taste_read','vault_read','workspace_read','workspace_recovery',
  // A free page's frame reads its copy from free-pages/ and its media from board-media/ (0.3-P2): drawing, not an edit.
  'free_page_write','board_media_path',
  // A board file's kind and size, and its bytes, read from board-media/ for what the person exports (0.3-P3): the export is the row's.
  'board_media_stat','board_media_read',
  // What macOS asked the app to open, as links read and files waiting by id (src-tauri/src/opened.rs).
  'opened_take',
  // Puts the page wall into this window's WebKit and reads it back (src-tauri/src/page_wall.rs): the app's own setting.
  'page_wall_status',
  // A file put on the board is kept in the app's own folder under its hash (src-tauri/src/board.rs); the
  // edit that places it is a row of its own (edit.media for the person, media_add in edit.apply for an agent).
  'board_media_begin','board_media_chunk','board_media_finish',
];
/**
 * Tauri commands that read a file outside the app's own folders, at a path an agent names (0.3-P2-fix1):
 * not an effect on the world, but not the app's own data either. Each is a read some row declares.
 */
const FILE_READS=['board_media_import'];
const EFFECT=new RegExp([
  `\\binvoke(?:<[^\\n]*?>)?\\('(?:${EXTERNAL_COMMANDS.join('|')})'`,
  'navigator\\.clipboard\\.write',
  '\\.download\\s*=',
  '\\bwriteFile\\(',
  "import\\('@tauri-apps/plugin-(?:fs|updater|process)'\\)",
].join('|'),'g');

type Owner=
  |{kind:'action';names:string[]}
  |{kind:'form';id:string}
  |{kind:'agent';route:string}
  |{kind:'listener';name:string}
  |{kind:'exempt';name:string}
  |{kind:'none';where:string};
type Site={file:string;line:string;owners:Owner[]};

type Region={file:string;from:string;to:string;own:(text:string,at:number)=>Owner|undefined};
const caseLabels=(text:string,at:number):string[]=>{
  const labels=[...text.slice(0,at).matchAll(/case '([a-z][a-z0-9-]*)':/g)];
  if(!labels.length)return [];
  const names=[labels.at(-1)![1]];
  for(let i=labels.length-2;i>=0;i--){
    const gap=text.slice(labels[i].index!+labels[i][0].length,labels[i+1].index!);
    if(gap.trim())break;
    names.unshift(labels[i][1]);
  }
  return names;
};
const REGIONS:Region[]=[
  {file:'main.ts',from:'async function action(',to:"document.addEventListener('click'",own:(t,at)=>({kind:'action',names:caseLabels(t,at)})},
  {file:'main.ts',from:"document.addEventListener('submit'",to:'/** Palette keys',own:(t,at)=>{const m=[...t.slice(0,at).matchAll(/form\.id\s*===\s*'([a-z][a-z0-9-]*)'/g)].at(-1);return m?{kind:'form',id:m[1]}:undefined;}},
  {file:'main.ts',from:'async function runAgentCommand(',to:'(window as unknown as {aphroditeAgent',own:(t,at)=>{const m=[...t.slice(0,at).matchAll(/case '([a-z]+)':/g)].at(-1);return m?{kind:'agent',route:m[1]}:undefined;}},
  {file:'editor/updates.ts',from:'async function handle(',to:'return {check:',own:(t,at)=>({kind:'action',names:caseLabels(t,at)})},
  {file:'workspace/archive.ts',from:'async function handle(',to:'default: return false;',own:(t,at)=>({kind:'action',names:caseLabels(t,at)})},
];

/**
 * Effects with no button: each one is a listener control on a table row, found by the text it runs.
 * A new direct listener that leaves the app has to be added here and to a row, or the test fails.
 */
const LISTENERS:Record<string,{file:string;marker:string}>={
  'external-link':{file:'main.ts',marker:"invoke('open_external',{url:link.href})"},
  'update-check':{file:'editor/updates.ts',marker:"invoke<UpdateInfo>('update_check')"},
  'opened':{file:'main.ts',marker:"tauriListen('aphrodite-opened'"},
  // A board file dropped on the board (0.3-P3-fix3 #7): the person's import, on the import row.
  'board-drop':{file:'main.ts',marker:"for(const board of boards)void opening(async()=>openBoardFileNow("},
};
/** Helpers that are the app's own saving, run by every edit rather than by any one command. */
const EXEMPT:Record<string,string>={
  attachDiskQueue:'the workspace store: every change is saved through it, so it belongs to no single command',
};

/** The innermost named function whose body holds `at`, read off the syntax tree; undefined at the top level. */
function enclosingFunction(file:string,text:string,at:number):string|undefined{
  const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  let found:string|undefined;
  const visit=(node:ts.Node)=>{
    if(node.getStart(tree)>at||node.end<=at)return;
    if(ts.isFunctionDeclaration(node)&&node.name&&node.body&&node.body.getStart(tree)<=at)found=node.name.text;
    ts.forEachChild(node,visit);
  };
  visit(tree);
  return found;
}

/** Every place in `files` that leaves the app, with the controls that run it. */
function effectSites(files:Record<string,string>):Site[]{
  const sites:Site[]=[];
  const ownersOf=(file:string,at:number,seen:Set<string>):Owner[]=>{
    const text=files[file];
    const lineStart=text.lastIndexOf('\n',at)+1,lineEnd=text.indexOf('\n',at);
    const line=text.slice(lineStart,lineEnd<0?undefined:lineEnd);
    for(const [name,l] of Object.entries(LISTENERS))if(l.file===file&&line.includes(l.marker))return [{kind:'listener',name}];
    for(const region of REGIONS){
      if(region.file!==file)continue;
      const start=text.indexOf(region.from);if(start<0)continue;
      const end=text.indexOf(region.to,start);
      if(at>start&&at<end){const own=region.own(text.slice(start,end),at-start);if(own)return [own];}
    }
    const fn=enclosingFunction(file,text,at);
    if(!fn)return [{kind:'none',where:`${file}: ${line.trim().slice(0,100)}`}];
    if(EXEMPT[fn])return [{kind:'exempt',name:fn}];
    if(seen.has(fn))return [];
    const next=new Set(seen).add(fn);
    const calls:Owner[]=[];
    for(const [f,t] of Object.entries(files))for(const m of t.matchAll(new RegExp(`\\b${fn}\\(`,'g'))){
      if(/function\s+$/.test(t.slice(Math.max(0,m.index!-20),m.index!)))continue;
      calls.push(...ownersOf(f,m.index!,next));
    }
    return calls.length?calls:[{kind:'none',where:`${file}: ${fn}() leaves the app and nothing calls it`}];
  };
  for(const [file,text] of Object.entries(files))for(const m of text.matchAll(EFFECT)){
    const lineStart=text.lastIndexOf('\n',m.index!)+1,lineEnd=text.indexOf('\n',m.index!);
    sites.push({file,line:text.slice(lineStart,lineEnd<0?undefined:lineEnd).trim().slice(0,120),owners:ownersOf(file,m.index!,new Set())});
  }
  return sites;
}
const rowsWith=(kind:'action'|'form'|'listener',name:string)=>commands.filter(r=>r.controls.some(c=>
  kind==='form'?c.kind==='form'&&c.id===name:c.kind===kind&&c.name===name));

const sites=effectSites(tree);

test('every control that leaves the app is on an outside row, never chrome or a read',()=>{
  assert.ok(sites.length>=30,`found ${sites.length} places that leave the app`);
  for(const site of sites)for(const owner of site.owners){
    const rows=owner.kind==='action'?owner.names.flatMap(n=>rowsWith('action',n))
      :owner.kind==='form'?rowsWith('form',owner.id)
      :owner.kind==='listener'?rowsWith('listener',owner.name):[];
    if(owner.kind==='agent'){assert.equal(gradeOfKind(owner.route),'outside',`the agent's ${owner.route} leaves the app: ${site.line}`);continue;}
    if(owner.kind==='exempt'||owner.kind==='none')continue;
    assert.ok(rows.length,`${JSON.stringify(owner)} leaves the app (${site.file}: ${site.line}) and is in no row`);
    for(const row of rows)assert.equal(row.grade,'outside',`${row.id} runs ${JSON.stringify(owner)}, which leaves the app: ${site.file}: ${site.line}`);
  }
});

test('opening an archived address in the browser is outside the ledger',()=>{
  const rows=rowsWith('action','reference-open');
  assert.deepEqual(rows.map(r=>r.grade),['outside']);
  assert.notEqual(commandById['chrome.library'].controls.some(c=>c.kind==='action'&&c.name==='reference-open'),true);
});

/* The review's second gap: an effect run by a listener of its own, outside every dispatcher, used to
   pass because only commits were checked. Each one is now a listener control on an outside row. */
test('every effect outside a dispatcher belongs to a row’s control',()=>{
  const loose=sites.flatMap(s=>s.owners.filter(o=>o.kind==='none').map(o=>(o as {where:string}).where));
  assert.deepEqual(loose,[],'these leave the app with no control in the table');
  for(const [name,{file,marker}] of Object.entries(LISTENERS)){
    assert.ok(tree[file].includes(marker),`the listener "${name}" is not in ${file} any more`);
    assert.deepEqual(rowsWith('listener',name).map(r=>r.grade),['outside'],`the listener "${name}" is one outside row's control`);
  }
  const tableListeners=commands.flatMap(r=>r.controls.filter(c=>c.kind==='listener').map(c=>(c as {name:string}).name)).sort();
  assert.deepEqual(tableListeners,Object.keys(LISTENERS).sort(),'every listener a row names is one this test finds');
  const exempt=[...new Set(sites.flatMap(s=>s.owners.filter(o=>o.kind==='exempt').map(o=>(o as {name:string}).name)))];
  assert.deepEqual(exempt,Object.keys(EXEMPT),'only the workspace store is exempt');
});

test('opening a link from the app is the external-link listener on an outside row',()=>{
  const link=sites.find(s=>s.line.includes('{url:link.href}'));
  assert.deepEqual(link?.owners,[{kind:'listener',name:'external-link'}]);
  assert.equal(rowsWith('listener','external-link')[0]?.id,'outside.open-elsewhere');
});

test('a listener that leaves the app without a control is caught, directly or through a helper',()=>{
  const direct={...tree,'main.ts':`${tree['main.ts']}\ndocument.addEventListener('dblclick',()=>{void invoke('open_external',{url:'https://example.com'});});\n`};
  assert.ok(effectSites(direct).some(s=>s.owners.some(o=>o.kind==='none'&&o.where.includes('example.com'))),'a direct open_external is caught');
  const helper={...tree,'main.ts':`${tree['main.ts']}\nfunction leak(){return navigator.clipboard.writeText('x');}\ndocument.addEventListener('dblclick',()=>{void leak();});\n`};
  assert.ok(effectSites(helper).some(s=>s.owners.some(o=>o.kind==='none'&&o.where.includes('leak()'))),'a clipboard write through a helper is caught at its listener');
  const saved={...tree,'main.ts':`${tree['main.ts']}\ndocument.addEventListener('dblclick',()=>{void saveFile('x.txt','x','text/plain');});\n`};
  assert.ok(effectSites(saved).some(s=>s.owners.some(o=>o.kind==='none'&&o.where.includes('saveFile'))),'a download through saveFile is caught at its listener');
});

test('every Tauri command the interface invokes is classed as leaving the app or not',()=>{
  const invoked=new Set<string>();
  for(const text of Object.values(tree))for(const m of text.matchAll(/\binvoke(?:<[^\n]*?>)?\('([a-z_]+)'/g))invoked.add(m[1]);
  for(const name of invoked)assert.ok(EXTERNAL_COMMANDS.includes(name)||INTERNAL_COMMANDS.includes(name)||FILE_READS.includes(name),`invoke('${name}') is not classed in this test`);
  assert.deepEqual([...EXTERNAL_COMMANDS,...INTERNAL_COMMANDS,...FILE_READS].filter(n=>!invoked.has(n)),[],'no class names a command nothing invokes');
});

/* 0.3-P2-fix1 #11: media_add with a path copies a file an agent names on this Mac onto the board, where
   get_render can read it back. That read is the row's to declare, and only an agent running on this Mac
   (loopback, MCP) may ask for it; a model in the app (inApp) may use library_id, not path. That the
   refusal comes before any file is read is tested by its behaviour (tests/board-media.test.ts). */
test('reading a file an agent names is declared by the row that does it, for this Mac\'s agents only',()=>{
  const row=commandById['edit.apply'];
  assert.ok(row.reads,'edit.apply says what it reads');
  assert.deepEqual([...row.reads!.surfaces].sort(),['loopback','mcp']);
  assert.equal(row.reads!.field,'ops[].path');
  for(const name of FILE_READS){
    const where=Object.entries(tree).filter(([,t])=>new RegExp(`\\binvoke(?:<[^\\n]*?>)?\\('${name}'`).test(t)).map(([f])=>f);
    assert.deepEqual(where,['free-page.ts'],`${name} is invoked from the one module that reads and writes board files`);
  }
  assert.ok(row.mcp?.description.includes('path')&&JSON.stringify(row.input).includes('library_id'));
});

/* 0.3-P3-fix4: nothing removes a board's files any more. A failed import leaves what it placed (src/board-file.ts),
   so no command, row, tool or op takes files back, and none is left for an agent to reach. */
test('no command takes a board file\'s files back: the failed import leaves them', () => {
  const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  const files = ['main.ts', 'free-page.ts', 'board-file.ts', 'agent/commands.mjs', 'agent/ops.ts', 'agent/bridge.ts'].map(p => [p, src(p)] as const);
  assert.deepEqual(files.filter(([, t]) => /board_media_(take_back|keep|hold_begin)|\.settle\(|host\.hold\(/.test(t)).map(([p]) => p), [], 'nothing names a take-back');
  const rust = readFileSync(new URL('../src-tauri/src/board.rs', import.meta.url), 'utf8');
  assert.doesNotMatch(rust, /take_back|hold_begin|struct Held/, 'and Rust has none to give');
});
