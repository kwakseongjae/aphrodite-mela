import {esc} from '../html';
import {icon} from '../design/icon';
import type {Language} from '../i18n';

/** Editor modes, Figma-style: design (edit), dev (read-only handoff), agent (control delegated to a computer-use agent). */
export type EditorMode='design'|'dev'|'agent';
export const editorModes:readonly EditorMode[]=['design','dev','agent'];
export function isEditorMode(value:unknown):value is EditorMode{return editorModes.includes(value as EditorMode);}

export type DockItem={id:string;action:string;data?:Record<string,string>;icon:string;en:string;ko:string;key:string};
export type DockTool=DockItem;
export type DockGroup={id:string;items:readonly DockItem[]};

/** Tools on the floating dock, grouped like Figma tool slots. Each group's first item is its default. */
export const dockGroups:readonly DockGroup[]=[
  {id:'pointer',items:[
    {id:'select',action:'dock-select',icon:'mouse-pointer-2',en:'Select',ko:'선택',key:'V'},
    {id:'hand',action:'dock-hand',icon:'hand',en:'Hand',ko:'손',key:'H'},
  ]},
  {id:'insert',items:[
    {id:'add',action:'component-explorer',icon:'plus',en:'Add component',ko:'컴포넌트 추가',key:'A'},
    {id:'frame',action:'new-frame',icon:'frame',en:'New frame · a page on the space',ko:'새 프레임 · 공간 위의 페이지',key:'F'},
  ]},
  {id:'media',items:[
    {id:'reference',action:'reference',icon:'image-plus',en:'Reference · 3 directions',ko:'레퍼런스 · 3안',key:'R'},
    {id:'vibe',action:'autofill',icon:'sparkles',en:'Get Vibe',ko:'Get Vibe',key:'G'},
  ]},
  {id:'run',items:[
    {id:'preview',action:'preview',icon:'play',en:'Preview',ko:'미리보기',key:'P'},
  ]},
];

/** The tools that work on sections (0.3-L4b): without a section page on the board they are not on the dock, and their keys do nothing. */
export const sectionTools:ReadonlySet<string>=new Set(['add','reference','vibe']);
/** The groups as the dock shows them: with no section page, the section tools are left out, and a group left empty goes. */
function shownGroups(sections:boolean):readonly DockGroup[]{return sections?dockGroups:dockGroups.map(g=>({...g,items:g.items.filter(i=>!sectionTools.has(i.id))})).filter(g=>g.items.length);}

/** Flat list of every dock item. Other modules and `dockShortcut` still read this. */
export const dockTools:readonly DockItem[]=dockGroups.flatMap(g=>g.items);

export const modeCopy:Record<EditorMode,{en:string;ko:string;hintEn:string;hintKo:string;key:string}>={
  design:{en:'Design',ko:'디자인',hintEn:'Edit components, copy and tokens',hintKo:'컴포넌트·문구·토큰 편집',key:'1'},
  dev:{en:'Dev',ko:'개발',hintEn:'Read-only: identity, tokens as CSS, markup, handoff',hintKo:'읽기 전용: 컴포넌트 식별자·토큰 CSS·마크업·핸드오프',key:'2'},
  agent:{en:'Agent',ko:'에이전트',hintEn:'Hand the screen to a computer-use agent; approval stays yours',hintKo:'컴퓨터 유즈 에이전트에게 화면을 맡깁니다. 승인은 사람의 몫입니다',key:'3'},
};

const groupCopy:Record<string,{en:string;ko:string}>={
  pointer:{en:'Pointer tools',ko:'포인터 도구'},
  insert:{en:'Insert tools',ko:'삽입 도구'},
  media:{en:'Media tools',ko:'미디어 도구'},
  run:{en:'Run',ko:'실행'},
  zoom:{en:'Zoom',ko:'줌'},
};

const zoomItems:readonly {action:string;en:string;ko:string;keys:string}[]=[
  {action:'zoom-in',en:'Zoom in',ko:'확대',keys:'⌘+'},
  {action:'zoom-out',en:'Zoom out',ko:'축소',keys:'⌘−'},
  {action:'zoom-100',en:'Zoom to 100%',ko:'100%로 보기',keys:'⌘0'},
  {action:'zoom-fit',en:'Zoom to fit',ko:'전체 보기',keys:'⇧1'},
  {action:'zoom-frame',en:'Zoom to frame',ko:'프레임 맞춤',keys:'⇧2'},
];

