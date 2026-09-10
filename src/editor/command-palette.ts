import {catalog,type BlockKind} from '../model';
import {esc} from '../html';
import type {Language} from '../i18n';

/** One entry of the in-app command palette. `action`/`data` map 1:1 to the existing data-action dispatcher. */
export type Command={id:string;action:string;data?:Record<string,string>;en:string;ko:string;group:'navigate'|'add'|'edit'|'design'|'review'|'file';keys?:string;hint?:{en:string;ko:string}};

export type PaletteContext={hasSelection:boolean;canUndo:boolean;canRedo:boolean;approved:boolean;viewport:'desktop'|'mobile';kinds?:readonly {kind:BlockKind;name:string}[]};

export function commandTable(ctx:PaletteContext):Command[]{
  const kinds=ctx.kinds??catalog;
  const add:Command[]=kinds.filter(c=>!c.kind.startsWith('moa')).map(c=>({id:`add-${c.kind}`,action:'add',data:{kind:c.kind},en:`Add ${c.name}`,ko:`${c.name} 추가`,group:'add' as const}));
  const base:Command[]=[
    {id:'home',action:'home',en:'All projects (home)',ko:'프로젝트 목록(홈)',group:'navigate'},
    {id:'search',action:'focus-component-search',en:'Find a component',ko:'컴포넌트 검색',group:'navigate',keys:'/'},
    {id:'undo',action:'undo',en:'Undo',ko:'실행 취소',group:'edit',keys:'⌘Z'},
    {id:'redo',action:'redo',en:'Redo',ko:'다시 실행',group:'edit',keys:'⇧⌘Z'},
    {id:'brief',action:'brief',en:'Start from a brief (new draft page)',ko:'브리프로 시작 (새 초안 페이지)',group:'add'},
    {id:'autofill',action:'autofill',en:'Get Vibe · fill sample copy and images',ko:'Get Vibe · 샘플 문구·이미지 채우기',group:'design'},
    {id:'systems',action:'systems',en:'Choose design system (applies to every page)',ko:'디자인 시스템 선택 (모든 페이지 적용)',group:'design'},
    {id:'theme',action:'theme-review',en:'Compare color & font drafts',ko:'색상·폰트 초안 비교',group:'design'},
    {id:'explorer',action:'component-explorer',en:'Compare components across design systems (catalog)',ko:'DS별 컴포넌트 비교 (카탈로그)',group:'design'},
    {id:'reference',action:'reference',en:'Reference image · analyze · 3 directions',ko:'레퍼런스 이미지 · 분석 · 3안 비교',group:'design'},
    {id:'desktop',action:'desktop',en:'Desktop viewport',ko:'데스크톱 뷰포트',group:'review',hint:ctx.viewport==='desktop'?{en:'current',ko:'현재'}:undefined},
    {id:'mobile',action:'mobile',en:'Mobile viewport (375px)',ko:'모바일 뷰포트 (375px)',group:'review',hint:ctx.viewport==='mobile'?{en:'current',ko:'현재'}:undefined},
    {id:'preview',action:'preview',en:'Preview the page (no scripts, same HTML as export)',ko:'페이지 미리보기 (스크립트 없음, export와 동일 HTML)',group:'review'},
    {id:'agent',action:'agent',en:'Agent assembly console · brief & run log',ko:'에이전트 조립 콘솔 · 브리프·실행 기록',group:'review'},
    {id:'export',action:'export',en:'Export handoff (ZIP, prompt, DESIGN.md, SCENE.json)',ko:'핸드오프 내보내기 (ZIP, 프롬프트, DESIGN.md, SCENE.json)',group:'file'},
    {id:'save',action:'save-project',en:'Save project file (.aphrodite.json)',ko:'프로젝트 파일 저장 (.aphrodite.json)',group:'file'},
    {id:'language',action:'language-settings',en:'Language / 언어',ko:'Language / 언어',group:'file'},
  ];
  if(ctx.hasSelection)base.push(
    {id:'duplicate',action:'duplicate',en:'Duplicate selected component',ko:'선택한 컴포넌트 복제',group:'edit'},
    {id:'delete',action:'delete',en:'Delete selected component',ko:'선택한 컴포넌트 삭제',group:'edit'},
    {id:'move-up',action:'move-up',en:'Move selected component up',ko:'선택한 컴포넌트 위로',group:'edit',keys:'⌥↑'},
    {id:'move-down',action:'move-down',en:'Move selected component down',ko:'선택한 컴포넌트 아래로',group:'edit',keys:'⌥↓'},
  );
  return [...base,...add];
}

