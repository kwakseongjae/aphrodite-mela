import {esc} from '../html';
import {icon} from '../design/icon';
import {avatarContent,avatarStyle,MAX_WORKSPACES,WORKSPACE_COLORS,type Workspace,type WorkspaceBook} from './workspaces';
import type {Language} from '../i18n';

export const avatarPalette=WORKSPACE_COLORS;

/** A curated set that suits the studio: classical, papery, tools of the trade. Not a full emoji keyboard. */
export const avatarEmoji=['🍎','🌿','🪶','🌙','✨','🔥','🎨','✏️','📐','🏛️','📚','🗂️','🧭','💎','🕯️','🧪','🛠️','🎬'] as const;

/** The avatar chip: a colour with initials, an emoji, or an uploaded image. */
export function avatarChipHtml(ws:Workspace,extraClass=''):string{
  return `<span class="ws-avatar ${extraClass}" style="${esc(avatarStyle(ws))}" aria-hidden="true">${avatarContent(ws)}</span>`;
}

/** Sidebar switcher: the active workspace, and a menu of the rest. Figma's workspace picker, local. */
export function workspaceSwitcherHtml(book:WorkspaceBook,counts:Record<string,number>,language:Language):string{
  const ko=language==='ko';
  const active=book.workspaces.find(w=>w.id===book.activeId)??book.workspaces[0];
  const item=(w:Workspace)=>`<button type="button" class="ui-menu-item" role="menuitemradio" aria-checked="${w.id===book.activeId}" data-action="ws-switch" data-id="${esc(w.id)}">${avatarChipHtml(w,'ui-avatar')}<span class="ws-menu-name">${esc(w.name)}</span><span class="ui-menu-key">${counts[w.id]??0}</span>${w.id===book.activeId?icon('check','ui-icon ui-icon-sm'):''}</button>`;
  const full=book.workspaces.length>=MAX_WORKSPACES;
  return `<details class="folio-ws"><summary class="ui-ws" aria-label="${ko?'작업 공간 전환':'Switch workspace'}">${avatarChipHtml(active,'ui-avatar')}<span class="ui-ws-name ws-current">${esc(active.name)}</span>${icon('chevrons-up-down','ui-icon ui-icon-sm')}</summary><div class="folio-menu ws-menu ui-menu" role="menu"><p class="ui-menu-label">${ko?'작업 공간':'Workspaces'}</p>${book.workspaces.map(item).join('')}<div class="ui-menu-sep"></div><button type="button" class="ui-menu-item" role="menuitem" data-action="ws-new"${full?' disabled':''}>${icon('plus','ui-icon ui-icon-sm')}<span>${ko?'새 작업 공간':'New workspace'}</span></button><button type="button" class="ui-menu-item" role="menuitem" data-action="ws-settings">${icon('settings','ui-icon ui-icon-sm')}<span>${ko?'작업 공간 설정':'Workspace settings'}</span></button></div></details>`;
}

/** The name + avatar form, shared by "New workspace" and "Workspace settings". */
export function workspaceFormHtml(language:Language,ws:Workspace|undefined,options:{canDelete:boolean;projectCount:number}):string{
  const ko=language==='ko';
  const editing=!!ws;
  const avatar=ws?.avatar??{kind:'color' as const,value:avatarPalette[0]};
  const activeColor=avatar.kind==='color'?avatar.value:'';
  const swatches=avatarPalette.map(c=>`<button type="button" class="ws-swatch" data-action="ws-pick-color" data-color="${c}" aria-label="${c}" aria-pressed="${c.toLowerCase()===activeColor.toLowerCase()}" style="background:${c}"></button>`).join('');
  const preview=ws?avatarChipHtml(ws,'ui-avatar ws-avatar-lg'):`<span class="ws-avatar ui-avatar ws-avatar-lg" style="background:${avatarPalette[0]};color:#fff" data-ws-preview></span>`;
  return `<form id="workspace-form" class="ui-home-form" data-id="${esc(ws?.id??'')}">
<div class="ws-form-head">${preview}<label class="ui-label ws-name-field">${ko?'이름':'Name'}<input class="ui-input" name="name" required maxlength="60" value="${esc(ws?.name??'')}" placeholder="${ko?'예: 개인 작업 공간, 클라이언트 A':'e.g. Personal workspace, Client A'}" autocomplete="off"></label></div>
<fieldset class="ws-avatar-picker"><legend class="ui-label">${ko?'아바타':'Avatar'}</legend>
<div class="ws-pick-row"><span class="ws-pick-label">${ko?'색상':'Colour'}</span><div class="ws-swatches" role="group" aria-label="${ko?'색상':'Colour'}">${swatches}<label class="ws-custom-color ui-icon-btn" title="${ko?'직접 고르기':'Pick your own'}"><input type="color" name="color" value="${esc(activeColor||avatarPalette[0])}" aria-label="${ko?'색상 직접 고르기':'Custom colour'}">${icon('palette','ui-icon ui-icon-sm')}</label></div></div>
<div class="ws-pick-row"><span class="ws-pick-label">${ko?'이모지':'Emoji'}</span><div class="ws-emoji-grid" role="group" aria-label="${ko?'이모지':'Emoji'}">${avatarEmoji.map(e=>`<button type="button" class="ws-emoji ui-icon-btn" data-action="ws-pick-emoji" data-emoji="${esc(e)}" aria-pressed="${avatar.kind==='emoji'&&avatar.value===e}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}<input class="ws-emoji-custom ui-input ui-input-sm" name="emoji" maxlength="8" value="${esc(avatar.kind==='emoji'?avatar.value:'')}" placeholder="${ko?'직접':'Own'}" aria-label="${ko?'이모지 직접 입력':'Custom emoji'}" autocomplete="off"></div></div>
<div class="ws-pick-row"><span class="ws-pick-label">${ko?'이미지':'Image'}</span><div class="ws-avatar-row"><button type="button" class="ui-btn ui-btn-secondary" data-action="ws-pick-image">${icon('image-plus','ui-icon ui-icon-sm')}${ko?'이미지 올리기':'Upload image'}</button>${avatar.kind==='image'?`<button type="button" class="ui-btn ui-btn-quiet" data-action="ws-clear-image">${ko?'제거':'Remove'}</button>`:''}</div></div>
<input type="hidden" name="image" value="${esc(avatar.kind==='image'?avatar.value:'')}"></fieldset>
<p class="ui-help">${ko?'작업 공간은 이 기기에만 저장됩니다. 보드는 작업 공간별로 나뉘어 보입니다.':'Workspaces live on this device. Boards are listed per workspace.'}</p>
${editing&&options.canDelete?`<div class="ws-danger"><button type="button" class="ui-btn ui-btn-quiet ws-delete" data-action="ws-delete" data-id="${esc(ws!.id)}">${icon('trash-2','ui-icon ui-icon-sm')}${ko?'이 작업 공간 삭제':'Delete this workspace'}</button><small class="ui-help">${ko?`보드 ${options.projectCount}개는 다른 작업 공간으로 옮겨집니다.`:`Its ${options.projectCount} board(s) move to another workspace.`}</small></div>`:''}
<div class="ui-home-form-foot"><button class="ui-btn ui-btn-primary ui-btn-md" type="submit">${editing?(ko?'변경 사항 저장':'Save changes'):(ko?'작업 공간 만들기':'Create workspace')}</button></div>
</form>`;
}
