import {catalog,type BlockKind} from '../model';
import {esc} from '../html';
import type {Language} from '../i18n';

/** One entry of the in-app command palette. `action`/`data` map 1:1 to the existing data-action dispatcher. */
export type Command={id:string;action:string;data?:Record<string,string>;en:string;ko:string;group:'navigate'|'add'|'edit'|'design'|'review'|'file';keys?:string;hint?:{en:string;ko:string};keywords?:string[];related?:boolean};

export type PaletteContext={hasSelection:boolean;canUndo:boolean;canRedo:boolean;approved:boolean;viewport:'desktop'|'mobile';kinds?:readonly {kind:BlockKind;name:string}[];pages?:readonly {id:string;name:string;active:boolean}[]};

export function commandTable(ctx:PaletteContext):Command[]{
  const kinds=ctx.kinds??catalog;
  const add:Command[]=kinds.filter(c=>!c.kind.startsWith('moa')).map(c=>({id:`add-${c.kind}`,action:'add',data:{kind:c.kind},en:`Add ${c.name}`,ko:`${c.name} 추가`,group:'add' as const}));
  const base:Command[]=[
    {id:'home',action:'home',en:'All projects (home)',ko:'프로젝트 목록(홈)',group:'navigate'},
    {id:'search',action:'focus-component-search',en:'Find a component',ko:'컴포넌트 검색',group:'navigate',keys:'/'},
    {id:'undo',action:'undo',en:'Undo',ko:'실행 취소',group:'edit',keys:'⌘Z'},
    {id:'redo',action:'redo',en:'Redo',ko:'다시 실행',group:'edit',keys:'⇧⌘Z'},
    {id:'brief',action:'brief',en:'Start from a brief (new draft page)',ko:'브리프로 시작 (새 초안 페이지)',group:'add'},
    {id:'autofill',action:'autofill',en:'Get Vibe · fill sample copy and images',ko:'Get Vibe · 샘플 문구·이미지 채우기',group:'design',keywords:['vibe','바이브','분위기','샘플']},
    {id:'systems',action:'systems',en:'Choose design system (applies to every page)',ko:'디자인 시스템 선택 (모든 페이지 적용)',group:'design',keywords:['ds','design system','디자인 시스템','디자인시스템','토큰']},
    {id:'theme',action:'theme-review',en:'Compare color & font drafts',ko:'색상·폰트 초안 비교',group:'design'},
    {id:'explorer',action:'component-explorer',en:'Compare components across design systems (catalog)',ko:'DS별 컴포넌트 비교 (카탈로그)',group:'design',keywords:['ds','design system','디자인 시스템','디자인시스템','토큰']},
    {id:'reference',action:'reference',en:'Reference image · analyze · 3 directions',ko:'레퍼런스 이미지 · 분석 · 3안 비교',group:'design',keywords:['레퍼런스','참고','이미지','3안']},
    {id:'moa',action:'moa-recipe',en:'Insert the Moa app recipe (app shell sample)',ko:'Moa 앱 레시피 삽입 (앱 셸 샘플)',group:'design'},
    {id:'pointer-lab',action:'pointer-lab',en:'Add a Pointer lab page (free-position sample)',ko:'포인터 랩 페이지 추가 (자유 배치 샘플)',group:'design'},
    {id:'mode-design',action:'editor-mode',data:{mode:'design'},en:'Design mode',ko:'디자인 모드',group:'review',keys:'1'},
    {id:'mode-dev',action:'editor-mode',data:{mode:'dev'},en:'Dev mode · read-only handoff view',ko:'개발 모드 · 읽기 전용 핸드오프 보기',group:'review',keys:'2',keywords:['핸드오프','개발','dev','코드']},
    {id:'mode-agent',action:'editor-mode',data:{mode:'agent'},en:'Agent mode · hand the screen to a computer-use agent',ko:'에이전트 모드 · 컴퓨터 유즈 에이전트에게 화면 맡기기',group:'review',keys:'3',keywords:['에이전트','위임','computer use']},
    {id:'zoom-fit',action:'zoom-fit',en:'Zoom to fit all frames',ko:'모든 프레임 보기',group:'navigate',keys:'⇧1',keywords:['줌','확대','축소','fit','맞춤']},
    {id:'zoom-frame',action:'zoom-frame',en:'Zoom to the current frame',ko:'현재 프레임 맞춤',group:'navigate',keys:'⇧2',keywords:['줌','확대','축소','fit','맞춤']},
    {id:'zoom-100',action:'zoom-100',en:'Zoom to 100%',ko:'100%로 보기',group:'navigate',keys:'⌘0',keywords:['줌','확대','축소','fit','맞춤']},
    {id:'zoom-in',action:'zoom-in',en:'Zoom in',ko:'확대',group:'navigate',keys:'⌘+',keywords:['줌','확대','축소','fit','맞춤']},
    {id:'zoom-out',action:'zoom-out',en:'Zoom out',ko:'축소',group:'navigate',keys:'⌘-',keywords:['줌','확대','축소','fit','맞춤']},
    {id:'tool-hand',action:'dock-hand',en:'Hand tool · drag to pan',ko:'손 도구 · 드래그로 이동',group:'navigate',keys:'H'},
    {id:'tool-select',action:'dock-select',en:'Select tool',ko:'선택 도구',group:'navigate',keys:'V'},
    {id:'new-frame',action:'new-frame',en:'New frame · a page placed on the space',ko:'새 프레임 · 공간 위에 페이지 만들기',group:'add',keys:'F',keywords:['프레임','페이지']},
    {id:'tidy-frames',action:'tidy-frames',en:'Tidy frames into a row',ko:'프레임 한 줄로 정렬',group:'design',keywords:['프레임','페이지']},
    {id:'panel-left',action:'panel-toggle',data:{side:'left'},en:'Toggle the library panel',ko:'라이브러리 패널 접기/펼치기',group:'navigate',keywords:['패널','사이드바','접기']},
    {id:'panel-right',action:'panel-toggle',data:{side:'right'},en:'Toggle the inspector panel',ko:'인스펙터 패널 접기/펼치기',group:'navigate',keywords:['패널','사이드바','접기']},
    {id:'panels-all',action:'panels-all',en:'Hide or show both panels',ko:'양쪽 패널 숨기기/보이기',group:'navigate',keys:'⌘\\',keywords:['패널','사이드바','접기']},
    {id:'content-language',action:'language-settings',en:'Content language settings',ko:'콘텐츠 언어 설정',group:'file'},
    {id:'tour',action:'tour-start',en:'Show the editor tour again',ko:'에디터 둘러보기 다시 보기',group:'navigate'},
    {id:'welcome',action:'welcome-show',en:'Show the welcome sheet again',ko:'환영 화면 다시 보기',group:'navigate'},
    ...(ctx.pages??[]).filter(p=>!p.active).map(p=>({id:`frame-${p.id}`,action:'page',data:{id:p.id,nav:'fit'},en:`Go to frame · ${p.name}`,ko:`프레임으로 이동 · ${p.name}`,group:'navigate' as const,keywords:['프레임','페이지']})),
    {id:'desktop',action:'desktop',en:'Desktop viewport',ko:'데스크톱 뷰포트',group:'review',hint:ctx.viewport==='desktop'?{en:'current',ko:'현재'}:undefined},
    {id:'mobile',action:'mobile',en:'Mobile viewport (390px)',ko:'모바일 뷰포트 (390px)',group:'review',hint:ctx.viewport==='mobile'?{en:'current',ko:'현재'}:undefined},
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

export function normalizeQuery(s:string){return s.normalize('NFC').toLowerCase().replace(/[\s·\-_]/g,'');}
function isSubsequence(q:string,s:string){let i=0;for(const ch of s){if(ch===q[i])i++;if(i===q.length)return true;}return false;}
export function scoreCommand(c:Command,query:string,language:Language){
  const q=normalizeQuery(query);if(!q)return 0;
  const label=normalizeQuery(language==='ko'?c.ko:c.en);
  const keywords=normalizeQuery((c.keywords??[]).join(' '));
  if(label.startsWith(q))return 4;
  if(label.includes(q)||keywords.includes(q))return 3;
  const tokens=query.trim().split(/\s+/).map(normalizeQuery).filter(Boolean);
  const haystack=label+keywords+normalizeQuery(c.action)+normalizeQuery(c.data?.kind??'');
  if(tokens.length&&tokens.every(t=>haystack.includes(t)))return 2;
  if(q.length>=3&&isSubsequence(q,label))return 1;
  return 0;
}
export function filterCommands(commands:Command[],query:string,language:Language){
  if(!query.trim())return commands;
  const ranked=commands.map((c,i)=>({c,i,score:scoreCommand(c,query,language)})).filter(r=>r.score>0);
  ranked.sort((a,b)=>b.score-a.score||a.i-b.i);
  const matched=ranked.map(r=>r.c),ids=new Set(matched.map(c=>c.id));
  const groups=new Set(ranked.filter(r=>r.score>=3).map(r=>r.c.group));
  const related=commands.filter(c=>groups.has(c.group)&&!ids.has(c.id)).map(c=>({...c,related:true}));
  return [...matched,...related].slice(0,40);
}

const groupLabel:Record<Command['group'],{en:string;ko:string}>={navigate:{en:'Navigate',ko:'이동'},add:{en:'Add component',ko:'컴포넌트 추가'},edit:{en:'Edit',ko:'편집'},design:{en:'Design',ko:'디자인'},review:{en:'Review',ko:'검토'},file:{en:'File',ko:'파일'}};

/** The palette never lists Approve direction: approval stays a deliberate, human click. */
export function commandPaletteHtml(commands:Command[],query:string,language:Language){
  const ko=language==='ko';
  const list=filterCommands(commands,query,language);
  const matched=list.filter(c=>!c.related),related=list.filter(c=>c.related);
  const order:Command['group'][]=['navigate','design','review','edit','file','add'];
  const groups=order.filter(g=>matched.some(c=>c.group===g));
  const button=(c:Command)=>`<button type="button" role="option" data-palette data-action="${esc(c.action)}"${Object.entries(c.data??{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')}><span>${esc(ko?c.ko:c.en)}</span>${c.hint?`<small>${esc(ko?c.hint.ko:c.hint.en)}</small>`:''}${c.keys?`<kbd>${esc(c.keys)}</kbd>`:''}</button>`;
  const items=groups.map(g=>`<li class="palette-group" role="presentation"><span>${esc(groupLabel[g][language])}</span><ul role="group">${matched.filter(c=>c.group===g).map(c=>`<li>${button(c)}</li>`).join('')}</ul></li>`).join('')+(related.length?`<li class="palette-group palette-related"><span>${ko?'관련 항목':'Related'}</span></li>${related.map(c=>`<li data-related="true">${button(c)}</li>`).join('')}`:'');
  return `<div class="palette"><label class="palette-search">${ko?'명령·컴포넌트·프레임 검색':'Search commands, components, frames'}<input id="command-search" type="search" autocomplete="off" aria-label="${ko?'명령·컴포넌트·프레임 검색':'Search commands, components, frames'}" placeholder="${ko?'예: 히어로 추가, 디자인 시스템, 내보내기':'e.g. add hero, design system, export'}" value="${esc(query)}"></label><ul class="palette-list" role="listbox" aria-label="${ko?'명령':'Commands'}" id="command-list">${items||`<li class="palette-empty" role="status">${ko?'일치하는 명령이 없습니다.':'No matching commands.'}</li>`}</ul><p class="palette-footnote">${ko?'⌘K 또는 ? 로 열기 · ↑↓ 이동 · Enter 실행 · Esc 닫기 · “방향 승인”은 항상 화면에서 직접 클릭합니다.':'Open with ⌘K or ? · ↑↓ move · Enter run · Esc close · “Approve direction” is always a direct click on screen.'}</p></div>`;
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
    s.viewport==='mobile'?(ko?'모바일 390px':'Mobile 390px'):(ko?'데스크톱':'Desktop'),
    s.saved?(ko?'저장됨':'Saved'):(ko?'저장 안 됨':'Unsaved'),
  ];
  return parts.map(p=>esc(p)).join(' <span class="status-divider">/</span> ');
}
