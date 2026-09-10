import {esc} from '../html';
import {icon} from '../design/icon';
import type {Language} from '../i18n';

/** Editor modes, Figma-style: design (edit), dev (read-only handoff), agent (control delegated to a computer-use agent). */
export type EditorMode='design'|'dev'|'agent';
export const editorModes:readonly EditorMode[]=['design','dev','agent'];
export function isEditorMode(value:unknown):value is EditorMode{return editorModes.includes(value as EditorMode);}

export type DockTool={id:string;action:string;data?:Record<string,string>;icon:string;en:string;ko:string;key:string};

/** Tools on the floating dock. `key` is the single-letter shortcut (Figma-style) outside text inputs. */
export const dockTools:readonly DockTool[]=[
  {id:'select',action:'dock-select',icon:'mouse-pointer-2',en:'Select',ko:'선택',key:'V'},
  {id:'add',action:'component-explorer',icon:'plus',en:'Add component',ko:'컴포넌트 추가',key:'A'},
  {id:'frame',action:'add',data:{kind:'frame'},icon:'frame',en:'Layout frame',ko:'레이아웃 프레임',key:'F'},
  {id:'reference',action:'reference',icon:'image-plus',en:'Reference · 3 directions',ko:'레퍼런스 · 3안',key:'R'},
  {id:'vibe',action:'autofill',icon:'sparkles',en:'Get Vibe',ko:'Get Vibe',key:'G'},
  {id:'preview',action:'preview',icon:'play',en:'Preview',ko:'미리보기',key:'P'},
];

export const modeCopy:Record<EditorMode,{en:string;ko:string;hintEn:string;hintKo:string;key:string}>={
  design:{en:'Design',ko:'디자인',hintEn:'Edit components, copy and tokens',hintKo:'컴포넌트·문구·토큰 편집',key:'1'},
  dev:{en:'Dev',ko:'개발',hintEn:'Read-only: identity, tokens as CSS, markup, handoff',hintKo:'읽기 전용: 컴포넌트 식별자·토큰 CSS·마크업·핸드오프',key:'2'},
  agent:{en:'Agent',ko:'에이전트',hintEn:'Hand the screen to a computer-use agent; approval stays yours',hintKo:'컴퓨터 유즈 에이전트에게 화면을 맡깁니다. 승인은 사람의 몫입니다',key:'3'},
};

export function dockHtml(state:{mode:EditorMode;language:Language;activeTool?:string;delegated?:boolean;zoom?:number}):string{
  const ko=state.language==='ko';
  const tools=dockTools.map(t=>`<button type="button" class="dock-tool" data-action="${esc(t.action)}"${Object.entries(t.data??{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')} data-tool="${t.id}" aria-pressed="${state.activeTool===t.id}" aria-label="${esc(ko?t.ko:t.en)}" title="${esc(ko?t.ko:t.en)} · ${t.key}">${icon(t.icon)}</button>`).join('');
  const modes=editorModes.map(m=>`<button type="button" class="dock-mode" data-action="editor-mode" data-mode="${m}" aria-pressed="${state.mode===m}" title="${esc(ko?modeCopy[m].hintKo:modeCopy[m].hintEn)} · ${modeCopy[m].key}">${m==='agent'&&state.delegated?icon('bot'):''}<span>${esc(ko?modeCopy[m].ko:modeCopy[m].en)}</span></button>`).join('');
  const zoom=state.zoom?`<span class="dock-divider"></span><button type="button" class="dock-zoom" data-action="zoom" title="${ko?'확대/축소 순환 (70·85·100·125%)':'Cycle zoom (70·85·100·125%)'}">${state.zoom}%</button>`:'';
  return `<div class="dock" role="toolbar" aria-label="${ko?'도구':'Tools'}" data-mode="${state.mode}"><div class="dock-tools">${tools}</div><span class="dock-divider"></span><div class="dock-modes" role="group" aria-label="${ko?'모드':'Mode'}">${modes}</div>${zoom}</div>`;
}

/** Maps a bare key press (no modifiers, outside inputs) to a dock tool or mode. Returns null when unmapped. */
export function dockShortcut(key:string):{tool?:DockTool;mode?:EditorMode}|null{
  const k=key.toUpperCase();
  const tool=dockTools.find(t=>t.key===k);if(tool)return {tool};
  const mode=editorModes.find(m=>modeCopy[m].key===k);if(mode)return {mode};
  return null;
}