export function filterCommands(commands:Command[],query:string,language:Language){
  const q=query.trim().toLowerCase();
  if(!q)return commands;
  return commands.filter(c=>`${c.en} ${c.ko} ${c.action} ${c.data?.kind??''}`.toLowerCase().includes(q));
}

const groupLabel:Record<Command['group'],{en:string;ko:string}>={navigate:{en:'Navigate',ko:'이동'},add:{en:'Add component',ko:'컴포넌트 추가'},edit:{en:'Edit',ko:'편집'},design:{en:'Design',ko:'디자인'},review:{en:'Review',ko:'검토'},file:{en:'File',ko:'파일'}};

/** The palette never lists Approve direction: approval stays a deliberate, human click. */
export function commandPaletteHtml(commands:Command[],query:string,language:Language){
  const ko=language==='ko';
  const list=filterCommands(commands,query,language);
  const groups=[...new Set(list.map(c=>c.group))];
  const items=groups.map(g=>`<li class="palette-group" role="presentation"><span>${esc(groupLabel[g][language])}</span><ul role="group">${list.filter(c=>c.group===g).map(c=>`<li><button type="button" role="option" data-palette data-action="${esc(c.action)}"${Object.entries(c.data??{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')}><span>${esc(ko?c.ko:c.en)}</span>${c.hint?`<small>${esc(ko?c.hint.ko:c.hint.en)}</small>`:''}${c.keys?`<kbd>${esc(c.keys)}</kbd>`:''}</button></li>`).join('')}</ul></li>`).join('');
  return `<div class="palette"><label class="palette-search">${ko?'명령 검색':'Search commands'}<input id="command-search" type="search" autocomplete="off" aria-label="${ko?'명령 검색':'Search commands'}" placeholder="${ko?'예: 히어로 추가, 디자인 시스템, 내보내기':'e.g. add hero, design system, export'}" value="${esc(query)}"></label><ul class="palette-list" role="listbox" aria-label="${ko?'명령':'Commands'}" id="command-list">${items||`<li class="palette-empty" role="status">${ko?'일치하는 명령이 없습니다.':'No matching commands.'}</li>`}</ul><p class="palette-footnote">${ko?'⌘K 또는 ? 로 열기 · ↑↓ 이동 · Enter 실행 · Esc 닫기 · “방향 승인”은 항상 화면에서 직접 클릭합니다.':'Open with ⌘K or ? · ↑↓ move · Enter run · Esc close · “Approve direction” is always a direct click on screen.'}</p></div>`;
}

/** One-line editor status for the status bar and for screenshot-reading agents. */
export function stateLine(s:{page:string;blocks:number;selectedKind?:string;selectedName?:string;system:string;approved:boolean;viewport:'desktop'|'mobile';saved:boolean;language:Language}){
  const ko=s.language==='ko';
  const parts=[
    `${ko?'페이지':'Page'} ${s.page}`,
    `${s.blocks} ${ko?'컴포넌트':'components'}`,
    s.selectedKind?`${ko?'선택':'Selected'} ${s.selectedName||s.selectedKind}`:(ko?'선택 없음':'No selection'),
    s.system,
    s.approved?(ko?'승인됨':'Approved'):(ko?'초안':'Draft'),
    s.viewport==='mobile'?(ko?'모바일 375px':'Mobile 375px'):(ko?'데스크톱':'Desktop'),
    s.saved?(ko?'저장됨':'Saved'):(ko?'저장 안 됨':'Unsaved'),
  ];
  return parts.map(p=>esc(p)).join(' <span class="status-divider">/</span> ');
}
