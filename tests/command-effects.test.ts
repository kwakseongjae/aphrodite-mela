import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
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
  'open_external','update_check','update_download','update_notes','update_open','update_reveal','fonts_install',
  'image_library_delete','image_library_import','image_library_reveal','references_add','references_delete','references_fetch',
  'taste_write','taste_forget','vault_document','vault_sync','workspace_write',
];
/** Tauri commands that only read, or are the agent channel's own plumbing. */
const INTERNAL_COMMANDS=[
  'agent_bridge_reply','agent_bridge_start','fonts_installed','image_library_list','image_library_read','recognize_reference',
  'references_list','references_poster','render_page','taste_read','vault_read','workspace_read','workspace_recovery',
];
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
};
/** Helpers that are the app's own saving, run by every edit rather than by any one command. */
const EXEMPT:Record<string,string>={
  attachDiskQueue:'the workspace store: every change is saved through it, so it belongs to no single command',
};

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
    const fn=[...text.slice(0,at).matchAll(/(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(/g)].at(-1)?.[1];
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
    if(owner.kind==='exempt'||owner.kind==='none'||owner.kind==='listener')continue;
    assert.ok(rows.length,`${JSON.stringify(owner)} leaves the app (${site.file}: ${site.line}) and is in no row`);
    for(const row of rows)assert.equal(row.grade,'outside',`${row.id} runs ${JSON.stringify(owner)}, which leaves the app: ${site.file}: ${site.line}`);
  }
});

test('opening an archived address in the browser is outside the ledger',()=>{
  const rows=rowsWith('action','reference-open');
  assert.deepEqual(rows.map(r=>r.grade),['outside']);
  assert.notEqual(commandById['chrome.library'].controls.some(c=>c.kind==='action'&&c.name==='reference-open'),true);
});
