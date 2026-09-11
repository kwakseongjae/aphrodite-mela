import {esc} from '../html';
import {icon} from '../design/icon';
import {avatarContent,avatarStyle,MAX_WORKSPACES,WORKSPACE_COLORS,type Workspace,type WorkspaceBook} from './workspaces';
import type {Language} from '../i18n';

export const avatarPalette=WORKSPACE_COLORS;

/** The avatar chip: a colour with initials, an emoji, or an uploaded image. */
export function avatarChipHtml(ws:Workspace,extraClass=''):string{
  return `<span class="ws-avatar ${extraClass}" style="${esc(avatarStyle(ws))}" aria-hidden="true">${avatarContent(ws)}</span>`;
}

/** Sidebar switcher: the active workspace, and a menu of the rest. Figma's workspace picker, local. */
export function workspaceSwitcherHtml(book:WorkspaceBook,counts:Record<string,number>,language:Language):string{
  const ko=language==='ko';
  const active=book.workspaces.find(w=>w.id===book.activeId)??book.workspaces[0];
  const item=(w:Workspace)=>`<button type="button" role="menuitemradio" aria-checked="${w.id===book.activeId}" data-action="ws-switch" data-id="${esc(w.id)}">${avatarChipHtml(w,'ws-avatar-sm')}<span class="ws-menu-name">${esc(w.name)}</span><small>${counts[w.id]??0}</small>${w.id===book.activeId?icon('check'):''}</button>`;
  const full=book.workspaces.length>=MAX_WORKSPACES;
  return `<details class="folio-ws"><summary aria-label="${ko?'작업 공간 전환':'Switch workspace'}">${avatarChipHtml(active)}<span class="ws-summary-text"><strong>${esc(active.name)}</strong><small>${counts[active.id]??0} ${ko?'프로젝트':'projects'}</small></span>${icon('chevrons-up-down')}</summary><div class="folio-menu ws-menu" role="menu"><p class="ws-menu-label">${ko?'작업 공간':'Workspaces'}</p>${book.workspaces.map(item).join('')}<div class="ws-menu-sep"></div><button type="button" role="menuitem" data-action="ws-new"${full?' disabled':''}>${icon('plus')}<span>${ko?'새 작업 공간':'New workspace'}</span></button><button type="button" role="menuitem" data-action="ws-settings">${icon('settings')}<span>${ko?'작업 공간 설정':'Workspace settings'}</span></button></div></details>`;
}

/** The name + avatar form, shared by "New workspace" and "Workspace settings". */
export function workspaceFormHtml(language:Language,ws:Workspace|undefined,options:{canDelete:boolean;projectCount:number}):string{
  const ko=language==='ko';
  const editing=!!ws;
  const avatar=ws?.avatar??{kind:'color' as const,value:avatarPalette[0]};
  const activeColor=avatar.kind==='color'?avatar.value:'';
  const swatches=avatarPalette.map(c=>`<button type="button" class="ws-swatch" data-action="ws-pick-color" data-color="${c}" aria-label="${c}" aria-pressed="${c.toLowerCase()===activeColor.toLowerCase()}" style="background:${c}"></button>`).join('');
  const preview=ws?avatarChipHtml(ws,'ws-avatar-lg'):`<span class="ws-avatar ws-avatar-lg" style="background:${avatarPalette[0]};color:#fff" data-ws-preview></span>`;
  return `<form id="workspace-form" data-id="${esc(ws?.id??'')}">
<div class="ws-form-head">${preview}<label class="form-label ws-name-field">${ko?'이름':'Name'}<input name="name" required maxlength="60" value="${esc(ws?.name??'')}" placeholder="${ko?'예: 개인 작업 공간, 클라이언트 A':'e.g. Personal workspace, Client A'}" autocomplete="off"></label></div>
<fieldset class="ws-avatar-picker"><legend>${ko?'아바타':'Avatar'}</legend>
<div class="ws-swatches" role="group" aria-label="${ko?'색상':'Colour'}">${swatches}</div>
<div class="ws-avatar-row"><label class="ws-emoji-field">${ko?'이모지':'Emoji'}<input name="emoji" maxlength="8" value="${esc(avatar.kind==='emoji'?avatar.value:'')}" placeholder="✳" autocomplete="off"></label><button type="button" class="secondary-button" data-action="ws-pick-image">${icon('image-plus')}${ko?'이미지 올리기':'Upload image'}</button>${avatar.kind==='image'?`<button type="button" class="text-link" data-action="ws-clear-image">${ko?'이미지 제거':'Remove image'}</button>`:''}</div>
<input type="hidden" name="image" value="${esc(avatar.kind==='image'?avatar.value:'')}"></fieldset>
<p class="fine-print">${ko?'작업 공간은 이 기기에만 저장됩니다. 프로젝트는 작업 공간별로 나뉘어 보입니다.':'Workspaces live on this device. Projects are listed per workspace.'}</p>
<button class="primary-button full-width" type="submit">${editing?(ko?'변경 사항 저장':'Save changes'):(ko?'작업 공간 만들기':'Create workspace')}</button>
${editing&&options.canDelete?`<div class="ws-danger"><button type="button" class="text-link ws-delete" data-action="ws-delete" data-id="${esc(ws!.id)}">${icon('trash-2')}${ko?'이 작업 공간 삭제':'Delete this workspace'}</button><small>${ko?`프로젝트 ${options.projectCount}개는 다른 작업 공간으로 옮겨집니다.`:`Its ${options.projectCount} project(s) move to another workspace.`}</small></div>`:''}
</form>`;
}
