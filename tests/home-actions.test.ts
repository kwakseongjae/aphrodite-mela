import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject} from '../src/model';
import {entryFor,cloneProject} from '../src/workspace/library';
import {workspaceHome} from '../src/workspace/home';
import {workspaceFormHtml} from '../src/workspace/workspace-ui';
import {renameDialogHtml,deleteDialogHtml,workspaceDeleteDialogHtml,storageDialogHtml} from '../src/workspace/home-dialogs';
import {troubleDialog,troubleMarkHtml,type Trouble} from '../src/ui/notices';

/**
 * Everything a person can reach from home, read off the markup: each data-action with its arguments,
 * the forms and their fields, the search box, the menus that open in place and the links out.
 *
 * `before` is what the home drawn before 0.3-L4 offered, state by state (generated from that code and
 * pasted here). Moving home onto the system may move a control, never drop one: every state must still
 * offer at least this. A project's id is written as its name, so the list reads and stays stable.
 * 0.3-L5: the one Paper/Midnight button became the theme menu's three choices, on the same action.
 */
const a=initialProject();a.name='Alpha';
const b=cloneProject(a);b.name='Beta';
const c=cloneProject(a);c.name='Gamma';
const book={version:1 as const,activeId:'personal',workspaces:[{id:'personal',name:'Mine',avatar:{kind:'color' as const,value:'#2f3a2f'},createdAt:''},{id:'client',name:'Client',avatar:{kind:'emoji' as const,value:'🌿'},createdAt:''}]};
const lib={version:1 as const,entries:[entryFor(a),{...entryFor(b),pinned:true},{...entryFor(c),archived:true}]};
const empty={version:1 as const,entries:[]};
const said:Trouble={kind:'unread',detail:'Disk said no'};
const names=new Map(lib.entries.map(e=>[e.project.id,e.project.name]));