function dataAttrs(data?:Record<string,string>){return Object.entries(data??{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('');}
function copy(row:{en:string;ko:string},ko:boolean){return ko?row.ko:row.en;}
function currentItem(group:DockGroup,activeTool?:string){return group.items.find(i=>i.id===activeTool)??group.items[0];}

function caretButton(groupId:string,open:boolean,ko:boolean){
  const label=copy(groupCopy[groupId]??{en:groupId,ko:groupId},ko);
  return `<button type="button" class="dock-caret ui-icon-btn" data-action="dock-group" data-group="${esc(groupId)}" aria-expanded="${open}" aria-label="${esc(label)}">${icon('chevron-down','ui-icon ui-icon-xs')}</button>`;
}

/** Why Preview is off on a board that shows no page yet (0.3-L5 fix 1): it would open the hidden page every new board starts with. */
export function nothingToPreview(ko:boolean){return ko?'보드에 보이는 페이지가 아직 없어 미리 볼 것이 없습니다.':'There is nothing to preview yet: the board shows no page.';}

function toolButton(item:DockItem,state:{activeTool?:string;language:Language;empty?:boolean}){
  const label=copy(item,state.language==='ko');
  const off=item.action==='preview'&&state.empty;
  return `<button type="button" class="dock-tool ui-icon-btn" data-action="${esc(item.action)}"${dataAttrs(item.data)} data-tool="${esc(item.id)}" aria-pressed="${state.activeTool===item.id}" aria-label="${esc(label)}" title="${esc(off?nothingToPreview(state.language==='ko'):`${label} · ${item.key}`)}"${off?' disabled':''}>${icon(item.icon,'ui-icon')}</button>`;
}

function toolMenu(group:DockGroup,current:DockItem,ko:boolean){
  const items=group.items.map(item=>{
    const checked=item.id===current.id;
    const check=checked?icon('check','dock-check ui-icon ui-icon-sm'):'<i class="dock-check"></i>';
    return `<button type="button" class="ui-menu-item" role="menuitemradio" aria-checked="${checked}" data-action="${esc(item.action)}"${dataAttrs(item.data)} data-tool="${esc(item.id)}">${check}${icon(item.icon,'ui-icon ui-icon-sm')}<span>${esc(copy(item,ko))}</span><span class="ui-menu-key">${esc(item.key)}</span></button>`;
  }).join('');
  return `<div class="dock-menu ui-menu" role="menu" data-group="${esc(group.id)}">${items}</div>`;
}

function zoomMenu(ko:boolean){
  const items=zoomItems.map(item=>`<button type="button" class="ui-menu-item" role="menuitem" data-action="${esc(item.action)}"><span>${esc(copy(item,ko))}</span><span class="ui-menu-key">${esc(item.keys)}</span></button>`).join('');
  return `<div class="dock-menu ui-menu" role="menu" data-group="zoom">${items}</div>`;
}

export function dockHtml(state:{mode:EditorMode;language:Language;activeTool?:string;delegated?:boolean;zoom?:number;openGroup?:string;sections?:boolean;empty?:boolean}):string{
  const ko=state.language==='ko';
  const tools=shownGroups(state.sections??true).map(group=>{
    const current=currentItem(group,state.activeTool);
    const open=state.openGroup===group.id;
    const caret=group.items.length>1?caretButton(group.id,open,ko):'';
    const menu=open?toolMenu(group,current,ko):'';
    return `<div class="dock-slot" data-group="${esc(group.id)}">${toolButton(current,state)}${caret}${menu}</div>`;
  }).join('');
  const modes=editorModes.map(m=>`<button type="button" class="dock-mode ui-seg-item" data-action="editor-mode" data-mode="${m}" aria-pressed="${state.mode===m}" title="${esc(ko?modeCopy[m].hintKo:modeCopy[m].hintEn)} · ${modeCopy[m].key}">${m==='agent'&&state.delegated?icon('bot','ui-icon ui-icon-sm'):''}<span>${esc(ko?modeCopy[m].ko:modeCopy[m].en)}</span></button>`).join('');
  const zoom=state.zoom?`<span class="dock-divider ui-toolbar-sep"></span><div class="dock-slot" data-group="zoom"><button type="button" class="dock-zoom ui-btn ui-btn-quiet" data-action="zoom-fit" title="${esc(ko?'전체 보기 ⇧1 · 프레임 맞춤 ⇧2 · 100% ⌘0 · ⌘휠 줌':'Fit all ⇧1 · Fit frame ⇧2 · 100% ⌘0 · ⌘wheel zoom')}">${state.zoom}%</button>${caretButton('zoom',state.openGroup==='zoom',ko)}${state.openGroup==='zoom'?zoomMenu(ko):''}</div>`:'';
  return `<div class="dock ui-toolbar ui-toolbar-float" role="toolbar" aria-label="${ko?'도구':'Tools'}" data-mode="${state.mode}"><div class="dock-tools">${tools}</div><span class="dock-divider ui-toolbar-sep"></span><div class="dock-modes ui-seg" role="group" aria-label="${ko?'모드':'Mode'}">${modes}</div>${zoom}</div>`;
}

/** Maps a bare key press (no modifiers, outside inputs) to a dock tool or mode. Returns null when unmapped. */
export function dockShortcut(key:string,sections=true):{tool?:DockTool;mode?:EditorMode}|null{
  const k=key.toUpperCase();
  const tool=dockTools.find(t=>t.key===k&&(sections||!sectionTools.has(t.id)));if(tool)return {tool};
  const mode=editorModes.find(m=>modeCopy[m].key===k);if(mode)return {mode};
  return null;
}
