import {appLockup} from '../design/logo';
import {esc} from '../html';
import {isApproved} from '../model';
import {visibleEntries,workspaceCounts,type Library,type LibraryFilter,type ProjectEntry} from './library';
import {workspaceSwitcherHtml} from './workspace-ui';
import type {WorkspaceBook} from './workspaces';
import {DEFAULT_WORKSPACE_ID} from './workspaces';
import type {Language} from '../i18n';
import {homeCopy} from './home-copy';
import {icon} from '../design/icon';
import {homeHelpItems} from '../editor/help-menu';
export type HubView='grid'|'list';
const art='/brand/cutouts/';
const star='<svg class="folio-star ui-icon ui-icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z"/></svg>';
type Copy=typeof homeCopy['en'];
function pinButton(e:ProjectEntry,t:Copy){
  return `<button type="button" class="folio-pin ui-icon-btn" data-action="hub-pin" data-id="${esc(e.project.id)}" aria-label="${e.pinned?t.unpin:t.pin} ${esc(e.project.name)}" title="${e.pinned?t.unpin:t.pin}" aria-pressed="${e.pinned}">${star}</button>`;
}
/**
 * Where this project could go: every workspace except the one it is already in.
 *
 * Rendered as plain menu items rather than a submenu — there are at most twenty workspaces and a
 * nested menu inside a `details` is a keyboard trap for no gain. With only one workspace the section
 * says so instead of offering an empty list, because a disabled row that never explains itself is
 * how a person concludes the feature is broken.
 */
