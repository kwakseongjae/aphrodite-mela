import { createIcons } from 'lucide'; import { icons } from './icons';
import { assemble, catalog, currentPage, fingerprint, importDesignMarkdown, initialProject, isApproved, makeBlock, parseProject, systems, uid, type BlockKind, type Project } from './model';
import { blockHtml, esc, pageHtml, themeVars, renderTree } from './render';
import {catalogView} from './design/catalog-view';
import {filteredKinds,normalizeCatalogFilter,emptyCatalogFilter} from './design/catalog-filter';
import { providers, supportsProvider } from './providers';
import {implementations,explorerBlock,catalogMime,parseCatalogChoice,catalogGroup,type CatalogChoice} from './design/component-explorer';
import './design/component-explorer.css';
import {pinShelf,preserveShelf,shelfPage} from './design/shelf';
import {supportsComponentTheme,componentAccent,primaryEffect,type ComponentTheme} from './design/component-theme';
import {hydrateNativeLibraries} from './design/native-library';
import {mountNativePreview} from './design/native-preview';
import {themeProposal,applyThemeProposal} from './design/theme-proposal';
import { canParent, validLayout } from './layout';
import {mountPointerEditor} from './editor/pointer-editor';
import {applyEditorCommand} from './editor/commands';
import {mountLayerReorder} from './editor/layer-reorder';
import {rerenderPreservingScroll} from './editor/scroll-continuity';
import {collectionRows} from './design/collection';
import {pointerLabPage} from './editor/pointer-lab';
import {moaPage} from './moa';
import './moa.css';
import { buildPrompt, designMarkdown, exportBundle, fileName, saveFile } from './export';
import './style.css';
import './page.css';
import './reference.css';
import { analyzeReference, composeDirections, directions, suggestCopy, type ReferenceAnalysis } from './reference';
import { componentIdentity } from './components';
import type { Page } from './model';
import { isPattern, patternSpecs, patternVariants, patternStates, type PatternOptions } from './patterns';
import { defaultPlanningText } from './pattern-render';
import { installPatternRuntime } from './pattern-runtime';
import './patterns.css';
import {newRun,appendEvent,changeReceipt,readRun,type AssemblyRun} from './agent/run';
import {assemblyBrief,nodePath} from './agent/context';
import './agent/agent.css';
import {planVibe,applyVibe,type VibePlan} from './design/vibe';
import {bridgeHtml,brandHtml} from './design/studio';
import {vibeLanguageFormHtml as vibeFormHtml,localizedVibePreviewHtml as vibePreviewHtml,emptyPageVibeHtml} from './design/vibe-language-form';
import {readUiLanguage,detectUiLanguage,saveUiLanguage,isLanguage,setContentLanguage,languageSettingsHtml,controlText,type Language} from './i18n';
import {verifyReference,referenceIssue,referenceSources} from './design/bridge';
import './design/studio.css';
import {readLibrary,writeLibrary,upsertProject,cloneProject,LIBRARY_KEY,LEGACY_KEY,type Library,type LibraryFilter} from './workspace/library';
import {workspaceHome,projectCards,type HubView} from './workspace/home';
import {homeCopy} from './workspace/home-copy';
import {bindInspectorCollapse} from './editor/inspector-collapse';
import {dockHtml,dockShortcut,isEditorMode,type EditorMode} from './editor/dock';
import {commandTable,commandPaletteHtml,stateLine} from './editor/command-palette';
import './workspace/home.css';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {brandLockup} from './design/logo';
import {vaultHtml,type Vault} from './workspace/vault';
import './workspace/vault.css';
let vaultProjectId='',vaultState:Vault|undefined,vaultReading:{name:string;text?:string;image?:string}|undefined;
import {DurableQueue} from './workspace/durable';
let diskQueue:DurableQueue|undefined,storagePath='Browser local storage',storageIssue='';
const nativeDesktop=isTauri();
document.documentElement.classList.toggle('native-desktop',nativeDesktop);
function mountPagePreview(frame:HTMLIFrameElement,p:Project,page:Page){const html=pageHtml(p,page);if(nativeDesktop)mountNativePreview(frame,html);else frame.srcdoc=html;}
let uiLanguage:Language='en';try{uiLanguage=readUiLanguage(localStorage,detectUiLanguage(navigator.language));}catch{}
const ui=(en:string,ko:string)=>uiLanguage==='ko'?ko:en;
const control=(label:string)=>controlText(label,uiLanguage);
let vibeImage='',vibePending:{plan:VibePlan;revision:string}|null=null;
let vibeFormDraft:FormData|null=null;