export function reachable(html:string){
  const out=new Set<string>();
  for(const m of html.matchAll(/<(\w+)\b([^>]*)>/g)){
    const attrs=[...m[2].matchAll(/\s(data-[\w-]+|id|class)="([^"]*)"/g)];
    const act=attrs.find(x=>x[1]==='data-action');
    if(act){const extra=attrs.filter(x=>x[1].startsWith('data-')&&x[1]!=='data-action').map(x=>x[1]==='data-id'?'id='+(names.get(x[2])??x[2]):x[1].slice(5)+'='+x[2]).sort();out.add(act[2]+(extra.length?'['+extra.join(',')+']':''));}
    const id=attrs.find(x=>x[1]==='id');if(m[1]==='form'&&id)out.add('form#'+id[2]);if(m[1]==='input'&&id)out.add('input#'+id[2]);
    if(m[1]==='a'){const h=m[2].match(/\shref="([^"#][^"]*)"/);if(h)out.add('link:'+h[1]);}
    if(m[1]==='input'||m[1]==='textarea'){const nm=m[2].match(/\sname="([^"]+)"/);if(nm)out.add('field:'+nm[1]);}
    const cls=attrs.find(x=>x[1]==='class');if(m[1]==='details'&&cls)out.add('details.'+cls[2].split(/\s+/).find(k=>k.startsWith('folio-')));
  }
  return [...out].sort();
}

export const states:Record<string,()=>string>={
  // 0.3-G2b: what the warning over the boards offered is in the dialog its mark opens, which is drawn here with it.
  projects:()=>workspaceHome(lib,'recent','',troubleMarkHtml(said,false),'system','en','grid',true,book,'open',true,'Claude Code')+troubleDialog(said,'home',false).body,
  none:()=>workspaceHome(empty,'recent','','','system','en','grid',true,book),
  searchEmpty:()=>workspaceHome(lib,'recent','zzz','','system','en','grid',true,book),
  archive:()=>workspaceHome(lib,'archived','','','system','en','grid',true,book),
  list:()=>workspaceHome(lib,'recent','','','system','en','list',true,book),
  collapsed:()=>workspaceHome(lib,'recent','','','dark','ko','grid',false,book,'collapsed'),
  noBook:()=>workspaceHome(lib,'pinned','','','system','en','grid'),
  workspaceForm:()=>workspaceFormHtml('en',book.workspaces[0],{canDelete:true,projectCount:2}),
  workspaceFormImage:()=>workspaceFormHtml('ko',{id:'pic',name:'Pic',avatar:{kind:'image',value:'data:image/png;base64,AA'},createdAt:''},{canDelete:false,projectCount:0}),
  newWorkspaceForm:()=>workspaceFormHtml('en',undefined,{canDelete:false,projectCount:0}),
  rename:()=>renameDialogHtml('en',a),
  remove:()=>deleteDialogHtml('ko',a),
  workspaceDelete:()=>workspaceDeleteDialogHtml('en','client',2),
  storage:()=>storageDialogHtml('ko','/Users/someone/Library/Application Support/Aphrodite'),
};

const before:Record<string,string[]>={
  projects:["agent-connect-toggle","brand-kit","details.folio-help","details.folio-lang","details.folio-more","details.folio-ws","disk-reload","home","home-sidebar","hub-archive[id=Alpha]","hub-archive[id=Beta]","hub-delete[id=Alpha]","hub-delete[id=Beta]","hub-duplicate[id=Alpha]","hub-duplicate[id=Beta]","hub-filter[filter=archived]","hub-filter[filter=pinned]","hub-filter[filter=recent]","hub-move[id=Alpha,workspace=client]","hub-move[id=Beta,workspace=client]","hub-open[id=Alpha]","hub-open[id=Beta]","hub-pin[id=Alpha]","hub-pin[id=Beta]","hub-recovery","hub-rename[id=Alpha]","hub-rename[id=Beta]","hub-theme[scheme=dark]","hub-theme[scheme=light]","hub-theme[scheme=system]","hub-view[view=grid]","hub-view[view=list]","import-project","input#project-search","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","new-project","set-language[lang=en]","set-language[lang=ko]","storage-info","taste","vault-open[id=Alpha]","vault-open[id=Beta]","ws-new","ws-settings","ws-switch[id=client]","ws-switch[id=personal]"],
  none:["agent-connect-toggle","brand-kit","details.folio-help","details.folio-lang","details.folio-ws","home","home-sidebar","hub-filter[filter=archived]","hub-filter[filter=pinned]","hub-filter[filter=recent]","hub-theme[scheme=dark]","hub-theme[scheme=light]","hub-theme[scheme=system]","hub-view[view=grid]","hub-view[view=list]","import-project","input#project-search","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","new-project","set-language[lang=en]","set-language[lang=ko]","storage-info","taste","ws-new","ws-settings","ws-switch[id=client]","ws-switch[id=personal]"],
  searchEmpty:["agent-connect-toggle","brand-kit","details.folio-help","details.folio-lang","details.folio-ws","home","home-sidebar","hub-filter[filter=archived]","hub-filter[filter=pinned]","hub-filter[filter=recent]","hub-theme[scheme=dark]","hub-theme[scheme=light]","hub-theme[scheme=system]","hub-view[view=grid]","hub-view[view=list]","import-project","input#project-search","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","new-project","set-language[lang=en]","set-language[lang=ko]","storage-info","taste","ws-new","ws-settings","ws-switch[id=client]","ws-switch[id=personal]"],
  archive:["agent-connect-toggle","brand-kit","details.folio-help","details.folio-lang","details.folio-more","details.folio-ws","home","home-sidebar","hub-archive[id=Gamma]","hub-delete[id=Gamma]","hub-duplicate[id=Gamma]","hub-filter[filter=archived]","hub-filter[filter=pinned]","hub-filter[filter=recent]","hub-move[id=Gamma,workspace=client]","hub-open[id=Gamma]","hub-pin[id=Gamma]","hub-rename[id=Gamma]","hub-theme[scheme=dark]","hub-theme[scheme=light]","hub-theme[scheme=system]","hub-view[view=grid]","hub-view[view=list]","import-project","input#project-search","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","new-project","set-language[lang=en]","set-language[lang=ko]","storage-info","taste","vault-open[id=Gamma]","ws-new","ws-settings","ws-switch[id=client]","ws-switch[id=personal]"],
  list:["agent-connect-toggle","brand-kit","details.folio-help","details.folio-lang","details.folio-more","details.folio-ws","home","home-sidebar","hub-archive[id=Alpha]","hub-archive[id=Beta]","hub-delete[id=Alpha]","hub-delete[id=Beta]","hub-duplicate[id=Alpha]","hub-duplicate[id=Beta]","hub-filter[filter=archived]","hub-filter[filter=pinned]","hub-filter[filter=recent]","hub-move[id=Alpha,workspace=client]","hub-move[id=Beta,workspace=client]","hub-open[id=Alpha]","hub-open[id=Beta]","hub-pin[id=Alpha]","hub-pin[id=Beta]","hub-rename[id=Alpha]","hub-rename[id=Beta]","hub-theme[scheme=dark]","hub-theme[scheme=light]","hub-theme[scheme=system]","hub-view[view=grid]","hub-view[view=list]","import-project","input#project-search","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","new-project","set-language[lang=en]","set-language[lang=ko]","storage-info","taste","vault-open[id=Alpha]","vault-open[id=Beta]","ws-new","ws-settings","ws-switch[id=client]","ws-switch[id=personal]"],
  collapsed:["agent-connect-toggle","brand-kit","details.folio-help","details.folio-lang","details.folio-more","details.folio-ws","home","home-sidebar","hub-archive[id=Alpha]","hub-archive[id=Beta]","hub-delete[id=Alpha]","hub-delete[id=Beta]","hub-duplicate[id=Alpha]","hub-duplicate[id=Beta]","hub-filter[filter=archived]","hub-filter[filter=pinned]","hub-filter[filter=recent]","hub-move[id=Alpha,workspace=client]","hub-move[id=Beta,workspace=client]","hub-open[id=Alpha]","hub-open[id=Beta]","hub-pin[id=Alpha]","hub-pin[id=Beta]","hub-rename[id=Alpha]","hub-rename[id=Beta]","hub-theme[scheme=dark]","hub-theme[scheme=light]","hub-theme[scheme=system]","hub-view[view=grid]","hub-view[view=list]","import-project","input#project-search","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","new-project","set-language[lang=en]","set-language[lang=ko]","storage-info","taste","vault-open[id=Alpha]","vault-open[id=Beta]","ws-new","ws-settings","ws-switch[id=client]","ws-switch[id=personal]"],
  noBook:["agent-connect-toggle","brand-kit","details.folio-help","details.folio-lang","details.folio-more","home","home-sidebar","hub-archive[id=Beta]","hub-delete[id=Beta]","hub-duplicate[id=Beta]","hub-filter[filter=archived]","hub-filter[filter=pinned]","hub-filter[filter=recent]","hub-open[id=Beta]","hub-pin[id=Beta]","hub-rename[id=Beta]","hub-theme[scheme=dark]","hub-theme[scheme=light]","hub-theme[scheme=system]","hub-view[view=grid]","hub-view[view=list]","import-project","input#project-search","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","new-project","set-language[lang=en]","set-language[lang=ko]","storage-info","taste","vault-open[id=Beta]"],
  workspaceForm:["field:color","field:emoji","field:image","field:name","form#workspace-form","ws-delete[id=personal]","ws-pick-color[color=#3a4531]","ws-pick-color[color=#3f5348]","ws-pick-color[color=#44515c]","ws-pick-color[color=#5a4e3c]","ws-pick-color[color=#5c4a3a]","ws-pick-color[color=#6b4548]","ws-pick-emoji[emoji=✏️]","ws-pick-emoji[emoji=✨]","ws-pick-emoji[emoji=🌙]","ws-pick-emoji[emoji=🌿]","ws-pick-emoji[emoji=🍎]","ws-pick-emoji[emoji=🎨]","ws-pick-emoji[emoji=🎬]","ws-pick-emoji[emoji=🏛️]","ws-pick-emoji[emoji=💎]","ws-pick-emoji[emoji=📐]","ws-pick-emoji[emoji=📚]","ws-pick-emoji[emoji=🔥]","ws-pick-emoji[emoji=🕯️]","ws-pick-emoji[emoji=🗂️]","ws-pick-emoji[emoji=🛠️]","ws-pick-emoji[emoji=🧪]","ws-pick-emoji[emoji=🧭]","ws-pick-emoji[emoji=🪶]","ws-pick-image"],
  workspaceFormImage:["field:color","field:emoji","field:image","field:name","form#workspace-form","ws-clear-image","ws-pick-color[color=#3a4531]","ws-pick-color[color=#3f5348]","ws-pick-color[color=#44515c]","ws-pick-color[color=#5a4e3c]","ws-pick-color[color=#5c4a3a]","ws-pick-color[color=#6b4548]","ws-pick-emoji[emoji=✏️]","ws-pick-emoji[emoji=✨]","ws-pick-emoji[emoji=🌙]","ws-pick-emoji[emoji=🌿]","ws-pick-emoji[emoji=🍎]","ws-pick-emoji[emoji=🎨]","ws-pick-emoji[emoji=🎬]","ws-pick-emoji[emoji=🏛️]","ws-pick-emoji[emoji=💎]","ws-pick-emoji[emoji=📐]","ws-pick-emoji[emoji=📚]","ws-pick-emoji[emoji=🔥]","ws-pick-emoji[emoji=🕯️]","ws-pick-emoji[emoji=🗂️]","ws-pick-emoji[emoji=🛠️]","ws-pick-emoji[emoji=🧪]","ws-pick-emoji[emoji=🧭]","ws-pick-emoji[emoji=🪶]","ws-pick-image"],
  newWorkspaceForm:["field:color","field:emoji","field:image","field:name","form#workspace-form","ws-pick-color[color=#3a4531]","ws-pick-color[color=#3f5348]","ws-pick-color[color=#44515c]","ws-pick-color[color=#5a4e3c]","ws-pick-color[color=#5c4a3a]","ws-pick-color[color=#6b4548]","ws-pick-emoji[emoji=✏️]","ws-pick-emoji[emoji=✨]","ws-pick-emoji[emoji=🌙]","ws-pick-emoji[emoji=🌿]","ws-pick-emoji[emoji=🍎]","ws-pick-emoji[emoji=🎨]","ws-pick-emoji[emoji=🎬]","ws-pick-emoji[emoji=🏛️]","ws-pick-emoji[emoji=💎]","ws-pick-emoji[emoji=📐]","ws-pick-emoji[emoji=📚]","ws-pick-emoji[emoji=🔥]","ws-pick-emoji[emoji=🕯️]","ws-pick-emoji[emoji=🗂️]","ws-pick-emoji[emoji=🛠️]","ws-pick-emoji[emoji=🧪]","ws-pick-emoji[emoji=🧭]","ws-pick-emoji[emoji=🪶]","ws-pick-image"],
  // The dialog bodies lived in main.ts before; these are what those strings offered.
  rename:["field:name","field:projectId","form#hub-rename-form"],
  remove:["close-modal","hub-delete-confirm[id=Alpha]"],
  workspaceDelete:["close-modal","ws-delete-confirm[id=client]"],
  storage:["copy-storage-path","hub-backup","hub-recovery"],
};

export function dropped(){
  return Object.entries(before).flatMap(([state,was])=>{const now=new Set(reachable(states[state]()));return was.filter(x=>!now.has(x)).map(x=>state+': '+x);});
}

test('every state of home still offers everything it offered before it moved onto the system',()=>{
  assert.deepEqual(Object.keys(states).sort(),Object.keys(before).sort());
  assert.deepEqual(dropped(),[]);
});

test('the check notices a control that goes missing',()=>{
  const was=states.projects;
  states.projects=()=>was().replace(/<button[^>]*data-action="import-project"[^>]*>/,'<button>');
  try{assert.deepEqual(dropped(),['projects: import-project']);}finally{states.projects=was;}
});