function moveItems(e:ProjectEntry,t:Copy,book?:WorkspaceBook){
  if(!book)return '';
  const id=esc(e.project.id);
  const here=e.workspaceId??DEFAULT_WORKSPACE_ID;
  const others=book.workspaces.filter(w=>w.id!==here);
  const body=others.length
    ? others.map(w=>`<button type="button" role="menuitem" class="ui-menu-item" data-action="hub-move" data-id="${id}" data-workspace="${esc(w.id)}">${icon('folder-input','ui-icon ui-icon-sm')}<span>${esc(w.name)}</span></button>`).join('')
    : `<span class="ui-menu-item is-disabled folio-menu-empty">${t.onlyWorkspace}</span>`;
  return `<div class="ui-menu-sep"></div><div class="ui-home-menu-group" role="group" aria-label="${t.moveTo}"><p class="ui-menu-label">${t.moveTo}</p>${body}</div>`;
}
function moreMenu(e:ProjectEntry,t:Copy,book?:WorkspaceBook){
  const id=esc(e.project.id);
  return `<details class="folio-more"><summary class="ui-icon-btn" aria-label="${t.more} · ${esc(e.project.name)}" title="${t.more}">${icon('ellipsis','ui-icon')}</summary><div class="folio-menu ui-menu" role="menu"><button type="button" role="menuitem" class="ui-menu-item" data-action="vault-open" data-id="${id}">${icon('folder-open','ui-icon ui-icon-sm')}<span>${t.files}</span></button><button type="button" role="menuitem" class="ui-menu-item" data-action="hub-rename" data-id="${id}">${icon('pencil','ui-icon ui-icon-sm')}<span>${t.rename}</span></button><button type="button" role="menuitem" class="ui-menu-item" data-action="hub-duplicate" data-id="${id}">${icon('copy','ui-icon ui-icon-sm')}<span>${t.duplicate}</span></button><button type="button" role="menuitem" class="ui-menu-item" data-action="hub-archive" data-id="${id}">${e.archived?icon('archive-restore','ui-icon ui-icon-sm'):icon('archive','ui-icon ui-icon-sm')}<span>${e.archived?t.restore:t.archive}</span></button>${moveItems(e,t,book)}<div class="ui-menu-sep"></div><button type="button" role="menuitem" class="ui-menu-item is-danger" data-action="hub-delete" data-id="${id}">${icon('trash-2','ui-icon ui-icon-sm')}<span>${t.remove}</span></button></div></details>`;
}
function previewStyle(e:ProjectEntry){const s=e.project.system;return `--preview-paper:${s.background};--preview-ink:${s.foreground};--preview-accent:${s.accent};background:${s.background};color:${s.foreground}`;}
function photoOf(e:ProjectEntry){const blocks=e.project.pages[0].blocks;return blocks.find(b=>b.image)?.image||e.project.reference;}
function pagesLabel(e:ProjectEntry,t:Copy,language:Language){return `${e.project.pages.length} ${language==='en'&&e.project.pages.length===1?'page':t.pages}`;}
function status(e:ProjectEntry,t:Copy){return `<span class="ui-dot${isApproved(e.project)?' ui-dot-ok':''}" aria-hidden="true"></span><span>${isApproved(e.project)?t.approved:t.draft}</span><span class="ui-board-card-when">${esc(e.updatedAt.slice(0,10))}</span>`;}
function card(e:ProjectEntry,t:Copy,language:Language,book?:WorkspaceBook){
  const p=e.project,blocks=p.pages[0].blocks,photo=photoOf(e);
  const preview=photo?`<img src="${esc(photo)}" alt="" loading="lazy">`:`<span class="ui-home-type"><small>${esc(p.system.name)}</small><strong>${esc(blocks.find(b=>b.kind==='hero')?.title||p.name)}</strong><span class="ui-home-lines"><i style="background:${p.system.accent}"></i><i style="background:${p.system.foreground}"></i><i style="background:${p.system.foreground}"></i></span></span>`;
  return `<article class="folio-card ui-board-card${e.pinned?' is-pinned':''}" data-project-id="${esc(p.id)}"><a href="#" class="folio-open ui-board-card-thumb" data-action="hub-open" data-id="${esc(p.id)}" aria-label="${t.open} ${esc(p.name)}" style="${previewStyle(e)}">${preview}</a><div class="ui-board-card-actions${e.pinned?' is-pinned':''}">${pinButton(e,t)}${moreMenu(e,t,book)}</div><div class="ui-board-card-head"><h3 class="ui-board-card-name">${esc(p.name)}</h3><span class="ui-board-card-counts">${pagesLabel(e,t,language)} · ${esc(p.system.name)}</span></div><div class="ui-board-card-by">${status(e,t)}</div></article>`;
}
function row(e:ProjectEntry,t:Copy,language:Language,book?:WorkspaceBook){
  const p=e.project,photo=photoOf(e);
  return `<article class="folio-row ui-home-row" data-project-id="${esc(p.id)}" role="listitem"><a href="#" class="folio-open ui-row ui-row-md" data-action="hub-open" data-id="${esc(p.id)}" aria-label="${t.open} ${esc(p.name)}"><span class="ui-row-thumb" style="${previewStyle(e)}">${photo?`<img src="${esc(photo)}" alt="" loading="lazy">`:`<i style="background:${p.system.accent}"></i>`}</span><h3 class="ui-row-name">${esc(p.name)}</h3><span class="ui-home-row-counts">${pagesLabel(e,t,language)} · ${esc(p.system.name)}</span><span class="ui-board-card-by">${status(e,t)}</span></a><span class="ui-home-row-actions">${pinButton(e,t)}${moreMenu(e,t,book)}</span></article>`;
}
export function projectCards(library:Library,filter:LibraryFilter,query:string,language:Language='en',view:HubView='grid',workspaceId?:string,book?:WorkspaceBook){
  const t=homeCopy[language];
  const entries=visibleEntries(library,filter,query,workspaceId);
  if(!entries.length)return `<div class="folio-empty ui-empty">${query?icon('search-x','ui-icon'):filter==='archived'?icon('archive','ui-icon'):filter==='pinned'?icon('star','ui-icon'):icon('layout-grid','ui-icon')}<h3 class="ui-empty-title">${query?t.emptySearch:filter==='archived'?t.emptyArchive:filter==='pinned'?t.emptyPinned:t.emptyRecent}</h3><p class="ui-empty-text">${query?t.searchHint:filter==='recent'?t.startHint:t.organizeHint}</p>${!query&&filter==='recent'?`<div class="ui-empty-actions"><button type="button" class="ui-btn ui-btn-secondary" data-action="import-project">${icon('upload','ui-icon ui-icon-sm')}${t.import}</button><button type="button" class="ui-btn ui-btn-secondary" data-action="new-project">${icon('plus','ui-icon ui-icon-sm')}${t.first}</button></div>`:''}</div>`;
  return entries.map(e=>view==='list'?row(e,t,language,book):card(e,t,language,book)).join('');
}
/** Home's own help menu: the shared list (homeHelpItems), drawn as menu items. */
function helpMenu(language:Language){
  const ko=language==='ko';
  return `<div class="folio-menu ui-menu" role="menu">${homeHelpItems.filter((item,i,all)=>item!=='separator'||(i>0&&i<all.length-1&&all[i+1]!=='separator')).map(item=>item==='separator'?'<div class="ui-menu-sep"></div>':item.href?`<a role="menuitem" class="ui-menu-item" href="${esc(item.href)}" target="_blank" rel="noopener"><span>${esc(ko?item.ko:item.en)}</span>${icon('arrow-up-right','ui-icon ui-icon-sm')}</a>`:`<button type="button" role="menuitem" class="ui-menu-item"${item.action?` data-action="${esc(item.action)}"`:''}><span>${esc(ko?item.ko:item.en)}</span>${item.keys?`<span class="ui-menu-key">${esc(item.keys)}</span>`:''}</button>`).join('')}</div>`;
}
export function workspaceHome(library:Library,filter:LibraryFilter,query:string,error:string,night=false,language:Language='en',view:HubView='grid',saved=true,book?:WorkspaceBook,sidebar:'open'|'collapsed'='open',connected=false,connectWho=''){
  const t=homeCopy[language];
  const ws=book?.activeId;
  const scoped=library.entries.filter(e=>!ws||(e.workspaceId??'personal')===ws);
  const counts={recent:scoped.filter(e=>!e.archived).length,pinned:scoped.filter(e=>!e.archived&&e.pinned).length,archived:scoped.filter(e=>e.archived).length};
  const filterIcons={recent:icon('layout-grid','ui-icon ui-icon-sm'),pinned:icon('star','ui-icon ui-icon-sm'),archived:icon('archive','ui-icon ui-icon-sm')};
  const filters=(['recent','pinned','archived'] as const).map((f,i)=>`<button type="button" class="folio-filter ui-row" data-action="hub-filter" data-filter="${f}" aria-pressed="${filter===f}">${filterIcons[f]}<span class="ui-row-name">${f==='recent'?t.allLabel:t.filters[i]}</span><small class="ui-row-meta">${counts[f]}</small></button>`).join('');
  /* A standing write permission should be readable without hovering, so the switch carries who it is
     open to as words too. main.ts hands the label over already formatted; nothing is read here. */
  const connectTitle=connected?(connectWho?`${t.agentOn} · ${connectWho}`:t.agentOn):t.agentOff;
  const connectNote=connected&&connectWho?`<small class="folio-toggle-left">${connectWho}</small>`:'';
  const languageMenu=`<details class="folio-lang"><summary class="ui-btn ui-btn-quiet" aria-label="${t.language}">${icon('languages','ui-icon ui-icon-sm')}<span>${language==='ko'?'한국어':'English'}</span>${icon('chevron-down','ui-icon ui-icon-xs')}</summary><div class="folio-menu ui-menu" role="menu">${(['en','ko'] as const).map(l=>`<button type="button" class="ui-menu-item" role="menuitemradio" aria-checked="${language===l}" data-action="set-language" data-lang="${l}"><span>${l==='ko'?'한국어':'English'}</span>${language===l?icon('check','ui-icon ui-icon-sm'):''}</button>`).join('')}</div></details>`;
  const switcher=book?workspaceSwitcherHtml(book,workspaceCounts(library),language):`<div class="folio-workspace ui-ws"><span class="ui-avatar ui-avatar-accent" aria-hidden="true">a</span><span class="ui-ws-name">${t.workspace}</span><small class="ui-row-meta">${t.local}</small></div>`;
  const tab=sidebar==='collapsed'?`<button type="button" class="folio-side-tab ui-icon-btn" data-action="home-sidebar" aria-label="${t.showSidebar}" title="${t.showSidebar}">${icon('panel-left','ui-icon')}</button>`:'';
  const side=`<aside class="folio-sidebar ui-side ui-home-side"><div class="ui-home-brand"><a class="folio-wordmark" href="#" data-action="home" aria-label="Aphrodite projects">${appLockup}</a><button type="button" class="folio-side-collapse ui-icon-btn" data-action="home-sidebar" aria-label="${t.hideSidebar}" title="${t.hideSidebar}">${icon('panel-left','ui-icon')}</button></div>${switcher}<nav class="ui-home-nav" aria-label="${t.sections}">${filters}</nav><div class="ui-home-art"><img src="${art}paper-dove.png" alt="" width="112" height="112"></div><div class="ui-side-foot ui-home-foot"><button type="button" class="folio-toggle ui-switch ui-home-agent" data-action="agent-connect-toggle" role="switch" aria-checked="${connected}" aria-label="${t.agentConnect}" title="${connectTitle}"><span class="ui-switch-track" aria-hidden="true"></span><span class="ui-home-agent-text"><b>${t.agentConnect}</b><span class="ui-home-agent-on">${t.agentOn}</span><span class="ui-home-agent-off">${t.agentOff}</span>${connectNote}<i class="folio-switch" hidden></i></span></button><button type="button" class="ui-row ui-home-storage" data-action="storage-info" aria-label="${t.storage}">${icon('folder','ui-icon ui-icon-sm')}<span class="ui-row-name">${t.storage}</span>${saved?'':'<span class="ui-dot ui-dot-warn" aria-hidden="true"></span>'}<small class="ui-row-meta" data-storage-state>${saved?t.storageSaved:t.storageUnsaved}</small></button><div class="ui-home-tools">${languageMenu}<button type="button" class="ui-icon-btn" data-action="hub-theme" aria-pressed="${night}" aria-label="${t.theme}" title="${night?t.paper:t.night}">${icon(night?'sun':'moon','ui-icon')}</button><details class="folio-help"><summary class="ui-icon-btn" aria-label="${t.help}" title="${t.help}">${icon('circle-help','ui-icon')}</summary>${helpMenu(language)}</details></div></div></aside>`;
  const warning=error?`<div class="folio-warning ui-banner ui-banner-danger" role="alert">${icon('circle-alert','ui-icon')}<div class="ui-banner-body"><p class="ui-banner-title">${esc(error)}</p><p class="ui-home-banner-actions"><button type="button" class="ui-btn ui-btn-secondary" data-action="hub-recovery">${t.recovery}</button><button type="button" class="ui-btn ui-btn-secondary" data-action="disk-reload">${t.reload}</button></p></div></div>`:'';
  const heading=`<header class="ui-heading"><h1 class="ui-heading-title" id="folio-project-title">${t.titles[filter==='recent'?0:filter==='pinned'?1:2]}<span> / ${visibleEntries(library,filter,'',ws).length.toString().padStart(2,'0')}</span></h1><label class="folio-search ui-input ui-input-sunken">${icon('search','ui-icon ui-icon-sm')}<input id="project-search" type="search" aria-label="${t.search}" placeholder="${t.placeholder}" value="${esc(query)}"></label><div class="folio-view ui-seg" role="group" aria-label="${t.view}"><button type="button" class="ui-seg-item" data-action="hub-view" data-view="grid" aria-pressed="${view==='grid'}" aria-label="${t.grid}" title="${t.grid}">${icon('layout-grid','ui-icon ui-icon-sm')}</button><button type="button" class="ui-seg-item" data-action="hub-view" data-view="list" aria-pressed="${view==='list'}" aria-label="${t.list}" title="${t.list}">${icon('list','ui-icon ui-icon-sm')}</button></div><button type="button" class="ui-btn ui-btn-secondary" data-action="import-project">${icon('upload','ui-icon ui-icon-sm')}${t.import}</button><button type="button" class="ui-btn ui-btn-primary" data-action="new-project">${icon('plus','ui-icon ui-icon-sm')}${t.new}</button></header>`;
  return `<div class="folio-home ui-root ui-home" data-theme="${night?'dark':'light'}" data-sidebar="${sidebar}">${tab}${side}<main class="folio-main ui-home-main"><section class="ui-home-col" aria-labelledby="folio-project-title">${warning}${heading}<div class="folio-grid ui-home-grid${view==='list'?' folio-grid-list':''}" id="project-grid"${view==='list'?' role="list"':''}>${projectCards(library,filter,query,language,view,ws,book)}</div></section></main></div>`;
}
