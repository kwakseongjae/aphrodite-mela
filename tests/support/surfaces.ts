import {dockHtml} from '../../src/editor/dock';
import {helpMenuHtml} from '../../src/editor/help-menu';
import {commandPaletteHtml,commandTable} from '../../src/editor/command-palette';
import {toastHtml} from '../../src/design/toasts';
import {updateNoticeHtml,type UpdateInfo} from '../../src/update-notice';
import {welcomeHtml,tourCardHtml,tourSteps} from '../../src/workspace/onboarding';
import {vaultHtml} from '../../src/workspace/vault';
import {agentPanelHtml,startDelegation} from '../../src/agent/delegation';
import {vanishedHtml,crumbFor} from '../../src/workspace/breadcrumb';
import {languageSettingsHtml} from '../../src/i18n';
import {initialProject} from '../../src/model';

/**
 * Everything a person can reach on one surface, read off its markup: each data-action with its arguments,
 * the bare data- marks main.ts finds things by, the forms and their fields, ids, links out and menus that
 * open in place. The same reading as tests/home-actions.test.ts, widened to selects and bare marks.
 */
export function reachable(html:string){
  const out=new Set<string>();
  for(const m of html.matchAll(/<(\w+)\b([^>]*)>/g)){
    const attrs=[...m[2].matchAll(/\s(data-[\w-]+|id|class|name|href)(?:="([^"]*)")?/g)].map(a=>[a[1],a[2]??''] as const);
    const get=(k:string)=>attrs.find(a=>a[0]===k)?.[1];
    const act=get('data-action');
    if(act!==undefined){const extra=attrs.filter(a=>a[0].startsWith('data-')&&a[0]!=='data-action').map(a=>a[0].slice(5)+(a[1]?'='+a[1]:'')).sort();out.add(act+(extra.length?'['+extra.join(',')+']':''));}
    else for(const [k] of attrs)if(k==='data-palette'||k==='data-toast'||k==='data-scope-frame'||k==='data-delegation-receipts')out.add('mark:'+k);
    const id=get('id');if(id&&['form','input','ul','select','textarea'].includes(m[1]))out.add(m[1]+'#'+id);
    if(m[1]==='a'){const h=get('href');if(h&&!h.startsWith('#'))out.add('link:'+h);}
    if(['input','textarea','select'].includes(m[1])){const nm=get('name');if(nm)out.add('field:'+nm);}
    if(m[1]==='details')out.add('details');
  }
  return [...out].sort();
}

const project=initialProject();
const delegation=startDelegation(project,{operator:'Astra',intent:'Tidy the hero',scope:{deletePages:true}},'2026-11-24T00:00:00.000Z');
const info:UpdateInfo={current:'0.2.9',latest:'0.3.0',newer:true,name:'Aphrodite_0.3.0.dmg',url:'https://example.test/a.dmg',size:9_000_000,notes:'https://example.test/notes',summary:['One','Two']};
const ctx={hasSelection:true,canUndo:true,canRedo:true,approved:false,viewport:'desktop' as const,pages:[{id:'p1',name:'Home',active:true},{id:'p2',name:'Mobile',active:false}]};

export const states:Record<string,()=>string>={
  dock:()=>dockHtml({mode:'design',language:'en',activeTool:'select',zoom:100}),
  dockPointer:()=>dockHtml({mode:'design',language:'en',activeTool:'hand',zoom:100,openGroup:'pointer'}),
  dockInsert:()=>dockHtml({mode:'dev',language:'ko',zoom:50,openGroup:'insert'}),
  dockMedia:()=>dockHtml({mode:'agent',language:'en',delegated:true,zoom:100,openGroup:'media'}),
  dockZoom:()=>dockHtml({mode:'design',language:'ko',zoom:100,openGroup:'zoom'}),
  helpEn:()=>helpMenuHtml('en'),
  helpKo:()=>helpMenuHtml('ko'),
  palette:()=>commandPaletteHtml(commandTable(ctx),'','en'),
  paletteQuery:()=>commandPaletteHtml(commandTable(ctx),'frame','en'),
  paletteNone:()=>commandPaletteHtml(commandTable(ctx),'zzzzqqq','ko'),
  toasts:()=>toastHtml([{id:1,message:'Saved',count:1,at:0},{id:2,message:'Deleted',count:3,at:0},{id:3,message:'Page removed.',count:1,at:0,undo:'p:1'}],{undo:'p:1'}),
  updateOffer:()=>updateNoticeHtml(info,'offer','en'),
  updateWorking:()=>updateNoticeHtml(info,'working','en','42%'),
  updateInstalling:()=>updateNoticeHtml(info,'installing','ko'),
  updateRestart:()=>updateNoticeHtml(info,'restart','en'),
  updateReady:()=>updateNoticeHtml(info,'ready','ko'),
  updateFailed:()=>updateNoticeHtml(info,'failed','en','No network'),
  welcomeEn:()=>welcomeHtml('en'),
  welcomeKo:()=>welcomeHtml('ko'),
  tourFirst:()=>tourCardHtml(tourSteps('en')[0],0,tourSteps('en').length,'en'),
  tourLast:()=>{const s=tourSteps('ko');return tourCardHtml(s[s.length-1],s.length-1,s.length,'ko');},
  vault:()=>vaultHtml({path:'/Users/someone/Aphrodite/project-vault-v1/p1',snapshot:'DESIGN.md',files:[{name:'DESIGN.md',kind:'snapshot',bytes:2048},{name:'notes.md',kind:'document',bytes:900,source:'import'},{name:'hero.png',kind:'image',bytes:40000}],externalReferences:[1]},'ko'),
  agentPanel:()=>agentPanelHtml(delegation,[{seq:1,kind:'edit.copy',at:'2026-11-24T00:01:00.000Z'}],'en',{frameName:'Home',channel:'http://127.0.0.1:1234'}),
  agentPanelEmpty:()=>agentPanelHtml(delegation,[],'ko'),
  vanished:()=>vanishedHtml(crumbFor('/Users/someone/Aphrodite',3,2,new Date('2026-11-24T00:00:00Z')),false),
  languageEditor:()=>languageSettingsHtml('en','ko'),
  languageHome:()=>languageSettingsHtml('ko'),
};