let night=false;try{night=localStorage.getItem('aphrodite-paper-theme')==='night';}catch{}
let startupError = '';
let library:Library={version:1,entries:[]};
let screen:'home'|'editor'='home',hubFilter:LibraryFilter='recent',hubQuery='';let hubView:HubView='grid';try{hubView=localStorage.getItem('aphrodite-hub-view')==='list'?'list':'grid';}catch{}
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
let project: Project = initialProject();
try { library=readLibrary(localStorage);if(library.entries[0])project=parseProject(JSON.stringify(library.entries[0].project)); } catch { startupError = '저장 데이터를 읽지 못해 쓰기를 중지했습니다. 원본 데이터를 내려받아 복구해주세요.'; }
let selected = currentPage(project).blocks.find(b => b.kind === 'hero')?.id ?? '';
let tab: 'components' | 'layers' | 'assets' = 'components';
let device: 'desktop' | 'mobile' = 'desktop';
let query = '';
let undoStack: string[] = [], redoStack: string[] = [];
let lastSaved = true;
let modalReturnFocus: HTMLElement | null = null;
let zoom = 100;
let editorMode:EditorMode='design';let dockTool='select';
let toastTimer = 0;
let referenceAnalysis: ReferenceAnalysis | null = null;
let referenceDraft: { copy: ReturnType<typeof suggestCopy>; useCrop: boolean } | null = null;
let candidatePages: Page[] = [];
let analysisGeneration = 0;
let comparisonObserver: ResizeObserver | null = null;
let disposePointerEditor:(()=>void)|undefined;
let insertParent:string|undefined;
let assemblyRun:AssemblyRun|null=null,runStorageWarning='';
try{const raw=localStorage.getItem('aphrodite-assembly-latest');if(raw){assemblyRun=readRun(raw);if(!assemblyRun)runStorageWarning='기존 실행 기록 형식을 읽지 못했습니다. 원본은 보존됩니다.';}}catch{runStorageWarning='실행 기록 저장소를 읽지 못했습니다.';}
const app = document.querySelector<HTMLDivElement>('#app')!;
const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!;
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const button = (action: string, name: string, label: string, cls = '', rest = '') => `<button class="${cls}" data-action="${action}" ${rest}>${icon(name)}<span>${control(label)}</span></button>`;
const iconButton = (action: string, name: string, label: string, rest = '') => `<button class="icon-button" data-action="${action}" aria-label="${control(label)}" title="${control(label)}" ${rest}>${icon(name)}</button>`;
function hydrateIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.65 } }); hydrateNativeLibraries(document); }
function toast(message: string) { const el = document.querySelector<HTMLDivElement>('#toast')!; el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove('visible'), 4200); }
function saveLibrary(next:Library){if(startupError)throw new Error(startupError);if(diskQueue){diskQueue.enqueue(JSON.stringify(next));}else{writeLibrary(localStorage,next);}library=next;}
function persist() { try { saveLibrary(upsertProject(library,project)); if(!diskQueue)lastSaved=true; } catch { lastSaved = false; toast('로컬 저장 실패. Save project로 파일을 저장해주세요. 현재 화면은 유지됩니다.'); } }
async function flushDisk(){if(diskQueue)await diskQueue.flush();}
async function showVault(refresh=true){
  if(!nativeDesktop){toast('파일 보관함은 데스크탑 앱에서 사용할 수 있습니다.');return;}
  await guardSwitch();const entry=library.entries.find(e=>e.project.id===vaultProjectId);if(!entry)throw new Error('프로젝트를 찾지 못했습니다.');
  if(refresh||!vaultState)vaultState=await invoke<Vault>('vault_sync',{projectId:vaultProjectId,expected:entry.project,design:designMarkdown(entry.project)});
  showModal(`${esc(entry.project.name)} · ${ui('Files','파일')}`,'프로젝트별 스냅샷 · 이미지 · 디자인 문서',vaultHtml(vaultState),true);
}
async function guardSwitch(){await flushDisk();if(screen==='editor'&&!lastSaved){persist();await flushDisk();if(!lastSaved)throw new Error('저장하지 못한 작업이 있습니다. 먼저 Save project로 내보내주세요.');}}
function openProject(next:Project){project=parseProject(JSON.stringify(next));selected='';undoStack=[];redoStack=[];referenceAnalysis=null;referenceDraft=null;candidatePages=[];analysisGeneration++;vibePending=null;vibeImage='';vibeFormDraft=null;insertParent=undefined;lastSaved=true;screen='editor';closeModal();render();}
function commit(change: () => void, updateUI = true,source='editor:change') {
  const before = JSON.stringify(project),pageBefore=project.activePageId;
  change();
  if (JSON.stringify(project) !== before) { undoStack.push(before); if (undoStack.length > 35) undoStack.shift(); redoStack = []; persist();recordRun(source,{...changeReceipt(JSON.parse(before),project),projectSaved:lastSaved,persistence:lastSaved?'acknowledged':storageIssue?'failed':nativeDesktop?'queued':'failed'}); }
  if (updateUI) {if(pageBefore===project.activePageId)rerenderPreservingScroll(app,render);else render();}
}
function history(direction: 'undo' | 'redo') {
  const from = direction === 'undo' ? undoStack : redoStack, to = direction === 'undo' ? redoStack : undoStack;
  const snapshot = from.pop(); if (!snapshot) return;
  const before=project;to.push(JSON.stringify(project)); project = preserveShelf(parseProject(snapshot),before); persist();recordRun(direction,{...changeReceipt(before,project),projectSaved:lastSaved});if(before.activePageId===project.activePageId)rerenderPreservingScroll(app,render);else render();
}
function storeRun(){if(!assemblyRun)return;try{const data=JSON.stringify(assemblyRun);localStorage.setItem(`aphrodite-assembly-run:${assemblyRun.id}`,data);localStorage.setItem('aphrodite-assembly-latest',data);runStorageWarning='';}catch{runStorageWarning='실행 기록 저장 실패 · 새로고침 전에 Download run log를 사용하세요.';}}
function recordRun(kind:string,details:Record<string,unknown>={}){if(!assemblyRun||assemblyRun.status==='ended'||assemblyRun.projectId!==project.id)return;appendEvent(assemblyRun,project,kind,details);storeRun();refreshAssemblyBar();}
function insertionTarget(){return currentPage(project).blocks.find(b=>b.id===insertParent&&b.kind==='frame')?.id;}
let assemblyExpanded=false;try{assemblyExpanded=localStorage.getItem('aphrodite-assembly-expanded')==='true';}catch{}
function assemblyBar(){const page=currentPage(project),last=assemblyRun?.events.at(-1),foreign=assemblyRun&&assemblyRun.projectId!==project.id;
  if((!assemblyRun||foreign)&&!assemblyExpanded)return `<div class="assembly-bar-header assembly-collapsed"><strong>${ui('AGENT ASSEMBLY','에이전트 조립')} · ${ui('Ready','준비됨')}</strong><span class="assembly-hint">${ui('For an external agent (Codex/Astra) driving this screen. You can ignore it while designing by hand.','외부 에이전트(Codex/Astra)가 이 화면을 조작할 때 씁니다. 직접 디자인할 땐 무시해도 됩니다.')}</span><button data-action="assembly-toggle" aria-expanded="false">${ui('Show','펼치기')}</button></div>`;
  return `<div class="assembly-bar-header"><strong>${ui('AGENT ASSEMBLY','에이전트 조립')} · ${assemblyRun?esc(foreign?'다른 프로젝트 · 기록 중지':assemblyRun.status):ui('Ready','준비됨')}</strong><div><button data-action="agent" title="${ui('Assembly brief, run receipts and the computer-use playbook for an external agent','외부 에이전트를 위한 조립 브리프·실행 기록·컴퓨터 유즈 플레이북')}">${ui('Assembly console','조립 콘솔')}</button> <button data-action="pin-frame" ${page.blocks.find(b=>b.id===selected)?.kind==='frame'?'':'disabled'} title="${ui('Keep inserting new components inside the selected Layout frame (select a frame first)','새 컴포넌트를 선택한 레이아웃 프레임 안에 계속 넣습니다 (먼저 프레임을 선택)')}">${ui('Pin selected frame','선택한 프레임에 고정')}</button> <button data-action="insert-root" title="${ui('Insert new components at the top level of the page again','새 컴포넌트를 다시 페이지 최상위에 넣습니다')}">${ui('Insert at page root','페이지 최상위에 삽입')}</button>${assemblyRun&&!foreign?'':` <button data-action="assembly-toggle" aria-expanded="true">${ui('Hide','접기')}</button>`}</div></div><div class="assembly-context"><span><strong>${ui('Selected','선택')}</strong> ${esc(nodePath(page.blocks,selected))}</span><span><strong>${ui('Insert into','삽입 위치')}</strong> ${esc(nodePath(page.blocks,insertionTarget()))}</span></div><p class="assembly-receipt ${runStorageWarning?'warning':''}" role="status">${runStorageWarning?esc(runStorageWarning):last?`${ui('Receipt','영수증')} #${last.seq} · ${esc(last.kind)} · ${esc(last.revision)}${assemblyRun!.dropped?` · ${assemblyRun!.dropped} ${ui('events omitted','이벤트 생략')}`:''}`:'Codex가 조립하고, 사람은 방향을 검토합니다. 실행 기록은 Console에서 시작하세요.'}</p>`;}
function refreshAssemblyBar(){const bar=app.querySelector('.assembly-bar');if(bar)bar.innerHTML=assemblyBar();}
function agentModal(){const active=assemblyRun&&assemblyRun.status!=='ended';showModal(ui('Agent assembly console','에이전트 조립 콘솔'),'외부 Codex/Astra가 레고를 조립하고, 사용자는 검토·승인합니다.',`<p class="panel-description">${esc(nodePath(currentPage(project).blocks,selected))}<br>삽입 대상: ${esc(nodePath(currentPage(project).blocks,insertionTarget()))}</p>${!active?`<form id="assembly-run-form"><label class="form-label">조립 목표<textarea name="intent" maxlength="1200" required placeholder="레퍼런스의 영역, 반복 카드, 필요한 상태를 설명하세요"></textarea></label><label class="form-label">모델 / 설정 (사용자 기입)<input name="model" maxlength="100" placeholder="실제 사용 모델과 설정 · 앱이 자동 확인하지 않습니다"></label><p class="fine-print">이미지·화면·문구 본문은 자동 수집하지 않습니다. 목표와 편집 명령 메타데이터를 로컬에 보관합니다. 이전 기록은 실행 ID별로 유지됩니다.</p><button class="primary-button" type="submit">${ui('Start assembly run','조립 실행 시작')}</button></form>`:`<p>${ui('Run','실행')} ${esc(assemblyRun!.id)} · ${esc(assemblyRun!.status)} · ${assemblyRun!.events.length} ${ui('receipts','기록')}</p><p>${esc(assemblyRun!.intent)}</p>`}<div class="assembly-actions">${button('assembly-empty','plus','New assembly page','secondary-button')}${button('assembly-brief','download','Download assembly brief','secondary-button')}${active?button('assembly-review','eye','Request human review','secondary-button')+button('assembly-end','square','End run','secondary-button'):''}${assemblyRun?button('assembly-log','download','Download run log','secondary-button'):''}</div><div class="modal-note">Request review는 승인하지 않습니다. Preview 변경은 세션 한정입니다. 기록은 편집 명령과 체크포인트이며, Codex 도구 호출·녹화·토큰 사용량이 아닙니다.</div><details><summary>조립 플레이북 · 현재 컨텍스트</summary><pre class="assembly-brief">${esc(assemblyBrief(project,selected,insertionTarget()))}</pre></details><div class="assembly-ledger">${assemblyRun?.events.slice(-6).map(e=>`<p>#${e.seq} ${esc(e.kind)} · ${esc(e.at)}</p>`).join('')??''}</div>`,true);}
function cloneBlocks(blocks:Page['blocks']):Page['blocks'] {
 const ids=new Map(blocks.map(b=>[b.id,uid()]));
 return blocks.map(b=>({...structuredClone(b),id:ids.get(b.id)!,parentId:b.parentId?ids.get(b.parentId):undefined}));
}
/** Machine-readable state for external agents (DOM readers): mirrors what the screen shows. */
function syncStateAttributes(){
  const page=screen==='editor'?currentPage(project):undefined;
  const block=page?.blocks.find(b=>b.id===selected);
  const state:Record<string,string>={
    screen,language:uiLanguage,saved:String(lastSaved),storage:nativeDesktop?'disk':'browser',
    project:screen==='editor'?project.name:'',page:page?.name??'',pageCount:String(project.pages.length),
    blockCount:String(page?.blocks.length??0),selectedId:block?.id??'',selectedKind:block?.kind??'',selectedProvider:block?.provider??(block?'own':''),
    system:screen==='editor'?project.system.name:'',accent:screen==='editor'?project.system.accent:'',
    approval:screen==='editor'?(isApproved(project)?'approved':'draft'):'',
    viewport:document.querySelector('[data-action="mobile"][aria-pressed="true"]')?'mobile':'desktop',
    modal:modalRoot.querySelector('#modal-title')?.textContent?.trim()??'',
    undo:String(undoStack.length),redo:String(redoStack.length),mode:editorMode,
  };
  for(const [k,v] of Object.entries(state))app.setAttribute(`data-${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}`,v);
}
function paletteContext(){const page=currentPage(project);return {hasSelection:!!page.blocks.find(b=>b.id===selected),canUndo:undoStack.length>0,canRedo:redoStack.length>0,approved:isApproved(project),viewport:(device==='mobile'?'mobile':'desktop') as 'mobile'|'desktop'};}
function commandsModal(query=''){
  if(screen!=='editor')return;
  showModal(ui('Commands','명령'),ui('Everything you can do on this page, in one list. Type to filter.','이 화면에서 할 수 있는 모든 일. 입력해서 걸러내세요.'),commandPaletteHtml(commandTable(paletteContext()),query,uiLanguage));
  const input=modalRoot.querySelector<HTMLInputElement>('#command-search');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);
}
function renderPaletteList(query:string){const list=modalRoot.querySelector('#command-list');if(!list)return;const html=commandPaletteHtml(commandTable(paletteContext()),query,uiLanguage);const next=new DOMParser().parseFromString(html,'text/html').querySelector('#command-list');if(next)list.replaceWith(next);}
let agentDelegatedAt='';
function agentModeModal(){
  showModal(ui('Hand the screen to an agent','에이전트에게 화면 맡기기'),ui('The agent drives the same UI. Approval and page deletion stay locked; you can take control back any time.','에이전트가 같은 UI를 조작합니다. 승인과 페이지 삭제는 잠기고, 언제든 제어를 되찾을 수 있습니다.'),`<form id="agent-mode-form"><label class="form-label">${ui('Operator (model / tool)','조작 주체 (모델 / 도구)')}<input name="operator" maxlength="100" required placeholder="${ui('e.g. Codex computer use, Astra','예: Codex 컴퓨터 유즈, Astra')}"></label><label class="form-label">${ui('What should it do?','무엇을 시킬까요?')}<textarea name="intent" rows="3" maxlength="1200" required placeholder="${ui('Describe the target screen, the reference and the constraints','목표 화면·레퍼런스·제약을 적어주세요')}"></textarea></label><p class="fine-print">${ui('Starts an assembly run so every edit is receipted. Nothing leaves this Mac.','조립 실행을 시작해 모든 편집이 영수증으로 남습니다. 어떤 것도 이 Mac을 떠나지 않습니다.')}</p><button class="primary-button full-width" type="submit">${icon('bot')}${ui('Start Agent mode','에이전트 모드 시작')}</button></form>`);
}
function startAgentMode(operator:string,intent:string){
  editorMode='agent';agentDelegatedAt=new Date().toISOString();
  if(!assemblyRun||assemblyRun.status==='ended'||assemblyRun.projectId!==project.id){assemblyRun=newRun(project,intent,operator,innerWidth,innerHeight);recordRun('run:started',{zoom,device,selectedId:selected,insertParentId:insertionTarget()??null,referencePresent:!!project.reference,delegated:true});}
  closeModal();render();toast(ui('Agent mode · you can take control back from the banner','에이전트 모드 · 배너에서 언제든 제어를 되찾을 수 있습니다'));
}
function endAgentMode(outcome:'returned'|'ended'){
  if(editorMode!=='agent')return;
  recordRun('delegation:'+outcome,{startedAt:agentDelegatedAt,endedAt:new Date().toISOString()});
  agentDelegatedAt='';
}
function agentBannerHtml(){
  if(editorMode!=='agent')return '';
  return `<div class="agent-banner" role="status">${icon('bot')}<strong>${ui('Agent mode','에이전트 모드')}</strong><span>${esc(assemblyRun?.intent??'')}</span><span class="agent-banner-meta">${ui('Approval and page deletion are locked','승인·페이지 삭제 잠김')} · ${ui('receipts','영수증')} <b data-delegation-receipts>${assemblyRun?.events.length??0}</b></span><button data-action="delegation-return">${icon('hand')}${ui('Take control back','제어 회수')}</button></div>`;
}
function render() {
  disposePointerEditor?.();
  document.documentElement.lang=uiLanguage;
  if(screen==='home'){app.innerHTML=workspaceHome(library,hubFilter,hubQuery,startupError||storageIssue,night,uiLanguage,hubView,lastSaved);hydrateIcons();syncStateAttributes();return;}
  const page = currentPage(project), approved = isApproved(project);
  if(!insertionTarget())insertParent=undefined;
  app.innerHTML = `${storageIssue?diskWarningHtml():''}${agentBannerHtml()}
  <header class="topbar">
    <a class="wordmark" href="#" data-action="home" aria-label="All projects" title="${ui('All projects','전체 프로젝트')}">${brandLockup}</a>
    <div class="project-breadcrumb"><span>${ui("Workspace","작업 공간")}</span>${icon('chevron-right')}<button data-action="project">${esc(project.name)}${icon('chevron-down')}</button><span class="save-indicator"><span class="status-dot ${lastSaved ? '' : 'warning'}"></span>${control(lastSaved ? (nativeDesktop?'Saved to disk':'Saved locally') : 'Unsaved')}</span></div>
    <div class="top-actions">${iconButton('commands','circle-help',ui('Commands & shortcuts (⌘K or ?)','명령·단축키 (⌘K 또는 ?)'))}${iconButton('language-settings','languages','Language / 언어')}${iconButton('undo', 'undo-2', 'Undo', undoStack.length ? '' : 'disabled')}${iconButton('redo', 'redo-2', 'Redo', redoStack.length ? '' : 'disabled')}<span class="divider"></span>${button('preview', 'play', 'Preview', 'plain-button')}${button('export', 'arrow-up-right', 'Export', 'primary-button')}</div>
  </header>
  <div class="studio">
    <aside class="library" aria-label="Component library">
      <div class="workspace-title"><span class="workspace-icon">F</span><div><strong>${esc(project.name)}</strong><small>${ui("Design workspace","디자인 작업 공간")}</small></div>${iconButton('project', 'chevrons-up-down', 'Manage project')}</div>
      <div class="section-label">${ui("PAGES","페이지")} <button class="tiny-button" data-action="add-page" aria-label="${ui("Add page","페이지 추가")}">${icon('plus')}</button></div>
      <div class="pages-list">${project.pages.map(p => `<div class="page-row ${p.id === page.id ? 'active' : ''}"><button data-action="page" data-id="${esc(p.id)}">${icon('file')}<span>${esc(p.name)}</span>${p.id === page.id ? `<small>${ui('Editing','편집 중')}</small>` : ''}</button>${p.id === page.id ? iconButton('page-menu', 'ellipsis', 'Page options') : ''}</div>`).join('')}</div>
      <div class="library-tabs" role="tablist" aria-label="Library view">${(['components', 'layers', 'assets'] as const).map(t => `<button role="tab" aria-selected="${t === tab}" class="${t === tab ? 'active' : ''}" data-action="tab" data-tab="${t}">${control(t[0].toUpperCase() + t.slice(1))}</button>`).join('')}</div>
      <div class="library-content">${libraryHtml()}</div>
      <button class="system-card" data-action="systems"><span class="system-mini" style="--swatch:${project.system.accent}">${icon('palette')}</span><div><small>${ui('DESIGN SYSTEM','디자인 시스템')}</small><strong>${esc(project.system.name)} ${icon('chevron-down')}</strong><span>${ui('Powered by your design contract','디자인 계약을 따릅니다')}</span></div></button>
      <div class="library-bottom"><span class="agent-orb">${icon('sparkles')}</span><div><strong>${ui('Made for you. And your agent.','당신과 에이전트를 위해.')}</strong><span>${ui('Same canvas. Shared direction.','같은 캔버스. 공유된 방향.')}</span></div>${iconButton('agent', 'arrow-up-right', 'Computer use guide')}</div>
    </aside>
    <main class="workbench">
      <div class="canvas-toolbar"><div class="canvas-location">${icon('layout-template')}<strong>${esc(page.name)}</strong><span class="draft-badge ${approved ? 'approved' : ''}">${control(approved ? 'Approved' : 'Draft')}</span></div><div class="viewport-controls">${iconButton('desktop', 'monitor', 'Desktop viewport', `aria-pressed="${device === 'desktop'}"`)}${iconButton('mobile', 'smartphone', 'Mobile viewport', `aria-pressed="${device === 'mobile'}"`)}<span class="divider"></span><button class="zoom-control" data-action="zoom" title="${ui('Cycle canvas zoom','캔버스 확대/축소 순환')}">${zoom}%${icon('chevron-down')}</button></div><div class="canvas-actions"></div></div>
      <div class="canvas-scroll" id="canvas-scroll"><div class="canvas-frame ${device}" style="--zoom:${zoom / 100}"><div class="frame-label"><span>${icon(device === 'desktop' ? 'monitor' : 'smartphone')}${esc(page.name)} / ${device === 'desktop' ? ui('Desktop','데스크톱') : ui('Mobile','모바일')}</span><span>${device === 'desktop' ? ui('Fluid','유동') : '375'} × Auto</span></div><div class="design-page" id="design-canvas" style="${esc(themeVars(project))}">${page.blocks.map((b, index) => `<div class="block-wrap ${selected === b.id ? 'selected' : ''}" data-block-id="${esc(b.id)}" data-kind="${b.kind}" tabindex="0" role="group" aria-label="${catalog.find(c => c.kind === b.kind)!.name} block ${index + 1}"><div class="block-selection-label">${icon('grip-vertical')}${catalog.find(c => c.kind === b.kind)!.name}<span>${index + 1}</span></div>${blockHtml(b)}</div>`).join('')}<button class="canvas-add" data-action="add-section">${icon('plus')}<span>${page.blocks.length ? ui('Add a section','섹션 추가') : ui('Start with a component from the library','라이브러리에서 컴포넌트를 추가하세요')}</span></button></div></div></div>
      <div class="canvas-bottom"><span>${icon('mouse-pointer-2')} ${ui('Click to edit · Drag to compose','클릭해 편집 · 드래그해 배치')}</span><span>${page.blocks.length} ${ui('components','컴포넌트')} <span>·</span> ${project.system.name === 'Atelier' ? ui('Original','기본') : ui('Project','프로젝트')} ${ui('tokens','토큰')}</span></div>
      ${dockHtml({mode:editorMode,language:uiLanguage,activeTool:dockTool,delegated:editorMode==='agent'})}
    </main>
    <aside class="inspector" aria-label="Design inspector">${inspectorHtml()}</aside>
  </div><footer class="statusbar"><span id="editor-state" role="status" aria-live="polite"><span class="status-dot"></span>${stateLine({page:page.name,blocks:page.blocks.length,selectedKind:page.blocks.find(b=>b.id===selected)?.kind,selectedName:page.blocks.find(b=>b.id===selected)?catalog.find(c=>c.kind===page.blocks.find(b=>b.id===selected)!.kind)?.name:undefined,system:project.system.name,approved,viewport:device==='mobile'?'mobile':'desktop',saved:lastSaved,language:uiLanguage})}</span><span>${ui('Built with intention','의도 있게')} <span class="footer-flower">✳</span> Aphrodite 0.1.1</span></footer>`;
  const canvas=app.querySelector('#design-canvas')!;
  app.querySelector('.workflow')?.insertAdjacentHTML('afterend',`<section class="assembly-bar" aria-label="Agent assembly context">${assemblyBar()}</section>`);
  if(device==='desktop'&&page.blocks.some(b=>b.variant==='app-shell')){
    (canvas as HTMLElement).style.width='1440px';(canvas as HTMLElement).style.zoom=String(zoom/100);canvas.classList.add('moa-desktop');
    const frame=app.querySelector<HTMLElement>('.canvas-frame')!;frame.style.width=`${1440*zoom/100}px`;frame.style.maxWidth='none';
    app.querySelector('.frame-label span:last-child')!.textContent='1440 × Auto';
  }
  const add=canvas.querySelector('.canvas-add')!.outerHTML;
  canvas.innerHTML=renderTree(page.blocks,project,undefined,(b,content)=>`<div class="block-wrap ${selected===b.id?'selected':''}" data-block-id="${esc(b.id)}" data-kind="${b.kind}" tabindex="0" role="group" aria-label="${esc(b.title)} ${b.kind} block"><div class="block-selection-label" data-move-id="${b.id}">${icon('grip-vertical')}${esc(b.kind)} · ${b.provider??'own'}</div>${b.kind==='frame'?`<span class="editor-frame-name">${esc(b.title)}</span>`:''}${content}</div>`)+add;
  const inspected = page.blocks.find(b => b.id === selected);
  if (inspected) {
    const identity = componentIdentity(inspected);
    app.querySelector('.selected-component-label')?.insertAdjacentHTML('afterend', `<code class="component-contract-id">${identity.componentId} · v${identity.componentVersion}</code>${inspected.kind === 'hero' ? `<label class="edit-field">${ui('Composition','구성')}<select id="hero-variant" aria-label="Hero composition">${patternVariants("hero").map(v => `<option value="${v}" ${identity.variant===v?"selected":""}>${directions.find(d=>d.variant===v)?.name??ui('Editorial wide · 36:64','에디토리얼 와이드 · 36:64')}</option>`).join("")}</select></label>` : ''}`);
    const select = (key: string, label: string, values: readonly string[], value: string) => `<label class="edit-field">${label}<select data-kit-option="${key}" aria-label="${label}">${values.map(v=>`<option value="${v}" ${v===value?'selected':''}>${v}</option>`).join('')}</select></label>`;
    const options = inspected.options ?? {};
    const extra = isPattern(inspected.kind) ? `<p class="panel-description">${esc(patternSpecs[inspected.kind].help)}</p>${select('variant',ui('Component variation','컴포넌트 변형'),patternVariants(inspected.kind),identity.variant)}${select('state',ui('Component state','컴포넌트 상태'),patternStates(inspected.kind),options.state ?? 'default')}${select('density',ui('Component density','컴포넌트 밀도'),['comfortable','compact'],options.density ?? 'comfortable')}${['cards','stats'].includes(inspected.kind)?select('columns',ui('Grid columns','그리드 열'),['1','2','3','4'],String(options.columns ?? 3)):''}` : inspected.kind==='hero' ? `<label class="edit-field">${ui('Eyebrow','아이브로')}<input data-field="eyebrow" aria-label="Hero eyebrow" value="${esc(inspected.eyebrow ?? '')}" placeholder="설정하면 기본 영문 장식 문구가 제거됩니다"></label>${select('media',ui('Hero media','히어로 미디어'),['image','calendar'],options.media ?? 'image')}<label class="edit-field">${ui('Media label','미디어 라벨')}<input data-kit-option="placeholder" aria-label="Hero media label" value="${esc(options.placeholder ?? '')}"></label>${options.media==='calendar'?`<label class="edit-field">${ui('Planning items','일정 항목')}<textarea data-kit-option="mediaText" aria-label="Hero planning items" rows="6">${esc(options.mediaText ?? defaultPlanningText)}</textarea></label><p class="panel-description">요일|업무|상태 — 이미지가 아닌 편집 가능한 HTML 일정입니다.</p>`:''}` : '';
    app.querySelector('.component-contract-id')?.insertAdjacentHTML('afterend',extra);
    if(inspected.kind==='products')app.querySelector('.component-contract-id')?.insertAdjacentHTML('afterend',select('variant',ui('Collection layout','컬렉션 배치'),patternVariants('products'),identity.variant)+`<label class="edit-field">${ui('Collection introduction','컬렉션 소개')}<textarea data-field="description" aria-label="Collection introduction" maxlength="2000">${esc(inspected.description??'')}</textarea></label><p class="panel-description">${ui('Images follow row position. Changing row order does not reorder image slots automatically. Demo lamp reuses the same fictional photo as Hero.','이미지는 행 위치에 연결됩니다. 텍스트 행의 순서를 바꾸면 이미지도 확인하세요. 데모 조명은 Hero와 같은 가상 제품 사진입니다.')}</p>${collectionRows(inspected).slice(0,30).map(row=>`<div class="collection-image-slot"><strong>${row.index+1}. ${esc(row.title)}</strong>${row.image?`<img src="${esc(row.image)}" alt="${esc(row.title)}">`:`<small>${ui('Image missing','이미지 미확보')}</small>`}<button class="plain-button" data-action="collection-image" data-index="${row.index}">${ui('Choose image','이미지 선택')} ${row.index+1}</button><button class="plain-button" data-action="collection-image-demo" data-index="${row.index}">${ui('Use demo lamp','데모 조명 사용')} ${row.index+1}</button><button class="plain-button" data-action="collection-image-clear" data-index="${row.index}">${ui('Clear slot','슬롯 비우기')} ${row.index+1}</button></div>`).join('')}`);
    const b=inspected;
    const candidates=Object.entries(providers).filter(([key])=>supportsProvider(key,b.kind));
    const library=`<label class="edit-field">${ui('Implementation','구현')}<select id="component-provider" aria-label="Component implementation">${candidates.map(([key,v])=>`<option value="${key}" ${(b.provider??'own')===key?'selected':''}>${v.name}</option>`).join('')}</select></label><p class="panel-description">${esc(providers[b.provider??'own'].source)}<br>공식 연결: MUI 버튼·입력·카드 / Astryx·SEED·shadcn 버튼. HIG는 가이드 참조이며 라이브러리가 아닙니다. Astryx·SEED는 기본 테마를 보존합니다.</p>`;
    const numeric=(key:string,label:string,value:number,min:number,max:number)=>`<label class="edit-field">${label}<input type="number" data-layout="${key}" aria-label="${label}" min="${min}" max="${max}" value="${value}"></label>`;
    const l=b.layout??{};
    const layout=`<h3>${ui('Layout & nesting','레이아웃·중첩')}</h3><label class="edit-field">${ui('Parent frame','상위 프레임')}<select id="parent-frame" aria-label="Parent frame"><option value="">${ui('Page root','페이지 최상위')}</option>${page.blocks.filter(x=>x.kind==='frame'&&canParent(page.blocks,b.id,x.id)).map(x=>`<option value="${x.id}" ${b.parentId===x.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></label>${numeric('width',ui('Width percent','너비 비율'),l.width??100,10,100)}${numeric('widthPx',ui('Fixed width px','고정 너비 px'),l.widthPx??320,64,2000)}${numeric('height',ui('Height px','높이 px'),l.height??240,100,2000)}${b.kind==='frame'?`${select('layout-mode',ui('Frame layout','프레임 레이아웃'),['flow','free'],l.mode??'flow')}${numeric('columns',ui('Frame columns','프레임 열'),l.columns??1,1,4)}${numeric('gap',ui('Frame gap','프레임 간격'),l.gap??16,0,96)}${numeric('padding',ui('Frame padding','프레임 여백'),l.padding??24,0,96)}`:b.parentId?`${numeric('x',ui('Position X','위치 X'),l.x??0,0,1500)}${numeric('y',ui('Position Y','위치 Y'),l.y??0,0,1500)}`:''}<p class="panel-description">프레임으로 중첩하거나 레이어 핸들을 끌어 순서를 변경하세요. 자유 배치는 X/Y로 조정합니다. 좁은 화면에서는 읽기 순서로 쌓입니다.</p>`;
    app.querySelector('.component-contract-id')?.insertAdjacentHTML('afterend',library+layout);
    if(b.kind==='frame')app.querySelector('.component-contract-id')?.insertAdjacentHTML('afterend',select('variant',ui('Frame recipe','프레임 레시피'),patternVariants('frame'),b.variant??'default')+'<p class="panel-description">app-* 레시피는 열·간격 규칙을 고정합니다. 일반 레이아웃 편집은 default로 전환하세요.</p>');
  }
  if(page.blocks.some(b=>b.variant==='app-shell'))app.querySelector('.viewport-controls')?.insertAdjacentHTML('beforeend',`<button class="plain-button" data-action="fit-app">${ui('Fit app','앱에 맞추기')}</button>`);
  if(inspected&&supportsComponentTheme(inspected)){
   const mode=inspected.theme?.mode??'project';
   const effect=primaryEffect(inspected);
   app.querySelector('#component-provider')?.closest('label')?.insertAdjacentHTML('afterend',`<p class="panel-description" role="status">${ui('Primary affects: ','메인 색상 적용 영역: ')}${ui(effect,({'fill':'채움 배경','text-border':'글자·테두리 (ghost는 글자)','border':'테두리만','neutral':'중립형 — 현재 변형의 기본 글자·배경에는 미적용'} as Record<string,string>)[effect])}</p>${mode==='custom'?`<label class="edit-field">${ui('HEX','HEX')}<input id="component-theme-hex" aria-label="Component primary hex" value="${componentAccent(inspected,project.system.accent)}" maxlength="7" pattern="#[a-fA-F0-9]{6}"></label>`:''}`);
   app.querySelector('#component-provider')?.closest('label')?.insertAdjacentHTML('afterend',`<label class="edit-field">${ui('Component primary color','컴포넌트 메인 색상')}<select id="component-theme-mode" aria-label="Component color policy"><option value="project" ${mode==='project'?'selected':''}>${ui('Follow project','프로젝트 색상 적용')}</option><option value="source" ${mode==='source'?'selected':''}>${ui('Adapter baseline','어댑터 기본색')}</option><option value="custom" ${mode==='custom'?'selected':''}>${ui('Custom color','개별 색상 지정')}</option></select></label>${mode==='custom'?`<label class="edit-field">${ui('Custom primary','개별 메인 색상')}<input type="color" id="component-theme-accent" aria-label="Component custom primary" value="${componentAccent(inspected,project.system.accent)}"></label>`:''}<p class="panel-description">${ui('Primary only. Fonts and surfaces still follow existing adapters. Baseline is not a full original DS.','메인 색상만 변경합니다. 폰트·표면색은 기존 어댑터를 따릅니다. 기본색은 원본 DS 전체 복원이 아닙니다.')}<br>${componentAccent(inspected,project.system.accent)}</p>`);
  }
  hydrateIcons(); bindDragAndDrop(); bindInspectorCollapse(app,localStorage,{show:ui('Show panel','패널 펼치기'),hide:ui('Hide panel','패널 접기')}); syncStateAttributes();
  const layers=app.querySelector<HTMLElement>('.layer-list');if(layers)mountLayerReorder(layers,page.blocks,command=>{let changed=false;commit(()=>{changed=applyEditorCommand(currentPage(project).blocks,command);if(changed)selected=command.id;},true,'layer:move');app.querySelector<HTMLElement>(`[data-layer-id="${selected}"]`)?.focus();return changed;},toast,uiLanguage==='ko');
  disposePointerEditor=mountPointerEditor({canvas:canvas as HTMLElement,blocks:page.blocks,selected,select:id=>{if(selected!==id){selected=id;render();}},commit:command=>{let changed=false;commit(()=>{changed=applyEditorCommand(currentPage(project).blocks,command);},true,`pointer:${command.type}`);return changed;},announce:toast,report:event=>recordRun(`pointer:${event.outcome}`,{gesture:event.gesture})});
}
function libraryHtml() {
  if (tab === 'layers') return `<div class="panel-description">화면 순서대로 쌓이는 구성 요소입니다.</div><div class="layer-list">${currentPage(project).blocks.map(b => `<button class="layer ${b.id === selected ? 'selected' : ''}" data-action="select" data-id="${b.id}" data-layer-id="${b.id}" title="${ui('Drag grip to reorder · Alt + arrows','핸들을 드래그해 순서 변경 · Alt + 방향키')}"><span data-layer-grip aria-hidden="true">${icon('grip-vertical')}</span>${icon(catalog.find(c => c.kind === b.kind)!.icon)}<span>${catalog.find(c => c.kind === b.kind)!.name}</span></button>`).join('') || `<p class="empty-state">${ui('Add your first component.','첫 컴포넌트를 추가하세요.')}</p>`}</div>`;
  if (tab === 'assets') return `<div class="section-label">${ui('REFERENCE & IMAGERY','레퍼런스·이미지')}</div><button class="reference-upload" data-action="reference">${project.reference ? `<img src="${project.reference}" alt="${ui('Uploaded reference','올린 레퍼런스')}">` : icon('image-plus')}<strong>${project.reference ? ui('View your reference','레퍼런스 보기') : ui('Bring your inspiration','영감을 가져와 보세요')}</strong><span>${ui('PNG, JPG, WebP · up to 2MB','PNG, JPG, WebP · 최대 2MB')}</span></button><p class="panel-description">내 이미지를 업로드하거나 로컬 샘플 이미지로 분위기를 확인하세요.</p><div class="asset-grid">${['interior', 'chair', 'living'].map(a => `<button data-action="apply-asset" data-asset="${a}" aria-label="Use ${a} image"><img src="/assets/${a}.jpg" alt="${a} reference photo"><span>${a}</span></button>`).join('')}</div><p class="panel-description">${ui('Unsplash reference photography.','Unsplash 레퍼런스 사진입니다.')}<br>샘플 이미지이며, AI 생성 이미지가 아닙니다.</p>`;
  return `<button class="secondary-button explorer-entry" data-action="theme-review">${ui("Compare color & font drafts","색상·폰트 초안 비교")}</button><button class="secondary-button explorer-entry" data-action="component-explorer">${ui("Compare across design systems","DS별 컴포넌트 비교")}</button><label class="search-box">${icon('search')}<input id="component-search" aria-label="Search components" placeholder="${ui('Find a component...','컴포넌트 찾기…')}" value="${esc(query)}"><kbd>/</kbd></label><div class="component-list">${componentCards()}</div><div class="library-hint">${icon('grip')}<span>${ui('Drag onto the canvas.','캔버스로 드래그하세요.')}<br>${ui('Or click + to add instantly.','또는 +를 눌러 바로 추가하세요.')}</span></div>`;
}
let explorerKind:BlockKind='button',explorerVariant='solid';
let explorerGroup='All';
let explorerFilter={...emptyCatalogFilter};
let shelfPageIndex=0;
function shelfHtml(){
 const slice=shelfPage(project.shelf??[],shelfPageIndex);shelfPageIndex=slice.page;
 return `<section class="catalog-shelf" aria-label="Assembly shelf"><strong>${ui('Project assembly shelf','프로젝트 조립 선반')} · ${(project.shelf??[]).length}/12</strong><p>${ui('Saved with this project. Inspect at full size, then drag or Add. Canvas Undo does not change the shelf.','프로젝트와 함께 저장됩니다. 크게 확인한 뒤 드래그하거나 추가하세요. 캔버스 실행 취소와는 별개입니다.')}</p><nav class="shelf-pagination" aria-label="Shelf pages">${Array.from({length:slice.pages},(_,i)=>`<button data-action="shelf-page" data-index="${i}" aria-label="Shelf page ${i+1}" aria-current="${i===slice.page?'page':'false'}">${i+1}</button>`).join('')}<small>${ui('Up to 4 live previews','실시간 미리보기 최대 4개')}</small></nav>${slice.items.map(({choice:c,index:i})=>`<article data-catalog-choice="${esc(JSON.stringify(c))}" aria-label="Drag ${c.provider} ${c.kind} ${c.variant}"><strong>${esc(c.kind)}</strong><code>${esc(c.provider)} / ${esc(c.variant)}</code><div class="shelf-preview" inert aria-hidden="true"><div class="design-page" style="${esc(themeVars(project))}">${renderTree([explorerBlock(c.kind,c.provider,c.variant)],project)}</div></div><small>${c.provider==='seed'||c.provider==='astryx'?ui('Native DS theme','DS 고유 테마'):ui('Project tokens · variant mapping','프로젝트 토큰 · 변형별 매핑')}</small><button data-action="shelf-inspect" data-index="${i}" aria-label="Inspect ${c.provider} ${c.kind} ${c.variant}">${ui('Inspect','크게 보기')}</button><button data-action="shelf-add" data-index="${i}" aria-label="Add ${c.provider} ${c.kind} ${c.variant}">${ui('Add','추가')}</button><button data-action="shelf-remove" data-index="${i}" aria-label="Remove ${c.provider} ${c.kind} ${c.variant}">×</button></article>`).join('')||`<small>${ui('Choose “Pin to shelf” in the catalog.','카탈로그에서 선반에 담기를 선택하세요.')}</small>`}</section>`;
}
let inspection:{choice:CatalogChoice;projectId:string;pageId:string;parentId?:string;origin:'shelf'|'catalog';width:number}|null=null;
function inspectChoice(choice:CatalogChoice,origin:'shelf'|'catalog'){
 const form=modalRoot.querySelector<HTMLFormElement>('#catalog-filter-form');
 if(origin==='catalog'&&form){const data=new FormData(form);explorerFilter=normalizeCatalogFilter(String(data.get('query')??''),String(data.get('provider')??'all'));}
 inspection={choice:{...choice},projectId:project.id,pageId:project.activePageId,parentId:insertionTarget(),origin,width:960};
 inspectionModal();
}
function inspectionModal(){
 if(!inspection)return;
 const {choice:c,width,parentId}=inspection,b=explorerBlock(c.kind,c.provider,c.variant),native=c.provider==='seed'||c.provider==='astryx';
 showModal(ui('Inspect before assembling','조립 전에 크게 확인하세요'),`${esc(c.provider)} / ${esc(c.kind)} / ${esc(c.variant)}`,`
 <div class="inspection-toolbar"><label>${ui('Preview width','미리보기 너비')}<select id="inspection-width" aria-label="Preview width">${[375,768,960,1440].map(n=>`<option value="${n}" ${width===n?'selected':''}>${n} px</option>`).join('')}</select></label><span>${ui('Insert into','삽입 위치')}: <strong>${esc(nodePath(currentPage(project).blocks,parentId))}</strong></span><button class="secondary-button" data-action="inspection-back">${ui('Back · keep selection','돌아가기 · 선택 유지')}</button><button class="primary-button" data-action="inspection-add">${ui('Add this implementation','이 구현 추가')}</button></div>
 <p class="inspection-note">${native?ui('Native DS colors. Project color mapping is not supported.','DS 고유 색상입니다. 프로젝트 색상 매핑은 지원하지 않습니다.'):ui('Project tokens with adapter-specific variant mapping. Not a full vendor theme import.','프로젝트 토큰을 어댑터 변형별로 매핑합니다. 공식 테마 전체 이식이 아닙니다.')} ${c.kind==='frame'?ui('Empty layout container: children are assembled after insertion.','빈 레이아웃 컨테이너입니다. 삽입 후 자식 컴포넌트를 조립합니다.'):''} ${ui('Visual preview only. Scroll horizontally or vertically to see the whole component.','형태 확인용 미리보기입니다. 가로·세로 스크롤로 전체 컴포넌트를 확인하세요.')}</p>
 <div class="inspection-viewport" role="region" aria-label="Full component preview" tabindex="0"><div class="design-page" style="${esc(themeVars(project))};width:${width}px" inert>${renderTree([b],project)}</div></div>`,true);
 modalRoot.querySelector('.modal')?.classList.add('inspection-modal');
}
let themeDraft:ReturnType<typeof themeProposal>|null=null;
function themeReview(fresh=false){
 if(fresh||!themeDraft||themeDraft.projectId!==project.id)themeDraft=themeProposal(project,project.system.accent,project.system.font);
 const candidate=themeDraft.candidate;
 showModal(ui('Render first. Decide next.','먼저 보고, 그다음 결정하세요.'),ui('A reversible theme draft. No implementation or approval runs here.','되돌릴 수 있는 테마 초안입니다. 구현 실행이나 디자인 승인은 하지 않습니다.'),`
 <div class="explorer-controls"><label>${ui('Proposed primary','초안 메인 색상')}<input type="color" id="proposal-color" aria-label="Proposed primary" value="${candidate.system.accent}"></label><label>${ui('Heading font','제목 폰트')}<select id="proposal-font" aria-label="Proposed heading font"><option value="serif" ${candidate.system.font==='serif'?'selected':''}>${ui('Editorial serif','에디토리얼 세리프')}</option><option value="sans" ${candidate.system.font==='sans'?'selected':''}>${ui('Modern sans','모던 산스')}</option></select></label><button class="secondary-button" data-action="proposal-blue">${ui('Try blue','파란색 초안')}</button><button class="secondary-button" data-action="proposal-green">${ui('Try green','초록색 초안')}</button></div>
 <div class="token-compare" aria-label="${ui('Token comparison','토큰 비교')}">${[['current',ui('Current','현재'),project.system],['proposed',ui('Proposed','제안'),candidate.system]].map(([key,label,sys])=>`<div class="token-row" data-row="${key}"><span>${label}</span>${(['accent','background','foreground'] as const).map(t=>`<b><i style="background:${(sys as typeof project.system)[t]}"></i>${esc((sys as typeof project.system)[t])}</b>`).join('')}<small>${(sys as typeof project.system).font==='serif'?ui('Serif','세리프'):ui('Sans','산스')} · ${(sys as typeof project.system).radius}px</small></div>`).join('')}${candidate.system.accent!==project.system.accent&&!currentPage(project).blocks.some(b=>['button','cta','hero','navigation','notice','products','features','tabs','stats','footer'].includes(b.kind))?`<p class="fine-print">${ui('This page has no component that uses the primary colour, so the two previews look alike. Add a button or CTA to see the difference.','이 페이지에는 메인 색상을 쓰는 컴포넌트가 없어 두 미리보기가 같아 보입니다. 버튼이나 CTA를 추가하면 차이가 보입니다.')}</p>`:''}</div>
 <p>${ui('Primary text token contrast (not a full accessibility audit)','본문 기본 토큰 대비 (전체 접근성 감사 아님)')}: ${themeDraft.bodyContrast.toFixed(2)}:1 · ${ui('Astryx/SEED keep native themes; only mapped components change. Fonts are local serif/sans fallbacks, not licensed brand fonts.','Astryx/SEED는 고유 테마를 유지하며 매핑된 컴포넌트만 변경됩니다. 폰트는 로컬 serif/sans 대체 글꼴이며 브랜드 전용 폰트가 아닙니다.')}</p>
 <div class="theme-comparison"><article><h3>${ui('Current','현재')}</h3><iframe title="${ui('Current theme draft','현재 테마 초안')}" sandbox="allow-scripts"></iframe></article><article><h3>${ui('Proposed · not applied','제안 · 미적용')}</h3><iframe title="${ui('Proposed theme draft','제안 테마 초안')}" sandbox="allow-scripts"></iframe></article></div>
 <div class="vibe-actions"><button class="secondary-button" data-action="proposal-export">${ui("Export draft screen","초안 화면 내보내기")}</button><button class="secondary-button" data-action="proposal-full">${ui('Large preview','초안 크게 보기')}</button><button class="primary-button" data-action="proposal-apply">${ui('Apply draft · Undo available','이 초안 적용 · 실행 취소 가능')}</button></div>`,true);
 modalRoot.querySelectorAll<HTMLIFrameElement>('.theme-comparison iframe').forEach((f,i)=>{const p=i?candidate:project;mountPagePreview(f,p,currentPage(p));});
}
function explorerModal(preserveDraft=true){
 const draft=modalRoot.querySelector<HTMLFormElement>('#catalog-filter-form');
 if(preserveDraft&&draft){const data=new FormData(draft);explorerFilter=normalizeCatalogFilter(String(data.get('query')??''),String(data.get('provider')??'all'));}
 const kinds=filteredKinds(explorerGroup,explorerFilter);
 if(kinds.length&&!kinds.some(c=>c.kind===explorerKind))explorerKind=kinds[0].kind;
 const variants=patternVariants(explorerKind);if(!variants.includes(explorerVariant))explorerVariant=variants[0];
 showModal(ui('The component collection.','좋은 화면을 만드는 조각들.'),ui('Find your form. Make it your own.','형태를 발견하고, 당신의 브랜드로 조립하세요.'),catalogView(project,explorerKind,explorerVariant,explorerGroup,ui,c=>`<div class="design-page" style="${esc(themeVars(project))}">${blockHtml(explorerBlock(c.kind,c.provider,c.variant),project)}</div>`,explorerFilter),true);
 modalRoot.querySelector('.modal')?.classList.add('catalog-modal');
 refreshExplorerPins();
}
function refreshExplorerPins(){
 const count=modalRoot.querySelector('[data-shelf-count]');if(count)count.textContent=ui(`Assemble from shelf · ${project.shelf?.length??0}/12`,`선반에서 조립 · ${project.shelf?.length??0}/12`);
 modalRoot.querySelectorAll<HTMLButtonElement>('[data-action="explorer-pin"]').forEach(el=>{
  const pinned=project.shelf?.some(c=>c.kind===el.dataset.kind&&c.provider===el.dataset.provider&&c.variant===el.dataset.variant);
  el.disabled=!!pinned;el.textContent=pinned?ui('On project shelf','프로젝트 선반에 담김'):ui('Pin to shelf','선반에 담기');
 });
}
function componentCards() {
  const list = catalog.filter(c => `${c.name} ${c.description} ${c.category} ${patternVariants(c.kind).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return list.map(c => `<div class="component-card" draggable="true" data-component="${c.kind}"><div class="component-thumbnail thumb-${c.kind}" aria-hidden="true"><div class="mini-nav"><b></b><span></span><span></span></div><div class="mini-body"><div class="mini-lines"><b></b><span></span><span></span><em></em></div><div class="mini-image">${icon(c.icon)}</div></div></div><div class="component-info"><div><strong>${c.name}</strong><span>${c.category}${isPattern(c.kind)?` · ${patternVariants(c.kind).length} ${ui('variants','변형')}`:''}</span></div><button data-action="add" data-kind="${c.kind}" aria-label="Add ${c.name}" title="${ui(`Add ${c.name}`,`${c.name} 추가`)}">${icon('plus')}</button></div></div>`).join('') || `<p class="empty-state">${ui('No matching components.','일치하는 컴포넌트가 없습니다.')}</p>`;
}
function inspectorHtml() {
  const b = currentPage(project).blocks.find(b => b.id === selected);
  return `<div class="inspector-title"><span>${ui('Design','디자인')}</span><span class="inspector-kicker">${ui('PROJECT TOKENS','프로젝트 토큰')}</span></div>
  <section class="inspector-section"><div class="section-heading"><h2>${ui('Look & feel','분위기와 스타일')}</h2>${iconButton('systems', 'sliders-horizontal', 'Choose design system')}</div><button class="selected-system" data-action="systems"><span class="palette-orb" style="background:${project.system.accent}">${icon('flower-2')}</span><div><strong>${esc(project.system.name)}</strong><small>${esc(project.system.description)}</small></div>${icon('chevron-down')}</button><label class="field-label">${ui('Color palette','색상 팔레트')} <span>${ui('Shared across pages','모든 페이지에 공유')}</span></label><div class="color-swatches">${[project.system.accent, project.system.background, project.system.foreground, '#e5e1d8', '#c0c8b8'].map((color, i) => `<span style="background:${color}" title="${i < 3 ? [ui('Primary','메인'), ui('Background','배경'), ui('Foreground','전경')][i] : ui('Decorative editor swatch','편집기 장식 색')}: ${color}"></span>`).join('')}</div><div class="color-inputs">${(['accent', 'background', 'foreground'] as const).map((key, i) => `<label><input type="color" aria-label="${['Primary', 'Background', 'Foreground'][i]} color" data-token="${key}" value="${project.system[key]}"><span>${[ui('Primary','메인'), ui('Canvas','캔버스'), ui('Text','텍스트')][i]}</span><code>${project.system[key].toUpperCase()}</code></label>`).join('')}</div><div class="paired-fields"><label>${ui('Typeface','서체')}<select id="font-select" aria-label="Heading typeface"><option value="serif" ${project.system.font === 'serif' ? 'selected' : ''}>${ui('Editorial serif','에디토리얼 세리프')}</option><option value="sans" ${project.system.font === 'sans' ? 'selected' : ''}>${ui('Modern sans','모던 산스')}</option></select></label><label>${ui('Radius','모서리')}<select id="radius-select" aria-label="Corner radius">${[0, 2, 4, 8, 12, 16, 24, 32, 48].map(v => `<option ${v === project.system.radius ? 'selected' : ''} value="${v}">${v} px</option>`).join('')}</select></label></div><button class="text-link" data-action="design-md">${icon('file-text')}${ui('View DESIGN.md','DESIGN.md 보기')}${icon('arrow-up-right')}</button></section>
  <section class="inspector-section component-inspector"><div class="section-heading"><h2>${b ? ui('Selected component','선택한 컴포넌트') : ui('Component properties','컴포넌트 속성')}</h2>${icon('box')}</div>${b ? `<div class="selected-component-label">${icon(catalog.find(c => c.kind === b.kind)!.icon)}<strong>${catalog.find(c => c.kind === b.kind)!.name}</strong><span>${control(b.filled ? 'Filled' : 'Draft')}</span></div><label class="edit-field">${b.kind === 'navigation' || b.kind === 'footer' ? ui('Brand name','브랜드명') : ui('Heading','제목')}<textarea data-field="title" rows="2" aria-label="Component heading">${esc(b.title)}</textarea></label><label class="edit-field">${ui('Content','본문')}<textarea data-field="text" rows="3" aria-label="Component content">${esc(b.text)}</textarea></label><label class="edit-field">${ui('Label / action','라벨 / 동작')}<input data-field="label" aria-label="Component action label" value="${esc(b.label)}"></label>${b.kind === 'hero' || b.kind === 'products' ? `<button class="upload-inline" data-action="block-image">${icon('image-plus')}${ui('Replace image','이미지 교체')}</button>` : ''}<div class="block-tools">${iconButton('move-up', 'arrow-up', 'Move component up', currentPage(project).blocks[0]?.id === b.id ? 'disabled' : '')}${iconButton('move-down', 'arrow-down', 'Move component down', currentPage(project).blocks.at(-1)?.id === b.id ? 'disabled' : '')}${iconButton('duplicate-block', 'copy', 'Duplicate component')}<span></span>${iconButton('delete-block', 'trash-2', 'Delete component')}</div>` : '<p class="panel-description">캔버스의 컴포넌트를 선택하면 문구와 이미지를 편집할 수 있습니다.</p>'}</section>
  <div class="review-card"><img class="paper-review-art" src="/brand/cutouts/${isApproved(project)?'paper-dove':'review'}.png" alt="" width="96" height="96"><span class="review-symbol">${icon(isApproved(project) ? 'circle-check' : 'scan-eye')}</span><strong>${isApproved(project) ? ui('Direction, decided.','방향이 정해졌습니다.') : ui('Like where this is going?','이 방향으로 갈까요?')}</strong><p>${isApproved(project) ? '확인한 화면을 코드 작업으로 이어가세요.' : '화면을 확인하고 디자인 방향을 확정하세요.'}</p>${button('approve', isApproved(project) ? 'arrow-up-right' : 'check', isApproved(project) ? 'Ready to export' : 'Approve direction', isApproved(project) ? 'primary-button' : 'approve-button')}</div>`;
}
function showModal(title: string, subtitle: string, body: string, wide = false) {
  comparisonObserver?.disconnect(); comparisonObserver = null;
  if (!modalRoot.children.length) modalReturnFocus = document.activeElement as HTMLElement;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><div><span class="kicker">APHRODITE STUDIO</span><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div>${iconButton('close-modal', 'x', 'Close dialog')}</div><div class="modal-content">${body}</div></section></div>`;
  app.inert = true; hydrateIcons(); setTimeout(() => {if(!modalRoot.contains(document.activeElement))modalRoot.querySelector<HTMLElement>('input,textarea,button')?.focus();}, 0);
  hydrateNativeLibraries(modalRoot);
  syncStateAttributes();
}
function closeModal() { analysisGeneration++; comparisonObserver?.disconnect(); comparisonObserver = null; modalRoot.innerHTML = ''; app.inert = false; modalReturnFocus?.focus();   syncStateAttributes();
}
function systemModal() {
  showModal(ui('Start with a point of view.','관점부터 정하세요.'), '시스템을 바꾸면 모든 페이지의 색상과 스타일이 함께 바뀝니다.', `<div class="systems-grid">${systems.map(s => `<button class="system-option ${project.system.id === s.id ? 'active' : ''}" data-action="choose-system" data-system="${s.id}"><div class="system-preview" style="background:${s.background};color:${s.foreground};--preview-accent:${s.accent}"><span style="font-family:${s.font === 'serif' ? 'Georgia' : 'Arial'}">Aa</span><i style="background:${s.accent}"></i><i style="background:${s.foreground}"></i></div><div><strong>${s.name}</strong>${project.system.id === s.id ? icon('circle-check') : icon('arrow-up-right')}</div><p>${s.description}</p></button>`).join('')}</div><div class="modal-note">Material / shadcn / SEED / Astryx를 고르면 지원되는 새 컴포넌트에 어댑터가 기본 적용됩니다. 기존 컴포넌트는 Implementation에서 선택하세요. Karrot inspired / Toss는 색상 참조 프리셋입니다.</div>${button('import-md', 'file-up', 'Import your DESIGN.md', 'secondary-button full-width')}<p class="fine-print">명시적인 primary / background / foreground 색상을 읽습니다. 전체 원문도 내보내기에 보존합니다.</p>`);
}
function designBridgeModal() {
  systemModal();
  modalRoot.querySelector('.modal-content')!.insertAdjacentHTML('afterbegin',bridgeHtml());
  hydrateIcons();
}
function briefModal() {
  showModal(ui('What are we shaping?','무엇을 만들까요?'), '초안의 목적을 정하고, 바로 편집할 수 있는 구조를 만드세요.', `<form id="brief-form"><label class="form-label">${ui('Project name','프로젝트 이름')}<input name="name" required maxlength="100" value="${esc(project.name)}"></label><label class="form-label">${ui('The direction','방향')}<textarea name="brief" rows="4" required maxlength="2000" placeholder="어떤 화면을 만들고 싶으세요?">${esc(project.brief)}</textarea></label><div class="brief-presets">${['가구 브랜드 쇼핑몰', '크리에이티브 스튜디오 포트폴리오', '새로운 SaaS 랜딩페이지'].map(t => `<button type="button" data-action="brief-preset" data-value="${t}">${t}</button>`).join('')}</div><div class="modal-note">${icon('blocks')}로컬 템플릿 규칙으로 새 페이지를 조립합니다. 이미지 분석이나 AI 추론은 호출하지 않습니다. 기존 페이지는 유지됩니다.</div><button class="primary-button full-width" type="submit">${icon('wand-sparkles')}${ui('Assemble a new draft','새 초안 조립하기')} ${icon('arrow-right')}</button></form>`);
}
function autofillModal() {
  vibePending=null;
  if(!currentPage(project).blocks.length){showModal(ui('Get Vibe','Get Vibe'),ui('Nothing to fill yet.','아직 채울 것이 없습니다.'),emptyPageVibeHtml(uiLanguage));return;}
  showModal(ui('Get Vibe','Get Vibe'), ui('Review changes before filling. Existing content is protected by default.','채우기 전에 변경 내용을 확인하세요. 기존 콘텐츠는 기본적으로 보호됩니다.'), vibeFormHtml(!!vibeImage,project.contentLanguage,uiLanguage),true);
  if(vibeFormDraft){const form=modalRoot.querySelector<HTMLFormElement>('#vibe-form')!;for(const name of ['pack','language'])(form.elements.namedItem(name) as HTMLSelectElement).value=String(vibeFormDraft.get(name));for(const name of ['copy','images','replace'])(form.elements.namedItem(name) as HTMLInputElement).checked=vibeFormDraft.has(name);}
}
function exportModal(view = 'prompt') {
  const approved = isApproved(project);
  showModal(ui('Good direction deserves a head start.','좋은 방향은 앞서 가져갈 가치가 있습니다.'), '확인한 컴포넌트와 디자인 결정을 다음 작업으로 가져가세요.', `<div class="export-status ${approved ? 'approved' : ''}">${icon(approved ? 'circle-check' : 'circle-dashed')}<span>${approved ? ui('Direction approved · Ready for handoff','방향 승인됨 · 핸드오프 준비됨') : ui('Draft export · 아직 디자인 방향을 승인하지 않았습니다.','초안 내보내기 · 아직 디자인 방향을 승인하지 않았습니다.')}</span>${!approved ? `<button data-action="approve-export">${ui('Approve now','지금 승인')}</button>` : ''}</div><div class="export-tabs">${['prompt', 'design', 'html'].map(t => `<button class="${view === t ? 'active' : ''}" data-action="export-tab" data-view="${t}">${t === 'prompt' ? 'PROMPT.md' : t === 'design' ? 'DESIGN.md' : 'index.html'}</button>`).join('')}</div><pre class="export-code">${esc(view === 'prompt' ? buildPrompt(project) : view === 'design' ? designMarkdown(project) : pageHtml(project, project.pages[0]))}</pre><div class="export-contents"><span>${icon('file-code-2')} ${project.pages.length} HTML ${ui(project.pages.length > 1 ? 'pages' : 'page', '페이지')}</span><span>${icon('palette')} ${ui('Design tokens','디자인 토큰')}</span><span>${icon('image')} ${ui('Local assets','로컬 에셋')}</span><span>${icon('folder')} ${ui('Editable project','편집 가능한 프로젝트')}</span></div><div class="export-actions">${button('copy-prompt', 'copy', 'Copy prompt', 'secondary-button')}${button('download-bundle', 'download', 'Download handoff .zip', 'primary-button')}</div><p class="fine-print">HTML은 미리보기와 같은 렌더러로 생성됩니다. 모든 이미지를 함께 묶어 오프라인에서도 열 수 있습니다.</p>`, true);
  const activeIndex = project.pages.findIndex(page => page.id === project.activePageId);
  const htmlTab = modalRoot.querySelector<HTMLElement>('[data-action="export-tab"][data-view="html"]');
  if (htmlTab) htmlTab.textContent = activeIndex === 0 ? 'index.html' : `page-${activeIndex + 1}.html`;
  if (view === 'html') modalRoot.querySelector('.export-code')!.textContent = pageHtml(project, currentPage(project));
}
function addBlock(kind: BlockKind, before?: string, choice?:{provider:string;variant:string}) {
  if (currentPage(project).blocks.length >= 100) { toast('페이지당 최대 100개 컴포넌트를 지원합니다.'); return; }
  const blocks=currentPage(project).blocks,b=choice?explorerBlock(kind,choice.provider,choice.variant):makeBlock(kind),target=blocks.find(x=>x.id===before);
  b.parentId=target?(target.kind==='frame'?target.id:target.parentId):insertionTarget();
  if(!canParent([...blocks,b],b.id,b.parentId)){recordRun('catalog:rejected',{reason:'invalid-depth',parentId:b.parentId});toast('이 프레임에는 더 깊게 중첩할 수 없습니다. 삽입 대상을 바꾸세요.');return;}
  if(!choice&&supportsProvider(project.system.id,kind))b.provider=project.system.id;
  const parentName=nodePath(blocks,b.parentId);
  commit(()=>{const index=target?.kind==='frame'?-1:blocks.findIndex(x=>x.id===before);blocks.splice(index<0?blocks.length:index,0,b);selected=b.id;},true,before?'catalog:drop':'catalog:add');
  document.querySelector<HTMLElement>(`[data-block-id="${selected}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast(`${catalog.find(c => c.kind === kind)!.name} ${ui('added →','추가됨 →')} ${parentName}`);
}
function bindDragAndDrop() {
 app.querySelector('.catalog-shelf')?.remove();
 if(tab==='components')app.querySelector('.component-list')?.insertAdjacentHTML('beforebegin',shelfHtml());
 hydrateNativeLibraries(app);
 app.querySelectorAll<HTMLElement>('[data-catalog-choice]').forEach(el=>{
  // Pointer transport also works when WebKit's native HTML drag does not start.
  el.draggable=false;
  el.addEventListener('pointerdown',e=>{
   if(e.button!==0||(e.target as HTMLElement).closest('button'))return;
   const choice=parseCatalogChoice(el.dataset.catalogChoice!);if(!choice)return;
   const start={x:e.clientX,y:e.clientY};el.setPointerCapture(e.pointerId);
   const move=(event:PointerEvent)=>{if(event.pointerId!==e.pointerId)return;el.classList.toggle('shelf-dragging',Math.hypot(event.clientX-start.x,event.clientY-start.y)>6);};
   const cleanup=()=>{
    el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',finish);el.removeEventListener('pointercancel',finish);el.removeEventListener('lostpointercapture',cleanup);document.removeEventListener('keydown',cancel);el.classList.remove('shelf-dragging');
    if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);
   };
   const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cleanup();toast(ui('Drag cancelled','드래그 취소됨'));}};
   const finish=(event:PointerEvent)=>{
    if(event.pointerId!==e.pointerId)return;
    cleanup();
    if(event.type==='pointercancel'||Math.hypot(event.clientX-start.x,event.clientY-start.y)<=6)return;
    const hit=document.elementFromPoint(event.clientX,event.clientY);
    if(!hit?.closest('#design-canvas')){toast(ui('Drop inside the page canvas','페이지 캔버스 안에 놓아주세요'));return;}
    addBlock(choice.kind,hit.closest<HTMLElement>('[data-block-id]')?.dataset.blockId,choice);
   };
   el.addEventListener('pointermove',move);el.addEventListener('pointerup',finish);el.addEventListener('pointercancel',finish);el.addEventListener('lostpointercapture',cleanup);document.addEventListener('keydown',cancel);
  });
 });
  app.querySelectorAll<HTMLElement>('[data-move-id]').forEach(el=>el.addEventListener('dragstart',e=>{e.dataTransfer?.setData('application/aphrodite-move',el.dataset.moveId!);}));
  app.querySelectorAll<HTMLElement>('[data-component]').forEach(el => el.addEventListener('dragstart', e => { e.dataTransfer?.setData('application/aphrodite-component', el.dataset.component!); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'; }));
  const canvas = app.querySelector<HTMLElement>('#design-canvas')!;
  if(canvas.dataset.nativeDropBound)return;canvas.dataset.nativeDropBound='true';
  canvas.addEventListener('drop',e=>{const raw=e.dataTransfer?.getData(catalogMime);if(!raw)return;e.preventDefault();e.stopImmediatePropagation();canvas.classList.remove('drop-active');canvas.querySelectorAll('.drop-before').forEach(el=>el.classList.remove('drop-before'));const choice=parseCatalogChoice(raw);if(!choice){toast(ui('Invalid catalog selection','유효하지 않은 카탈로그 선택입니다'));return;}const before=(e.target as HTMLElement).closest<HTMLElement>('[data-block-id]')?.dataset.blockId;addBlock(choice.kind,before,choice);});
  canvas.addEventListener('drop',e=>{const id=e.dataTransfer?.getData('application/aphrodite-move');if(!id)return;e.preventDefault();e.stopImmediatePropagation();const blocks=currentPage(project).blocks;const moving=blocks.find(b=>b.id===id);const target=blocks.find(b=>b.id===(e.target as HTMLElement).closest<HTMLElement>('[data-block-id]')?.dataset.blockId);if(!moving||moving===target)return;const parent=target?.kind==='frame'?target.id:target?.parentId;if(!canParent(blocks,id,parent))return;commit(()=>{moving.parentId=parent;blocks.splice(blocks.indexOf(moving),1);const index=target?blocks.indexOf(target):-1;blocks.splice(index<0?blocks.length:index,0,moving);selected=id;});toast(ui('Component moved · Undo available','컴포넌트를 옮겼습니다 · 실행 취소 가능'));});
  canvas.addEventListener('dragover', e => { e.preventDefault(); canvas.classList.add('drop-active'); const wrap = (e.target as HTMLElement).closest('.block-wrap'); canvas.querySelectorAll('.drop-before').forEach(el => el.classList.remove('drop-before')); wrap?.classList.add('drop-before'); });
  canvas.addEventListener('dragleave', e => { if (!canvas.contains(e.relatedTarget as Node)) { canvas.classList.remove('drop-active'); canvas.querySelectorAll('.drop-before').forEach(el => el.classList.remove('drop-before')); } });
  canvas.addEventListener('drop', e => { e.preventDefault(); const kind = e.dataTransfer?.getData('application/aphrodite-component') as BlockKind; const before = (e.target as HTMLElement).closest<HTMLElement>('[data-block-id]')?.dataset.blockId; if (catalog.some(c => c.kind === kind)) addBlock(kind, before); else { canvas.classList.remove('drop-active'); canvas.querySelectorAll('.drop-before').forEach(el => el.classList.remove('drop-before')); } });
}
function pickFile(accept: string, handler: (file: File) => Promise<void>) {
  const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.hidden = true; input.dataset.upload = accept;
  document.querySelector('[data-upload]')?.remove(); document.body.append(input);
  input.addEventListener('change', async () => { try { if (input.files?.[0]) await handler(input.files[0]); } catch (error) { toast(error instanceof Error ? error.message : '파일을 읽지 못했습니다.'); } finally { input.remove(); } }); input.addEventListener('cancel', () => input.remove()); input.click();
}
async function readImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) throw new Error('2MB 이하 PNG, JPG, WebP 이미지를 선택해주세요.');
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
  await new Promise<void>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error('유효한 이미지 파일이 아닙니다.')); img.src = data; });
  return data;
}
function referenceModal() {
  showModal(ui('One reference. Three possibilities.','하나의 레퍼런스. 세 가지 가능성.'), '이미지에서 단서를 읽고, 실제 컴포넌트로 방향을 비교하세요.', `${project.reference ? `<img class="reference-large" src="${project.reference}" alt="${ui('Your visual reference','시각 레퍼런스')}">` : `<div class="reference-empty">↗<strong>${ui('Every direction starts somewhere.','모든 방향은 어디에서든 시작됩니다.')}</strong><span>이미지 한 장부터 시작하세요.</span></div>`}<div class="export-actions">${button('upload-reference', 'upload', project.reference ? 'Replace reference' : 'Upload reference', 'secondary-button')}${project.reference ? button('analyze-reference', 'scan-text', 'Analyze reference', 'primary-button') : button('demo-reference', 'image', 'Try a sample reference', 'primary-button')}</div>${project.reference ? button('remove-reference', 'trash-2', 'Remove reference', 'text-link') : ''}<p class="fine-print">PNG / JPG / WebP, 2MB 이하. macOS: Apple Vision OCR + 로컬 픽셀 분석. 브라우저: 색상·텍스처 분석만. 외부 API 전송이나 생성 비용은 없습니다.</p>`);
}
function analysisModal() {
  if (!referenceAnalysis) return;
  const a = referenceAnalysis, copy = referenceDraft?.copy ?? suggestCopy(a.lines, project);
  showModal(ui('Read the clues. Keep the intent.','단서를 읽고, 의도는 지키세요.'), '레퍼런스는 단서입니다. 문구와 이미지 후보를 검토한 뒤 비교하세요.', `<div class="analysis-grid"><div><div class="reference-evidence-image"><img src="${project.reference}" alt="${ui('Analyzed reference','분석한 레퍼런스')}">${a.cropBox ? `<span class="crop-overlay" style="left:${a.cropBox.x * 100}%;top:${a.cropBox.y * 100}%;width:${a.cropBox.width * 100}%;height:${a.cropBox.height * 100}%"><b>${ui('MEDIA CANDIDATE','미디어 후보')}</b></span>` : ''}</div><div class="analysis-metrics"><span>${esc(a.engine)}</span><span>${a.lines.length} ${ui('text lines','텍스트 줄')}</span><span>${(a.elapsedMs / 1000).toFixed(2)}s</span></div><div class="evidence-palette">${a.palette.map(c => `<span style="background:${c}" title="${c}"></span>`).join('')}<small>${ui('Observed colors · project tokens unchanged','관찰된 색상 · 프로젝트 토큰은 그대로입니다')}</small></div><details class="ocr-details"><summary>${ui('Inspect OCR evidence','OCR 단서 확인')} (${a.lines.length})</summary>${a.lines.map(l => `<p>${esc(l.text)} <small>${Math.round(l.confidence * 100)}%</small></p>`).join('') || `<p>${ui('No OCR evidence available.','OCR 단서가 없습니다.')}</p>`}</details></div><div><div class="modal-note">${esc(a.warning)}</div><label class="form-label">${ui('Proposed heading','제안 제목')}<textarea id="reference-title" rows="2" maxlength="2000">${esc(copy.title)}</textarea></label><label class="form-label">${ui('Supporting copy','보조 문구')}<textarea id="reference-copy" rows="3" maxlength="4000">${esc(copy.text)}</textarea></label><label class="form-label">${ui('Action label','동작 라벨')}<input id="reference-label" maxlength="200" value="${esc(copy.label)}"></label>${a.crop ? `<label class="check-option"><input id="reference-use-crop" type="checkbox"><span><strong>${ui('Use this media candidate','이 미디어 후보 사용')}</strong><small>텍스처 기반 추정입니다. 영역에 문구가 섞였는지 확인하세요. 기본값은 빈 이미지입니다.</small></span><img class="crop-thumb" src="${a.crop}" alt="${ui('Proposed media crop','제안 미디어 영역')}"></label>` : '<p class="fine-print">명확한 이미지 영역을 찾지 못했습니다. 이미지 슬롯을 비워둡니다.</p>'}${button('compare-directions', 'columns-3', 'Compare 3 directions', 'primary-button full-width')}<p class="fine-print">같은 문구·토큰·컴포넌트로 배치만 비교합니다. 아래 섹션 문구는 편집용 플레이스홀더입니다.</p></div></div>`, true);
}
function compareModal() {
  showModal(ui('Same intent. A different first impression.','같은 의도. 다른 첫인상.'), `${esc(project.system.name)} · ${ui('Same tokens, real components. 하나를 선택하면 편집 가능한 새 페이지가 됩니다.','같은 토큰, 실제 컴포넌트. 하나를 선택하면 편집 가능한 새 페이지가 됩니다.')}`, `<div class="direction-comparison">${candidatePages.map((p, i) => `<article class="direction-option"><div class="direction-option-heading"><span>0${i + 1}</span><div><h3>${esc(p.name)}</h3><p>${directions[i].description}</p></div></div><div class="direction-preview"><iframe title="${esc(p.name)} ${ui('preview','미리보기')}" sandbox="allow-same-origin" tabindex="-1"></iframe></div><div class="direction-option-footer"><code>aphrodite.hero / ${directions[i].variant}</code>${button('choose-direction', 'arrow-up-right', ui(`Use direction ${i + 1}`,`${i + 1}안 사용`), 'primary-button full-width', `data-index="${i}"`)}</div></article>`).join('')}</div><div class="comparison-note"><span>${icon('lock-keyhole')}${ui('Your brand stays intact. Only the composition changes.','브랜드는 그대로입니다. 구성만 바뀝니다.')}</span>${button('review-reference', 'arrow-left', 'Back to evidence', 'secondary-button')}</div>`, true);
  modalRoot.querySelector('.modal')!.classList.add('comparison-modal');
  modalRoot.querySelectorAll<HTMLIFrameElement>('.direction-preview>iframe').forEach((frame, i) => { mountPagePreview(frame,project,candidatePages[i]); });
  comparisonObserver = new ResizeObserver(entries => entries.forEach(entry => { const frame = entry.target.querySelector<HTMLElement>(':scope > iframe,:scope > .native-page-preview'); if(frame)frame.style.transform = `scale(${entry.contentRect.width / 1000})`; }));
  modalRoot.querySelectorAll('.direction-preview').forEach(el => comparisonObserver!.observe(el));
}
async function action(el: HTMLElement) {
  const act = el.dataset.action;
  const blocks = currentPage(project).blocks, b = blocks.find(b => b.id === selected);
  switch (act) {
    case 'language-settings':showModal(ui('Language / 언어','Language / 언어'),ui('Interface and content are separate preferences.','앱 조작 언어와 콘텐츠 언어는 별개의 설정입니다.'),languageSettingsHtml(uiLanguage,screen==='editor'?(project.contentLanguage??'en'):undefined));break;
    case 'vault-open': vaultProjectId=el.dataset.id||project.id;vaultState=undefined;await showVault();break;
    case 'vault-refresh': await showVault();break;
    case 'vault-back': await showVault(false);break;
    case 'vault-note': showModal(ui('A document for this project.','이 프로젝트의 문서.'),'문서는 저장만 하며 AI 지시로 실행하지 않습니다.',`<form id="vault-note-form"><label class="form-label">${ui('Filename','파일 이름')}<input name="name" value="brief.md" required maxlength="100" pattern="[A-Za-z0-9_][A-Za-z0-9_.-]*" title="영문·숫자·점·밑줄·하이픈 파일명"></label><label class="form-label">${ui('Document','문서')}<textarea name="text" rows="10" maxlength="1000000" required placeholder="레퍼런스, 디자인 결정, 작업 메모…"></textarea></label><button class="primary-button" type="submit">${ui('Save document','문서 저장')}</button></form>`);break;
    case 'vault-import': {const id=vaultProjectId;pickFile('.md,.txt,.json,text/plain,text/markdown,application/json',async file=>{if(file.size>1_000_000)throw new Error('문서는 1MB 이하여야 합니다.');const state=await invoke<Vault>('vault_document',{projectId:id,name:file.name,text:await file.text()});if(id===vaultProjectId){vaultState=state;await showVault(false);}});break;}
    case 'vault-read': {if(!vaultState)break;const name=el.dataset.name!;const result=await invoke<{text?:string;image?:string}>('vault_read',{projectId:vaultProjectId,name,kind:el.dataset.kind,snapshotId:vaultState.snapshot});vaultReading={name,...result};showModal(esc(name),'파일 미리보기 · 원문은 지시가 아닌 데이터입니다.',`${result.image?`<img class="vault-image" src="${esc(result.image)}" alt="${esc(name)}">`:`<pre class="export-code">${esc(result.text??'')}</pre>`}<div class="vibe-actions">${button('vault-back','arrow-left','Back to files','secondary-button')}${result.text!==undefined?button('vault-download','download','Export file','secondary-button'):''}</div>`,true);break;}
    case 'vault-download': if(vaultReading?.text!==undefined)await saveFile(vaultReading.name,vaultReading.text,'text/plain');break;
    case 'hub-theme': night=!night;try{localStorage.setItem('aphrodite-paper-theme',night?'night':'paper');}catch{}render();break;
    case 'home': await guardSwitch();screen='home';closeModal();render();window.scrollTo(0,0);break;
    case 'inspector-toggle': break; // handled by bindInspectorCollapse
    case 'commands': commandsModal(); break;
    case 'focus-component-search': tab='components';render();document.querySelector<HTMLInputElement>('#component-search')?.focus(); break;
    case 'assembly-toggle': assemblyExpanded=!assemblyExpanded;try{localStorage.setItem('aphrodite-assembly-expanded',String(assemblyExpanded));}catch{}refreshAssemblyBar();break;
    case 'set-language': {const next=el.dataset.lang;if(next==='en'||next==='ko'){uiLanguage=next;try{saveUiLanguage(localStorage,next);}catch{}render();}break;}
    case 'copy-storage-path': {try{await navigator.clipboard.writeText(storagePath);toast(ui('Path copied','경로를 복사했습니다'));}catch{toast(ui('Could not copy. Select the path and copy it.','복사하지 못했습니다. 경로를 선택해 복사하세요.'));}break;}
    case 'editor-mode': {const next=el.dataset.mode;if(!isEditorMode(next)||next===editorMode)break;if(next==='agent'){agentModeModal();break;}if(editorMode==='agent')endAgentMode('returned');editorMode=next;render();toast(next==='dev'?ui('Dev mode · read-only handoff view','개발 모드 · 읽기 전용 핸드오프 보기'):ui('Design mode','디자인 모드'));break;}
    case 'dock-select': dockTool='select';selected='';render();break;
    case 'delegation-return': endAgentMode('returned');editorMode='design';render();toast(ui('Control returned to you. The run was recorded.','제어를 돌려받았습니다. 실행 기록이 남았습니다.'));break;
    case 'hub-filter': hubFilter=el.dataset.filter as LibraryFilter;render();break;
    case 'hub-view': hubView=el.dataset.view==='list'?'list':'grid';try{localStorage.setItem('aphrodite-hub-view',hubView);}catch{}render();break;
    case 'hub-open': {await guardSwitch();const entry=library.entries.find(e=>e.project.id===el.dataset.id);if(entry)openProject(entry.project);break;}
    case 'hub-pin': {const id=el.dataset.id!;saveLibrary({...library,entries:library.entries.map(e=>e.project.id===id?{...e,pinned:!e.pinned}:e)});render();document.querySelector(`[data-action="hub-pin"][data-id="${CSS.escape(id)}"]`)?.classList.add('folio-star-pop');break;}
    case 'hub-archive': {const id=el.dataset.id!;const entry=library.entries.find(e=>e.project.id===id);if(!entry)break;const card=el.closest<HTMLElement>('[data-project-id]');if(card&&!reducedMotion()){card.classList.add('folio-card-leave');await new Promise(r=>setTimeout(r,210));}saveLibrary({...library,entries:library.entries.map(e=>e.project.id===id?{...e,archived:!e.archived}:e)});render();toast(`‘${entry.project.name}’ · ${entry.archived?homeCopy[uiLanguage].restoredToast:homeCopy[uiLanguage].archivedToast}`);break;}
    case 'hub-duplicate': {const entry=library.entries.find(e=>e.project.id===el.dataset.id);if(entry){const copy=cloneProject(entry.project);saveLibrary(upsertProject(library,copy));render();const fresh=document.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(copy.id)}"]`);fresh?.classList.add('folio-card-enter');fresh?.scrollIntoView({block:'nearest'});toast(`${homeCopy[uiLanguage].duplicated} ‘${copy.name}’`);}break;}
    case 'hub-rename': {const entry=library.entries.find(e=>e.project.id===el.dataset.id);if(entry)showModal(ui('Give it a name.','이름을 지어 주세요.'),'프로젝트 내용은 그대로 보존됩니다.',`<form id="hub-rename-form"><input type="hidden" name="projectId" value="${esc(entry.project.id)}"><label class="form-label">${ui('Project name','프로젝트 이름')}<input name="name" required maxlength="100" value="${esc(entry.project.name)}"></label><button class="primary-button" type="submit">${ui('Rename project','프로젝트 이름 변경')}</button></form>`);break;}
    case 'storage-info': showModal(ui('Where your work lives','작업이 저장되는 곳'),ui('Everything stays on this Mac. No account, no cloud.','모든 것이 이 Mac에만 저장됩니다. 계정도, 클라우드도 없습니다.'),`<div class="storage-path"><code>${esc(storagePath)}</code><button class="secondary-button" data-action="copy-storage-path">${icon('copy')}${ui('Copy path','경로 복사')}</button></div><ul class="storage-facts"><li>${icon('hard-drive')}<span><strong>library.json</strong> · ${ui('your current projects','현재 프로젝트 보관함')}</span></li><li>${icon('history')}<span><strong>library.previous.json</strong> · ${ui('the previous save, kept automatically','직전 저장본 · 자동 보관')}</span></li><li>${icon('folder-open')}<span><strong>project-vault-v1/</strong> · ${ui('per-project images and DESIGN.md snapshots (Files on a project card)','프로젝트별 이미지·DESIGN.md 스냅샷 (프로젝트 카드의 파일)')}</span></li></ul><div class="vibe-actions">${button('hub-backup','download',ui('Save a workspace backup','작업 공간 백업 저장'),'secondary-button')}${button('hub-recovery','download',ui('Save raw recovery files','원본 복구 파일 저장'),'secondary-button')}</div><p class="fine-print">${ui('If another window changed the files, this one refuses to overwrite them and shows a banner with reload and backup options.','다른 창이 파일을 바꾸면 이 창은 덮어쓰지 않고, 다시 불러오기·백업 옵션이 있는 배너를 표시합니다.')}</p>`);break;
    case 'hub-backup': await saveFile('aphrodite-workspace.json',JSON.stringify(library,null,2),'application/json');break;
    case 'hub-recovery': await saveFile('aphrodite-recovery.json',nativeDesktop?JSON.stringify(await invoke('workspace_recovery'),null,2):localStorage.getItem(LIBRARY_KEY)??localStorage.getItem(LEGACY_KEY)??'{}','application/json');break;
    case 'pin-frame': if(b?.kind==='frame'){insertParent=b.id;recordRun('target:pinned',{nodeId:b.id});refreshAssemblyBar();toast('삽입 대상 고정됨 · 자식을 추가해도 유지됩니다.');}break;
    case 'insert-root': insertParent=undefined;recordRun('target:root');refreshAssemblyBar();break;
    case 'assembly-empty': if(project.pages.length>=30){toast('최대 30개 페이지를 지원합니다.');break;}commit(()=>{const p:Page={id:uid(),name:`Assembly ${project.pages.length+1}`,blocks:[]};project.pages.push(p);project.activePageId=p.id;selected='';insertParent=undefined;},true,'assembly:new-page');closeModal();break;
    case 'assembly-brief': await saveFile('ASSEMBLY-BRIEF.md',assemblyBrief(project,selected,insertionTarget()),'text/markdown');break;
    case 'assembly-log': if(assemblyRun)await saveFile(`assembly-${assemblyRun.id}.json`,JSON.stringify({...assemblyRun,scope:'Editor receipts only; not a model trace, video, or usage report.'},null,2),'application/json');break;
    case 'assembly-review': if(assemblyRun?.projectId!==project.id){toast('실행을 시작한 프로젝트로 돌아가세요.');break;}recordRun('review:requested',{approved:false});if(assemblyRun&&assemblyRun.status!=='ended'){assemblyRun.status='review-requested';storeRun();}refreshAssemblyBar();agentModal();break;
    case 'assembly-end': recordRun('run:ended');if(assemblyRun){assemblyRun.status='ended';assemblyRun.endedAt=new Date().toISOString();storeRun();}refreshAssemblyBar();agentModal();break;
    case 'fit-app': zoom=Math.max(25,Math.min(100,Math.floor(((app.querySelector('.canvas-scroll')?.clientWidth??768)-48)/1440*100)));device='desktop';render();break;
    case 'moa-recipe': if(project.pages.length>=30){toast('최대 30개 페이지를 지원합니다.');break;}zoom=45;commit(()=>{const page=moaPage();project.pages.push(page);project.activePageId=page.id;selected=page.blocks[0].id;});toast('Moa 앱 · 개별 노드 편집 / Preview에서 작업 상호작용 · 기존 페이지 보존');break;
    case 'pointer-lab': if(project.pages.length>=30){toast('최대 30개 페이지를 지원합니다.');break;}commit(()=>{const page=pointerLabPage();project.pages.push(page);project.activePageId=page.id;selected=page.blocks.find(b=>b.kind==='cards')!.id;});toast('Pointer lab · 기존 페이지는 보존됩니다');break;
    case 'undo': history('undo'); break;
    case 'redo': history('redo'); break;
    case 'tab': tab = el.dataset.tab as typeof tab; render(); break;
    case 'page': commit(() => { project.activePageId = el.dataset.id!; selected = currentPage(project).blocks[0]?.id ?? ''; }); break;
    case 'select': selected = el.dataset.id!; render(); {const target=document.querySelector<HTMLElement>(`[data-block-id="${selected}"]`),scroll=app.querySelector<HTMLElement>('#canvas-scroll');if(target&&scroll){const top=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top+scroll.scrollTop;scroll.scrollTop=Math.max(0,top-40);scroll.dispatchEvent(new Event('scroll'));}} break;
    case 'desktop': case 'mobile': device = act; render(); break;
    case 'zoom': zoom = zoom === 100 ? 85 : zoom === 85 ? 70 : zoom===70 ? 125 : 100; render(); break;
    case 'systems': designBridgeModal(); break;
    case 'choose-system': commit(() => { project.system = { ...systems.find(s => s.id === el.dataset.system)! }; }); closeModal(); toast(ui('Design system applied to every page','모든 페이지에 디자인 시스템을 적용했습니다')); break;
    case 'brief': briefModal(); break;
    case 'brief-preset': modalRoot.querySelector<HTMLTextAreaElement>('[name="brief"]')!.value = el.dataset.value!; break;
    case 'autofill': vibeFormDraft=null;autofillModal(); break;
    case 'vibe-back': autofillModal();break;
    case 'vibe-retry-replace': {if(!vibeFormDraft)break;vibeFormDraft.set('replace','on');autofillModal();modalRoot.querySelector<HTMLFormElement>('#vibe-form')?.requestSubmit();break;}
    case 'brand-kit': showModal(ui('Aphrodite brand kit','Aphrodite 브랜드 키트'),ui('Paper Muse · Editorial collage','Paper Muse · 에디토리얼 콜라주'),brandHtml(),true); break;
    case 'apply-omd': {
      const before=fingerprint(project),id=el.dataset.source!;
      const response=await fetch('/design-sources/'+id+'.md');if(!response.ok)throw new Error('Bundled reference not available');
      const system=await verifyReference(id,await response.text());
      if(before!==fingerprint(project))throw new Error('Project changed. Select the reference again.');
      commit(()=>{project.system=system;},true,'design:apply-source');closeModal();toast('원문·SHA-256·제품 토큰을 보존했습니다. 전체 DS 적용은 아닙니다.');break;
    }
    case 'omd-issue': {
      const id=el.dataset.source!,source=referenceSources.find(s=>s.id===id);
      const proposal=referenceIssue(id,source?.unmapped.join(', ')??'Missing component coverage');
      showModal(ui('oh-my-design issue proposal','oh-my-design 이슈 제안'),'로컬 제안입니다. GitHub에는 아직 등록하지 않습니다.', '<pre class="export-code">'+esc(proposal)+'</pre>'+button('save-omd-issue','download','Download issue proposal','primary-button','data-source="'+id+'"'),true);break;
    }
    case 'save-omd-issue': {
      const id=el.dataset.source!,source=referenceSources.find(s=>s.id===id);
      await saveFile('omd-'+id+'-coverage-issue.md',referenceIssue(id,source?.unmapped.join(', ')??'Coverage'),'text/markdown');break;
    }
    case 'vibe-image': pickFile('image/png,image/jpeg,image/webp',async file=>{
      const form=modalRoot.querySelector<HTMLFormElement>('#vibe-form'),values=form?new FormData(form):null;
      vibeImage=await readImage(file);autofillModal();
      if(values){const next=modalRoot.querySelector<HTMLFormElement>('#vibe-form')!;for(const name of ['pack','language'])(next.elements.namedItem(name) as HTMLSelectElement).value=String(values.get(name));for(const name of ['copy','images','replace'])(next.elements.namedItem(name) as HTMLInputElement).checked=values.has(name);}
    });break;
    case 'apply-vibe': {
      if(!vibePending||vibePending.revision!==fingerprint(project))throw new Error('미리보기 이후 프로젝트가 바뀌었습니다. 다시 Preview하세요.');
      const plan=vibePending.plan;
      commit(()=>{const page=currentPage(project);applyVibe(page.blocks,plan);if(plan.language)project.contentLanguage=plan.language;page.vibeReceipt={packId:plan.packId,changedFields:plan.changes.length,source:'local-authored-demo',imageSource:plan.changes.some(c=>c.field==='image'&&c.after.startsWith('data:'))?'user-upload':plan.changes.some(c=>c.field==='image')?'bundled-generated':'none',modelCalled:false};},true,'vibe:apply');
      recordRun('vibe:receipt',{packId:plan.packId,changedFields:plan.changes.map(c=>({nodeId:c.id,field:c.field})),unsupported:plan.unsupported,missingAssets:plan.missingAssets,missingImageSlots:plan.missingImageSlots,imagesRequested:plan.imagesRequested,source:'local-authored-demo',modelCalled:false});
      vibePending=null;vibeImage='';vibeFormDraft=null;closeModal();toast(plan.changes.length+'개 필드 적용 · Undo로 전체 복원');break;
    }
    case 'add': addBlock(el.dataset.kind as BlockKind); break;
    case 'component-explorer': explorerModal();break;
    case 'explorer-variant-pick': explorerVariant=el.dataset.variant||explorerVariant;explorerModal();break;
    case 'explorer-reset': explorerFilter={...emptyCatalogFilter};explorerGroup='All';explorerModal(false);break;
    case 'explorer-group': explorerGroup=el.dataset.group!;explorerModal();break;
    case 'explorer-kind-pick': if(catalog.some(c=>c.kind===el.dataset.kind)){explorerKind=el.dataset.kind as BlockKind;explorerModal();modalRoot.querySelector<HTMLElement>(`[data-action="explorer-kind-pick"][data-kind="${explorerKind}"]`)?.focus();}break;
    case 'explorer-pin': {const c=parseCatalogChoice(JSON.stringify({kind:el.dataset.kind,provider:el.dataset.provider,variant:el.dataset.variant}));if(!c)break;const result=pinShelf(project,c);if(result==='added'){persist();await flushDisk();tab='components';shelfPageIndex=Math.floor(((project.shelf?.length??1)-1)/4);rerenderPreservingScroll(app,render);}refreshExplorerPins();toast(result==='full'?ui('Shelf full (12). Remove an item first.','선반이 가득 찼습니다(12개). 먼저 항목을 제거하세요.'):result==='duplicate'?ui('Already on this project shelf','이미 이 프로젝트 선반에 있습니다'):ui('Pinned. Keep comparing or assemble from shelf.','담았습니다. 계속 비교하거나 선반에서 조립하세요.'));break;}
    case 'shelf-add': {const c=project.shelf?.[Number(el.dataset.index)];if(c)addBlock(c.kind,undefined,c);break;}
    case 'shelf-page': shelfPageIndex=Number(el.dataset.index);rerenderPreservingScroll(app,render);app.querySelector<HTMLElement>(`.shelf-pagination [aria-current="page"]`)?.focus();break;
    case 'shelf-inspect': {const c=project.shelf?.[Number(el.dataset.index)];if(c)inspectChoice(c,'shelf');break;}
    case 'explorer-inspect': {const c=parseCatalogChoice(JSON.stringify({kind:el.dataset.kind,provider:el.dataset.provider,variant:el.dataset.variant}));if(c)inspectChoice(c,'catalog');break;}
    case 'inspection-back': {const origin=inspection?.origin;inspection=null;if(origin==='catalog')explorerModal();else closeModal();break;}
    case 'inspection-add': {
      if(!inspection)break;const review=inspection;
      if(review.projectId!==project.id||review.pageId!==project.activePageId||review.parentId!==insertionTarget())throw new Error(ui('Insertion context changed. Inspect again.','삽입 위치가 바뀌었습니다. 다시 확인해주세요.'));
      closeModal();inspection=null;addBlock(review.choice.kind,undefined,review.choice);break;
    }
    case 'shelf-remove': if(project.shelf){project.shelf=project.shelf.filter((_,i)=>i!==Number(el.dataset.index));persist();await flushDisk();render();}break;
    case 'theme-review': themeReview(true);break;
    case 'proposal-blue': case 'proposal-green': themeDraft=themeProposal(project,act==='proposal-blue'?'#2255cc':'#176448',themeDraft?.candidate.system.font??project.system.font);themeReview();break;
    case 'proposal-apply': if(themeDraft){const draft=themeDraft;commit(()=>applyThemeProposal(project,draft),true,'theme:draft-applied');closeModal();themeDraft=null;toast(ui('Theme draft applied. Direction approval still required.','테마 초안 적용. 디자인 방향 승인은 별도입니다.'));}break;
    case 'proposal-full': if(themeDraft){showModal(ui('Proposed screen','제안 화면'),ui('Not applied · scroll to review the whole page','아직 미적용 · 스크롤하여 전체 페이지 확인'),`<iframe class="preview-frame" title="Proposed screen only" sandbox="allow-scripts"></iframe><button class="secondary-button" data-action="proposal-back">${ui('Back to comparison','비교로 돌아가기')}</button>`,true);mountPagePreview(modalRoot.querySelector<HTMLIFrameElement>('iframe')!,themeDraft.candidate,currentPage(themeDraft.candidate));}break;
    case 'proposal-back': themeReview();break;
    case 'proposal-export': if(themeDraft)await saveFile('aphrodite-theme-draft.zip',await exportBundle(themeDraft.candidate),'application/zip');break;
    case 'explorer-add': closeModal();addBlock(el.dataset.kind as BlockKind,undefined,{provider:el.dataset.provider!,variant:el.dataset.variant!});break;
    case 'add-section': case 'assemble-focus': tab = 'components'; render(); document.querySelector<HTMLInputElement>('#component-search')?.focus(); break;
    case 'move-up': case 'move-down': if (b) commit(() => { const from = blocks.indexOf(b), to = from + (act === 'move-up' ? -1 : 1); if (to >= 0 && to < blocks.length) [blocks[from], blocks[to]] = [blocks[to], blocks[from]]; }); break;
    case 'duplicate-block': if (blocks.length >= 100) { toast('페이지당 최대 100개 컴포넌트를 지원합니다.'); break; } if (b) commit(() => { const copy = { ...b, id: uid() }; blocks.splice(blocks.indexOf(b) + 1, 0, copy); selected = copy.id; }); break;
    case 'delete-block': if (b) { commit(() => { blocks.forEach(child=>{if(child.parentId===b.id)child.parentId=b.parentId;});blocks.splice(blocks.indexOf(b), 1); selected = ''; }); toast(ui('Component removed · Children preserved · Undo to restore','컴포넌트를 삭제했습니다 · 자식은 유지됩니다 · 실행 취소로 복원')); } break;
    case 'apply-asset': if (b && ['hero', 'products'].includes(b.kind)) { commit(() => { b.image = `/assets/${el.dataset.asset}.jpg`; }); toast(ui('Image applied','이미지를 적용했습니다')); } else toast('먼저 Hero 또는 Collection 컴포넌트를 선택해주세요.'); break;
    case 'collection-image': case 'collection-image-clear': case 'collection-image-demo': {
      if(b?.kind!=='products')break;const index=Number(el.dataset.index);if(!Number.isInteger(index)||index<0||index>=Math.min(30,b.text.split('\n').length))break;
      const projectId=project.id,blockId=b.id;
      const assign=(image:string)=>{const node=currentPage(project).blocks.find(n=>n.id===blockId);if(project.id!==projectId||node?.kind!=='products')return;commit(()=>{const images=[...(node.itemImages??[])];while(images.length<=index)images.push(node.image);images[index]=image;node.itemImages=images;},true,'collection:image');};
      if(act==='collection-image-clear')assign('');else if(act==='collection-image-demo')assign('/assets/lighting-hero.png');else pickFile('image/png,image/jpeg,image/webp',async file=>assign(await readImage(file)));break;
    }
    case 'block-image': if (b) pickFile('image/png,image/jpeg,image/webp', async file => { const image = await readImage(file); commit(() => { b.image = image; }); toast(ui('Image updated','이미지를 업데이트했습니다')); }); break;
    case 'reference': referenceModal(); break;
    case 'demo-reference': { const response = await fetch('/assets/demo-reference.jpg'); if (!response.ok) throw new Error('샘플을 읽지 못했습니다.'); const data = await readImage(new File([await response.blob()], 'reference.jpg', { type: 'image/jpeg' })); commit(() => { project.reference = data; }); referenceModal(); break; }
    case 'analyze-reference': {
      if (!project.reference) break;
      const source = project.reference, generation = ++analysisGeneration;
      referenceDraft = null;
      showModal(ui('Finding the useful details.','유용한 단서를 찾는 중입니다.'), '이미지의 색상·영역과 macOS OCR 문구를 로컬에서 분석 중입니다.', `<div class="analysis-loading"><span class="analysis-spinner"></span><strong>${ui('Reading your reference…','레퍼런스를 읽는 중…')}</strong><p>${ui('No upload. No generation credits.','업로드 없음. 생성 비용 없음.')}</p><small>닫으면 결과를 적용하지 않습니다.</small></div>`);
      try { const result = await analyzeReference(source); if (generation === analysisGeneration && project.reference === source) { referenceAnalysis = result; analysisModal(); } }
      catch (error) { if (generation === analysisGeneration) { referenceModal(); throw error; } }
      break;
    }
    case 'review-reference': analysisModal(); { const checkbox = modalRoot.querySelector<HTMLInputElement>('#reference-use-crop'); if (checkbox) checkbox.checked = referenceDraft?.useCrop ?? false; } break;
    case 'compare-directions': {
      if (!referenceAnalysis) break;
      const title = modalRoot.querySelector<HTMLTextAreaElement>('#reference-title')!.value.trim();
      if (!title) { toast('제목을 입력해주세요.'); break; }
      const copy = { title, text: modalRoot.querySelector<HTMLTextAreaElement>('#reference-copy')!.value, label: modalRoot.querySelector<HTMLInputElement>('#reference-label')!.value, eyebrow: 'A NEW PERSPECTIVE' };
      referenceDraft = { copy, useCrop: !!modalRoot.querySelector<HTMLInputElement>('#reference-use-crop')?.checked };
      candidatePages = composeDirections(project, referenceAnalysis, copy, referenceDraft.useCrop); compareModal(); break;
    }
    case 'choose-direction': {
      if (project.pages.length >= 30) { toast('최대 30개 페이지를 지원합니다.'); break; }
      const candidate = candidatePages[Number(el.dataset.index)]; if (!candidate) break;
      commit(() => { const page = structuredClone(candidate); project.pages.push(page); project.activePageId = page.id; selected = page.blocks.find(b => b.kind === 'hero')!.id; });
      candidatePages = []; closeModal(); toast(ui('Direction added · Edit any component · Undo available','방향을 추가했습니다 · 컴포넌트를 편집하세요 · 실행 취소 가능')); break;
    }
    case 'upload-reference': pickFile('image/png,image/jpeg,image/webp', async file => { const image = await readImage(file); commit(() => { project.reference = image; }); referenceModal(); }); break;
    case 'remove-reference': commit(() => { delete project.reference; }); referenceModal(); break;
    case 'import-md': pickFile('.md,text/markdown,text/plain', async file => { const s = importDesignMarkdown(await file.text(), file.name, project.system); commit(() => { project.system = s; }); closeModal(); toast('색상 토큰을 가져왔습니다. 원본 DESIGN.md도 보존됩니다.'); }); break;
    case 'design-md': showModal(ui('Your design, in writing.','글로 적은 디자인.'), '현재 작업의 토큰과 컴포넌트 계약입니다. OmD 전체 규격 검증은 아직 연결되지 않았습니다.', `<pre class="export-code">${esc(designMarkdown(project))}</pre>${button('save-design', 'download', 'Save DESIGN.md', 'primary-button')}`, true); break;
    case 'save-design': if (await saveFile('DESIGN.md', designMarkdown(project), 'text/markdown')) toast(ui('DESIGN.md saved','DESIGN.md를 저장했습니다')); break;
    case 'approve': if(editorMode==='agent'){toast(ui('Approval stays with you: leave Agent mode first.','승인은 사람의 몫입니다. 먼저 에이전트 모드를 끝내세요.'));break;}
    case 'approve-human-only': if (isApproved(project)) exportModal(); else { commit(() => { project.approvedFingerprint = fingerprint(project); }); toast(ui('Direction approved. 다음 단계로 가져갈 준비가 됐습니다.','방향이 승인됐습니다. 다음 단계로 가져갈 준비가 됐습니다.')); } break;
    case 'approve-export': commit(() => { project.approvedFingerprint = fingerprint(project); }); exportModal(); break;
    case 'export': exportModal(); break;
    case 'export-tab': exportModal(el.dataset.view); break;
    case 'copy-prompt': try { await navigator.clipboard.writeText(buildPrompt(project)); toast(ui('Prompt copied','프롬프트를 복사했습니다')); } catch { toast('클립보드 권한을 사용할 수 없습니다. ZIP의 PROMPT.md를 이용해주세요.'); } break;
    case 'download-bundle': { el.setAttribute('disabled', ''); try { const bytes = await exportBundle(project);const accepted=await saveFile(fileName(project, 'zip'), bytes, 'application/zip');recordRun('handoff:save-returned',{saveApiAccepted:accepted,byteLength:bytes.length,artifactIndependentlyVerified:false});if(accepted)toast(ui('Handoff exported · Your direction travels with it','핸드오프를 내보냈습니다 · 방향이 함께 갑니다')); } finally { el.removeAttribute('disabled'); } break; }
    case 'preview': recordRun('preview:opened',{device,interactionCapture:false});showModal(ui('A moment to see the whole picture.','전체 화면을 잠시 보세요.'), `${esc(currentPage(project).name)} · ${device === 'mobile' ? ui('375px mobile','375px 모바일') : ui('Responsive desktop','반응형 데스크탑')} ${ui('preview','미리보기')}`, `<iframe class="preview-frame ${device}" title="${ui('Live design preview','실시간 디자인 미리보기')}" sandbox="allow-scripts"></iframe>`, true); { const frame = modalRoot.querySelector<HTMLIFrameElement>('iframe')!; mountPagePreview(frame,project,currentPage(project)); } break;
    case 'close-modal': closeModal(); break;
    case 'project': showModal(ui('A place for your next idea.','다음 아이디어를 위한 자리.'), '프로젝트를 파일로 보관하고, 언제든 다시 이어서 작업하세요.', `<form id="rename-form"><label class="form-label">${ui('Project name','프로젝트 이름')}<input name="name" required maxlength="100" value="${esc(project.name)}"></label><button class="primary-button" type="submit">${ui('Rename project','프로젝트 이름 변경')}</button></form><div class="project-menu-actions">${button('save-project', 'download', 'Save project', 'secondary-button')}${button('import-project', 'folder-open', 'Open project', 'secondary-button')}${button('new-project', 'plus', 'New project', 'secondary-button')}${button('vault-open','folder','Project files','secondary-button')}</div><p class="fine-print">각 프로젝트는 보관함에 자동 저장됩니다. 프로젝트 간 Undo는 분리됩니다. 기기 밖 백업은 Save project를 사용하세요.</p>`); break;
    case 'disk-backup': if(await saveFile(fileName(project,'aphrodite.json'),JSON.stringify(project,null,2),'application/json'))toast(ui('Backup saved','백업을 저장했습니다')); break;
    case 'disk-reload': await reloadFromDisk(); break;
    case 'save-project': if (await saveFile(fileName(project, 'aphrodite.json'), JSON.stringify(project, null, 2), 'application/json')) toast(ui('Project saved','프로젝트를 저장했습니다')); break;
    case 'import-project': await guardSwitch();pickFile('.json,application/json', async file => { if (file.size > 20_000_000) throw new Error('프로젝트는 20MB 이하여야 합니다.'); await guardSwitch();let loaded = parseProject(await file.text());if(library.entries.some(e=>e.project.id===loaded.id))loaded=cloneProject(loaded);saveLibrary(upsertProject(library,loaded));await flushDisk();openProject(loaded);toast(ui('Project imported · 기존 프로젝트는 보존됩니다.','프로젝트를 가져왔습니다 · 기존 프로젝트는 보존됩니다.')); }); break;
    case 'new-project': await guardSwitch();showModal(ui('Room for something new.','새로운 것을 위한 자리.'), '기존 프로젝트는 보관함에 그대로 남습니다. 언제든 다시 열 수 있습니다.', `<form id="new-project-form"><label class="form-label">${ui('Project name','프로젝트 이름')}<input name="name" required maxlength="100" placeholder="${ui('Your next idea','다음 아이디어')}" value="Untitled project"></label><button class="primary-button full-width" type="submit">${ui('Create project','프로젝트 만들기')}</button></form>`); break;
    case 'add-page': showModal(ui('A new page. The same point of view.','새 페이지. 같은 관점.'), '프로젝트의 디자인 시스템을 그대로 이어받습니다.', `<form id="page-form"><label class="form-label">${ui('Page name','페이지 이름')}<input name="name" required maxlength="60" placeholder="${ui('About, Collection, Contact...','소개, 컬렉션, 연락처…')}"></label><button class="primary-button full-width" type="submit">${ui('Create page','페이지 만들기')}</button></form>`); break;
    case 'page-menu': showModal(ui('Make this page your own.','이 페이지를 당신답게.'), '페이지 이름을 바꾸거나 복제해 다음 화면의 시작점으로 쓰세요.', `<form id="page-rename-form"><label class="form-label">${ui('Page name','페이지 이름')}<input name="name" required maxlength="60" value="${esc(currentPage(project).name)}"></label><button class="primary-button" type="submit">${ui('Rename page','페이지 이름 변경')}</button></form><div class="project-menu-actions">${button('duplicate-page', 'copy', 'Duplicate page', 'secondary-button')}${button('delete-page', 'trash-2', 'Delete page', 'secondary-button', project.pages.length === 1 ? 'disabled' : '')}</div>`); break;
    case 'duplicate-page': if (project.pages.length >= 30) { toast('최대 30개 페이지를 지원합니다.'); break; } commit(() => { const page = { ...currentPage(project), id: uid(), name: `${currentPage(project).name} copy`.slice(0, 100), blocks: cloneBlocks(blocks) }; project.pages.push(page); project.activePageId = page.id; selected = ''; }); closeModal(); break;
    case 'delete-page': if (project.pages.length > 1) { commit(() => { project.pages = project.pages.filter(p => p.id !== project.activePageId); project.activePageId = project.pages[0].id; selected = ''; }); closeModal(); toast(ui('Page removed · Undo to restore','페이지를 삭제했습니다 · 실행 취소로 복원')); } break;
    case 'agent': agentModal();break;
    case 'about': showModal(ui('Shape before you build.','만들기 전에, 방향부터.'), '긴 코드 생성 전에, 디자인 방향부터 함께 확인하세요.', `<div class="about-mark">a<span>✳</span></div><p class="about-copy">${ui('Codex assembles. You choose the direction.','Codex가 조립합니다. 방향은 당신이 정합니다.')}</p><div class="modal-note">Tauri 기반 로컬 프로토타입 · ${catalog.length}가지 컴포넌트 · 공식 라이브러리 어댑터 · ${systems.length}가지 스타일 · 에이전트 조립 컨텍스트·로컬 실행 기록 · HTML / 프롬프트 / DESIGN.md 내보내기. 앱 내부 모델 실행, 이미지 생성, OmD 전체 하네스 검증은 후속 범위입니다.</div>${button('agent', 'sparkles', 'See the computer-use workflow', 'secondary-button full-width')}`); break;
  }
}
document.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  document.querySelectorAll<HTMLDetailsElement>('details.folio-more[open],details.folio-lang[open]').forEach(d=>{if(!d.contains(target))d.open=false;});
  if (target.classList.contains('modal-backdrop')) { closeModal(); return; }
  const control = target.closest<HTMLElement>('[data-action]');
  if (control?.hasAttribute('data-palette')) closeModal();
  if (control) { e.preventDefault(); void action(control).catch(error => {recordRun('action:failed',{action:control.dataset.action});toast(error instanceof Error ? error.message : '작업을 완료하지 못했습니다.');}); return; }
  const block = target.closest<HTMLElement>('[data-block-id]');
  if (block && target.closest('.kit') && target.closest('input,select,button,label')) return;
  if (block) { e.preventDefault(); selected = block.dataset.blockId!; const scroll = document.querySelector('#canvas-scroll')!.scrollTop; render(); document.querySelector('#canvas-scroll')!.scrollTop = scroll; }
});
document.addEventListener('input', e => {
  if((e.target as HTMLElement).id==='command-search'){renderPaletteList((e.target as HTMLInputElement).value);return;}
  const target = e.target as HTMLInputElement;
  if(target.id==='proposal-color'||target.id==='proposal-font'){themeDraft=themeProposal(project,target.id==='proposal-color'?target.value:themeDraft!.candidate.system.accent,target.id==='proposal-font'?target.value as 'serif'|'sans':themeDraft!.candidate.system.font);themeReview();return;}
  if(target.id==='project-search'){hubQuery=target.value;document.querySelector('#project-grid')!.innerHTML=projectCards(library,hubFilter,hubQuery,uiLanguage,hubView);return;}
  if (target.id === 'component-search') { query = target.value; document.querySelector('.component-list')!.innerHTML = componentCards(); hydrateIcons(); bindDragAndDrop(); }
});
document.addEventListener('change', e => {
  if(screen==='home')return;
  const target = e.target as HTMLInputElement;
  if(target.id==='explorer-kind'){explorerKind=target.value as BlockKind;explorerModal();modalRoot.querySelector<HTMLElement>('#explorer-kind')?.focus();return;}
  if(target.id==='inspection-width'&&inspection){const width=Number(target.value);if([375,768,960,1440].includes(width)){inspection.width=width;inspectionModal();modalRoot.querySelector<HTMLElement>('#inspection-width')?.focus();}return;}
  if(target.id==='explorer-variant'){explorerVariant=target.value;explorerModal();modalRoot.querySelector<HTMLElement>('#explorer-variant')?.focus();return;}
  const b = currentPage(project).blocks.find(b => b.id === selected);
  const scroll = document.querySelector('#canvas-scroll')!.scrollTop;
  if (target.dataset.field && b) {
    const key = target.dataset.field as 'title' | 'text' | 'label' | 'eyebrow' | 'description';
    if(!['title','text','label','eyebrow','description'].includes(key)||(key==='description'&&b.kind!=='products'))return;
    const value=target.value.slice(0,key==='eyebrow'?200:key==='description'?2000:20000);
    if (b[key] === value) return;
    commit(() => { b[key] = value; b.filled = true; }, false);
    // Keep the inspector's DOM stable on blur so the user's next click is not lost.
    const wrap = document.querySelector<HTMLElement>(`[data-block-id="${b.id}"]`)!;
    if(b.kind==='frame'){
      wrap.setAttribute('aria-label',`${b.title} frame block`);
      const name=wrap.querySelector<HTMLElement>(':scope > .editor-frame-name');if(name)name.textContent=b.title;
      const frame=wrap.querySelector<HTMLElement>(':scope > .layout-frame');frame?.setAttribute('aria-label',b.title);
      const lane=frame?.querySelector<HTMLElement>(':scope > .moa-lane-title');if(lane)lane.textContent=b.title;
    }else{
      const label = wrap.querySelector('.block-selection-label')!.outerHTML;
      wrap.innerHTML = label + blockHtml(b,project);
    }
    const move=document.querySelector<HTMLElement>('.editor-move');if(move){move.textContent=`↔ ${b.title.slice(0,30)}`;move.setAttribute('aria-label',`Move ${b.title}`);}
    document.querySelectorAll<HTMLElement>('.editor-handle').forEach(h=>h.setAttribute('aria-label',`Resize ${b.title} ${h.dataset.handle}`));
    document.querySelector('[data-action="undo"]')?.removeAttribute('disabled');
    document.querySelector('[data-action="redo"]')?.setAttribute('disabled', '');
    const badge = document.querySelector('.draft-badge')!; badge.textContent = control('Draft'); badge.classList.remove('approved');
    const filled = document.querySelector('.selected-component-label>span'); if (filled) filled.textContent = control('Filled');
    const review = document.querySelector('.review-card')!;
    review.querySelector('strong')!.textContent = ui('Like where this is going?','이 방향으로 갈까요?');
    review.querySelector('p')!.textContent = '화면을 확인하고 디자인 방향을 확정하세요.';
    const approve = review.querySelector('button')!; approve.className = 'approve-button'; approve.innerHTML = icon('check') + `<span>${control('Approve direction')}</span>`;
    hydrateIcons();
  }
  else if(target.id==='component-provider' && b && supportsProvider(target.value,b.kind)) commit(()=>{b.provider=target.value as keyof typeof providers;if(!supportsComponentTheme(b))delete b.theme;});
  else if(target.id==='component-theme-mode'&&b&&supportsComponentTheme(b)&&['project','source','custom'].includes(target.value))commit(()=>{b.theme=target.value==='custom'?{mode:'custom',accent:componentAccent(b,project.system.accent)}:{mode:target.value as ComponentTheme['mode']};},true,'theme:component-policy');
  else if(['component-theme-accent','component-theme-hex'].includes(target.id)&&b&&supportsComponentTheme(b)){if(!/^#[a-f0-9]{6}$/i.test(target.value)){target.value=componentAccent(b,project.system.accent);toast(ui('Use six-digit HEX, for example #2255cc','6자리 HEX를 입력하세요. 예: #2255cc'));return;}commit(()=>{b.theme={mode:'custom',accent:target.value};},true,'theme:component-color');}
  else if(target.id==='parent-frame' && b && canParent(currentPage(project).blocks,b.id,target.value||undefined)) commit(()=>{b.parentId=target.value||undefined;});
  else if(target.dataset.layout && b) {const layout={...b.layout,[target.dataset.layout]:Number(target.value)};if(target.dataset.layout==='width')delete layout.widthPx;if(validLayout(layout))commit(()=>{b.layout=layout;});else{toast('레이아웃 입력 범위를 확인해주세요.');render();}}
  else if(target.dataset.kitOption==='layout-mode' && b?.kind==='frame' && ['flow','free'].includes(target.value)) commit(()=>{b.layout={...b.layout,mode:target.value as 'flow'|'free'};});
  else if (target.id === 'hero-variant' && b?.kind === 'hero' && patternVariants('hero').includes(target.value)) commit(() => { b.variant = target.value; });
  else if (target.dataset.kitOption && b) {
    const key=target.dataset.kitOption;
    if (key==='variant' && patternVariants(b.kind).includes(target.value)) commit(()=>{b.variant=target.value;});
    else if (['state','density','columns','media','mediaText','placeholder'].includes(key)) commit(()=>{b.options={...b.options,[key]:key==='columns'?Number(target.value):target.value.slice(0,key==='placeholder'?200:20000)} as PatternOptions;});
  }
  else if (target.dataset.token) { const token = target.dataset.token as 'accent' | 'background' | 'foreground'; commit(() => { project.system[token] = target.value; }); }
  else if (target.id === 'font-select') commit(() => { project.system.font = target.value as 'serif' | 'sans'; });
  else if (target.id === 'radius-select') commit(() => { project.system.radius = Number(target.value); });
  document.querySelector('#canvas-scroll')!.scrollTop = scroll;
});
document.addEventListener('submit', async e => {
  e.preventDefault(); const form = e.target as HTMLFormElement; const data = new FormData(form); const name = String(data.get('name') ?? '').trim();
  if(form.id==='catalog-filter-form'){explorerFilter=normalizeCatalogFilter(String(data.get('query')??''),String(data.get('provider')??'all'));explorerModal();modalRoot.querySelector<HTMLElement>('[aria-label="Search catalog"]')?.focus();return;}
  if(form.id==='language-settings-form'){
    const nextUi=data.get('uiLanguage'),nextContent=data.get('contentLanguage');
    if(!isLanguage(nextUi)||(nextContent!==null&&!isLanguage(nextContent))){toast(ui('Unsupported language.','지원하지 않는 언어입니다.'));return;}
    try{saveUiLanguage(localStorage,nextUi);}catch{toast(ui('Could not save interface preference. Nothing changed.','언어 설정을 저장하지 못했습니다. 변경하지 않았습니다.'));return;}
    uiLanguage=nextUi;
    vibeFormDraft=null;
    if(screen==='editor'&&isLanguage(nextContent)&&nextContent!==(project.contentLanguage??'en'))commit(()=>setContentLanguage(project,nextContent),false,'project:content-language');
    closeModal();render();toast(ui('Language preferences saved. Existing copy preserved.','언어 설정을 저장했습니다. 기존 문구는 유지됩니다.'));return;
  }
  if (['page-form', 'brief-form'].includes(form.id) && project.pages.length >= 30) { toast('최대 30개 페이지를 지원합니다.'); return; }
  if (!['fill-form','vibe-form','assembly-run-form'].includes(form.id) && !name) { toast('이름을 입력해주세요.'); return; }
  if(form.id==='vault-note-form'){try{vaultState=await invoke<Vault>('vault_document',{projectId:vaultProjectId,name,text:String(data.get('text')??'')});await showVault(false);}catch(error){toast(String(error));}return;}
  if(form.id==='vibe-form'){
    vibeFormDraft=data;
    if(!data.has('copy')&&!data.has('images')){toast('채울 항목을 선택하세요.');return;}
    const language=data.get('language');if(language!=='en'&&language!=='ko')throw new Error('Unsupported content language');
    const plan=planVibe(currentPage(project).blocks,String(data.get('pack')),{copy:data.has('copy'),images:data.has('images'),replace:data.has('replace'),image:vibeImage,language,brandName:project.name});
    vibePending={plan,revision:fingerprint(project)};
    const unsupportedNames=[...new Set(plan.unsupported.map(id=>catalog.find(c=>c.kind===currentPage(project).blocks.find(b=>b.id===id)?.kind)?.name).filter((n):n is string=>!!n))];
    showModal(ui('Review Get Vibe changes','Get Vibe 변경 검토'),ui('Not applied yet. Review before applying.','아직 적용되지 않았습니다. 확인 후 적용하세요.'),vibePreviewHtml(plan,uiLanguage,unsupportedNames,data.has('replace')),true);return;
  }
  if(form.id==='agent-mode-form'){startAgentMode(String(data.get('operator')??'').slice(0,100),String(data.get('intent')??'').slice(0,1200));return;}
  if(form.id==='assembly-run-form'){
    if(assemblyRun&&assemblyRun.status!=='ended'){toast('현재 실행을 먼저 종료하세요.');return;}
    assemblyRun=newRun(project,String(data.get('intent')??''),String(data.get('model')??''),innerWidth,innerHeight);recordRun('run:started',{zoom,device,selectedId:selected,insertParentId:insertionTarget()??null,referencePresent:!!project.reference});closeModal();refreshAssemblyBar();toast(ui('Assembly run 시작 · 로컬 편집 기록만 수집합니다.','조립 실행을 시작했습니다 · 로컬 편집 기록만 수집합니다.'));return;
  }
  if (form.id === 'brief-form') {
    const brief = String(data.get('brief')).trim(); if (!brief) return;
    commit(() => { project.name = name; project.brief = brief; const page = { id: uid(), name: `Draft ${project.pages.length + 1}`, blocks: assemble(brief).map(k => makeBlock(k)) }; project.pages.push(page); project.activePageId = page.id; selected = page.blocks[1]?.id ?? ''; }); closeModal(); toast(ui('Draft assembled · Auto fill로 분위기를 확인해보세요.','초안을 조립했습니다 · Get Vibe로 분위기를 확인해보세요.'));
  } else if (form.id === 'fill-form') {
    if (!data.has('copy') && !data.has('images')) { toast('채울 콘텐츠를 한 가지 이상 선택해주세요.'); return; }
    let changed = 0;
    commit(() => { for (const b of currentPage(project).blocks) { const sample = makeBlock(b.kind, true); if (data.has('copy') && (!b.filled || data.has('replace'))) { b.title = sample.title; b.text = sample.text; b.label = sample.label; b.filled = true; changed++; } if (data.has('images') && sample.image && (!b.image || data.has('replace'))) { b.image = sample.image; changed++; } } }); closeModal(); toast(changed ? ui('Filled with local sample content · Undo available','로컬 샘플 콘텐츠로 채웠습니다 · 실행 취소 가능') : '모두 채워져 있습니다. 교체하려면 Replace existing content를 선택해주세요.');
  } else if (form.id === 'rename-form') { commit(() => { project.name = name; }); closeModal(); }
  else if (form.id === 'page-rename-form') { commit(() => { currentPage(project).name = name; }); closeModal(); }
  else if (form.id === 'page-form') { commit(() => { const page = { id: uid(), name, blocks: [] }; project.pages.push(page); project.activePageId = page.id; selected = ''; }); closeModal(); }
  else if (form.id === 'new-project-form' || form.id==='hub-rename-form') {try{await guardSwitch();if(form.id==='new-project-form'){const next=initialProject();next.name=name.slice(0,100);next.brief='';next.pages[0].blocks=[];saveLibrary(upsertProject(library,next));await flushDisk();openProject(next);}else{const entry=library.entries.find(e=>e.project.id===data.get('projectId'));if(entry){saveLibrary(upsertProject(library,{...entry.project,name:name.slice(0,100)}));closeModal();render();}}}catch(error){toast(error instanceof Error?error.message:'프로젝트 저장 실패');} }
});
/** Palette keys: WebKit under an IME can deliver arrows/Enter only on keyup or with keyCode 229, so both events are watched. */
let paletteKeyHandled=false;
/** `code` is IME-independent: under a Korean input source WebKit reports key='Process'/keyCode 229 for arrows and Enter. */
function paletteKey(e:KeyboardEvent){const c=e.code;if(c==='ArrowDown'||c==='ArrowUp')return c;if(c==='Enter'||c==='NumpadEnter')return 'Enter';return e.key==='ArrowDown'||e.key==='Down'||e.keyCode===40?'ArrowDown':e.key==='ArrowUp'||e.key==='Up'||e.keyCode===38?'ArrowUp':e.key==='Enter'||e.keyCode===13?'Enter':'';}
function paletteNavigate(k:'ArrowDown'|'ArrowUp'|'Enter',e:Event){const items=Array.from(modalRoot.querySelectorAll<HTMLButtonElement>('#command-list [data-palette]'));if(!items.length)return;const marked=items.findIndex(b=>b.classList.contains('is-active'));const current=marked>=0?marked:items.indexOf(document.activeElement as HTMLButtonElement);if(k==='Enter'){if(current>=0){e.preventDefault();items[current].click();}else if(items.length===1||modalRoot.querySelector<HTMLInputElement>('#command-search')?.value.trim()){e.preventDefault();items[0].click();}return;}e.preventDefault();const next=k==='ArrowDown'?(current+1)%items.length:(current-1+items.length)%items.length;items.forEach((b,i)=>{b.classList.toggle('is-active',i===next);b.setAttribute('aria-selected',String(i===next));});items[next].scrollIntoView({block:'nearest'});items[next].focus();}
document.addEventListener('keyup',e=>{if(!modalRoot.querySelector('#command-list'))return;const k=paletteKey(e);if(!k)return;if(paletteKeyHandled){paletteKeyHandled=false;return;}paletteNavigate(k,e);});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.code === 'Escape') { const menu=document.querySelector<HTMLDetailsElement>('details.folio-more[open],details.folio-lang[open]'); if(menu){menu.open=false;return;} closeModal(); return; }
  if(screen==='editor'&&(e.metaKey||e.ctrlKey)&&(e.code==='KeyK'||e.key.toLowerCase()==='k')){e.preventDefault();if(modalRoot.querySelector('#command-search'))closeModal();else commandsModal();return;}
  if(modalRoot.querySelector('#command-list')){const k=paletteKey(e);if(k){paletteKeyHandled=true;paletteNavigate(k,e);return;}}
  if (modalRoot.children.length) {
    if (e.key === 'Tab') { const items = Array.from(modalRoot.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,[tabindex="0"]')); const first = items[0], last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } return;
  }
  if ((e.target as HTMLElement).matches('input,textarea,select')) return;
  if(screen==='editor'&&e.key==='?'&&!modalRoot.children.length){e.preventDefault();commandsModal();return;}
  if(screen==='editor'&&!modalRoot.children.length&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&e.key.length===1){const hit=dockShortcut(e.key);if(hit){e.preventDefault();if(hit.mode){const btn=document.querySelector<HTMLElement>(`[data-action="editor-mode"][data-mode="${hit.mode}"]`);if(btn)void action(btn);}else if(hit.tool){const btn=document.querySelector<HTMLElement>(`.dock [data-tool="${hit.tool.id}"]`);if(btn)void action(btn);}return;}}
  if(screen==='home'){if(e.key==='/'){e.preventDefault();document.querySelector<HTMLInputElement>('#project-search')?.focus();}return;}
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(e.shiftKey ? 'redo' : 'undo'); }
  else if (e.key === '/') { e.preventDefault(); tab = 'components'; render(); document.querySelector<HTMLInputElement>('#component-search')?.focus(); }
  else if (e.key === 'Enter' && (e.target as HTMLElement).dataset.blockId) { selected = (e.target as HTMLElement).dataset.blockId!; render(); document.querySelector<HTMLTextAreaElement>('[data-field="title"]')?.focus(); }
});
installPatternRuntime(document);
if(assemblyRun&&assemblyRun.status!=='ended')recordRun('run:resumed',{viewport:{width:innerWidth,height:innerHeight},notice:'Navigation/HMR gap; not continuous timing evidence.'});
function diskWarningHtml(){return `<div class="disk-warning" role="alert">${icon('circle-alert')}<span><strong>${ui('Not saved to disk.','디스크에 저장되지 않았습니다.')}</strong> ${esc(storageIssue)}</span><span class="disk-warning-actions"><button data-action="disk-backup">${ui('Save a backup file','백업 파일로 저장')}</button><button data-action="disk-reload">${ui('Reload from disk','디스크에서 다시 불러오기')}</button></span></div>`;}
function attachDiskQueue(revision:number){return new DurableQueue(revision,(data,expected)=>invoke<number>('workspace_write',{data,expected}),(saved,error)=>{lastSaved=saved;storageIssue=error?String(error):'';document.querySelectorAll('.save-indicator,[data-storage-state]').forEach(el=>{el.textContent=control(saved?'Saved to disk':error?'Unsaved · export a backup':'Saving to disk…');});if(screen==='home'){if(error)render();return;}const banner=document.querySelector('.disk-warning');if(error){if(!banner){app.insertAdjacentHTML('afterbegin',diskWarningHtml());hydrateIcons();}toast(ui('Could not save to disk. Save a backup or reload from disk.','디스크 저장에 실패했습니다. 백업을 저장하거나 디스크에서 다시 불러오세요.'));}else banner?.remove();});}
/** Discard in-memory edits and re-open the on-disk library with a fresh write queue. */
async function reloadFromDisk(){
  if(!nativeDesktop)return;
  const stored=await invoke<{revision:number;data:string|null;path:string}>('workspace_read');
  storagePath=stored.path;
  if(stored.data!==null)library=readLibrary({getItem:k=>k===LIBRARY_KEY?stored.data:null,setItem:()=>{}});
  diskQueue=attachDiskQueue(stored.revision);storageIssue='';startupError='';lastSaved=true;
  const entry=library.entries.find(e=>e.project.id===project.id);
  if(entry&&screen==='editor')openProject(entry.project);else{screen='home';undoStack=[];redoStack=[];}
  render();toast(ui('Reloaded the saved copy. Unsaved edits were discarded.','저장본을 다시 불러왔습니다. 저장되지 않은 편집은 버렸습니다.'));
}
async function boot(){
  if(nativeDesktop){
    app.innerHTML=`<p style="padding:48px">${ui('Opening your local workspace…','로컬 작업 공간을 여는 중…')}</p>`;
    try{
      const stored=await invoke<{revision:number;data:string|null;path:string}>('workspace_read');
      storagePath=stored.path;
      // Disk is authoritative. Only migrate the legacy browser store on first launch.
      if(stored.data!==null){library=readLibrary({getItem:k=>k===LIBRARY_KEY?stored.data:null,setItem:()=>{}});startupError='';}
      diskQueue=attachDiskQueue(stored.revision);
      if(stored.data===null&&!startupError){diskQueue.enqueue(JSON.stringify(library));await flushDisk();}
      if(library.entries[0])project=parseProject(JSON.stringify(library.entries[0].project));
      const {getCurrentWindow}=await import('@tauri-apps/api/window');
      await getCurrentWindow().onCloseRequested(async event=>{if(!lastSaved){event.preventDefault();try{await flushDisk();if(lastSaved)await getCurrentWindow().close();}catch{toast('저장 실패로 종료를 중지했습니다. Save project로 백업하세요.');}}});
    }catch(error){startupError=`파일 저장소를 열지 못했습니다. 원본은 보존됩니다. ${String(error)}`;}
  }
  render();if(startupError)toast(startupError);
}
void boot();
