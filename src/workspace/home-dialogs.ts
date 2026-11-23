import {esc} from '../html';
import {icon} from '../design/icon';
import type {Language} from '../i18n';
import type {Project} from '../model';

/**
 * The bodies of the dialogs home opens: rename, delete, delete a workspace, where the work lives.
 * main.ts keeps the frame (showModal) and what each answer does; these say what the person sees and
 * reaches inside it, with the parts from src/ui. Ids, field names and data-action are what main.ts and
 * the gates read, so they stay as they were.
 */
const say=(language:Language,en:string,ko:string)=>language==='ko'?ko:en;
const foot=(...buttons:string[])=>`<div class="ui-home-form-foot">${buttons.join('')}</div>`;

export function renameDialogHtml(language:Language,project:Pick<Project,'id'|'name'>){
  return `<form id="hub-rename-form" class="ui-home-form"><input type="hidden" name="projectId" value="${esc(project.id)}"><label class="ui-label">${say(language,'Project name','프로젝트 이름')}<input class="ui-input" name="name" required maxlength="100" value="${esc(project.name)}"></label>${foot(`<button class="ui-btn ui-btn-primary ui-btn-md" type="submit">${say(language,'Rename project','프로젝트 이름 변경')}</button>`)}</form>`;
}

/** Keep it comes first, so the focus a dialog opens with lands on the answer that loses nothing. */
export function deleteDialogHtml(language:Language,project:Pick<Project,'id'>){
  return `<div class="ui-home-form"><p class="ui-home-form-text">${say(language,'It disappears from Home. Files already in the project vault stay on disk; exported files are untouched.','홈에서 사라집니다. 프로젝트 파일 보관함에 있는 파일은 디스크에 남고, 내보낸 파일도 그대로입니다.')}</p>${foot(`<button class="ui-btn ui-btn-secondary ui-btn-md" type="button" data-action="close-modal">${say(language,'Keep it','그대로 두기')}</button>`,`<button class="ui-btn ui-btn-danger ui-btn-md" type="button" data-action="hub-delete-confirm" data-id="${esc(project.id)}">${icon('trash-2','ui-icon ui-icon-sm')}${say(language,'Delete project','프로젝트 삭제')}</button>`)}</div>`;
}

export function workspaceDeleteDialogHtml(language:Language,id:string,count:number){
  return `<div class="ui-home-form"><p class="ui-home-form-text">${count?say(language,`Its ${count} project(s) move to the workspace you land in. Nothing is deleted.`,`프로젝트 ${count}개는 이동한 작업 공간으로 옮겨집니다. 삭제되지 않습니다.`):say(language,'It holds no projects.','프로젝트가 없습니다.')}</p>${foot(`<button class="ui-btn ui-btn-secondary ui-btn-md" type="button" data-action="close-modal">${say(language,'Keep it','그대로 두기')}</button>`,`<button class="ui-btn ui-btn-danger ui-btn-md" type="button" data-action="ws-delete-confirm" data-id="${esc(id)}">${icon('trash-2','ui-icon ui-icon-sm')}${say(language,'Delete workspace','작업 공간 삭제')}</button>`)}</div>`;
}

export function storageDialogHtml(language:Language,path:string){
  const fact=(glyph:string,file:string,what:string)=>`<li>${glyph}<span><b class="ui-mono">${file}</b> · ${what}</span></li>`;
  return `<div class="ui-home-form"><div class="ui-home-path"><code class="ui-mono">${esc(path)}</code><button class="ui-btn ui-btn-secondary" type="button" data-action="copy-storage-path">${icon('copy','ui-icon ui-icon-sm')}${say(language,'Copy path','경로 복사')}</button></div><ul class="ui-home-facts">${fact(icon('hard-drive','ui-icon ui-icon-sm'),'library.json',say(language,'your current projects','현재 프로젝트 보관함'))}${fact(icon('history','ui-icon ui-icon-sm'),'library.previous.json',say(language,'the previous save, kept automatically','직전 저장본 · 자동 보관'))}${fact(icon('folder-open','ui-icon ui-icon-sm'),'project-vault-v1/',say(language,'per-project images and DESIGN.md snapshots (Files on a project card)','프로젝트별 이미지·DESIGN.md 스냅샷 (프로젝트 카드의 파일)'))}</ul><p class="ui-help">${say(language,'If another window changed the files, this one refuses to overwrite them and shows a banner with reload and backup options.','다른 창이 파일을 바꾸면 이 창은 덮어쓰지 않고, 다시 불러오기·백업 옵션이 있는 배너를 표시합니다.')}</p>${foot(`<button class="ui-btn ui-btn-secondary ui-btn-md" type="button" data-action="hub-backup">${icon('download','ui-icon ui-icon-sm')}${say(language,'Save a workspace backup','작업 공간 백업 저장')}</button>`,`<button class="ui-btn ui-btn-secondary ui-btn-md" type="button" data-action="hub-recovery">${icon('download','ui-icon ui-icon-sm')}${say(language,'Save raw recovery files','원본 복구 파일 저장')}</button>`)}</div>`;
}
