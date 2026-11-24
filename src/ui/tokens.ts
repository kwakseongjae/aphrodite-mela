/**
 * The app's own look: the one source for its colours, type, space, shape and control sizes.
 *
 * Values come from the approved direction: the scale from 0.3-F (lab/review-board/proposals/0.3-F/tokens.css), the colours from
 * 0.3-D2 direction A, paper and ink, which the owner picked on 11/23 (lab/review-board/proposals/0.3-D2/app/tokens-a.css). This file is
 * not imported by the app; `scripts/build-ui-tokens.mjs` renders it to `src/ui/tokens.css` and to the
 * token table in `docs/UI-SYSTEM.md`, and tests/ui-tokens.test.ts refuses a stylesheet or a table that
 * no longer matches it. Every emitted name is `--ui-` prefixed so nothing an existing screen or a
 * design on the canvas already uses is redefined.
 *
 * Two layers. Primitives are raw values and are never used by a component directly; roles are what
 * components use, and light and dark differ only in the roles. `{name}` in a value is a reference to
 * another token and renders as `var(--ui-name)`.
 */

/**
 * Neutral ramps: warm paper, OKLCH hue 85 (direction A, 0.3-D2). Light runs n-0 (paper) to n-950 (ink);
 * dark has its own ramp, d-0 (deepest) to d-950 (light ink), because its surfaces sit closer together.
 * Green is success only (ok-*): the accent is ink, the agent gold, the person's selection blue.
 */
export const primitives={
  'n-0':'#FDFCF8','n-50':'#F7F5EF','n-100':'#EEEAE0','n-200':'#DFDBD0','n-300':'#C9C4B6','n-400':'#A29D8F',
  'n-500':'#67645A','n-600':'#5B584E','n-700':'#46433A','n-800':'#302E27','n-900':'#211F19','n-950':'#15140F',
  'd-0':'#131210','d-50':'#1B1A16','d-100':'#201F1A','d-200':'#25241E','d-300':'#2B2A23','d-400':'#36342C',
  'd-500':'#4A473D','d-600':'#77736A','d-700':'#9B9584','d-800':'#BDB7A6','d-900':'#DCD7C9','d-950':'#F3EFE3',
  'floor-light':'#EFEBE1','floor-dark':'#22211C',
  'ink-hover-light':'#3A372E','ink-soft-light':'#E6E0D1','ink-soft-dark':'#2F2D26',
  'blue-600':'#155AB8','blue-500':'#1A6FE1','blue-300':'#7DADF3','blue-soft-light':'#E6F1FF','blue-soft-dark':'#1C314E',
  'gold-600':'#82601A','gold-500':'#A37A22','gold-400':'#D8B55A','gold-300':'#DCBD6A','gold-soft-light':'#F6ECD3','gold-soft-dark':'#3A3018',
  'ok-600':'#2F7A4A','ok-300':'#7CC395','ok-soft-light':'#E4F2E8','ok-soft-dark':'#1B3422',
  'warn-600':'#955E11','warn-300':'#E8B45E','warn-soft-light':'#FBEFD8','warn-soft-dark':'#402C12',
  'danger-600':'#BA362E','danger-300':'#F07F77','danger-soft-light':'#FCEBE8','danger-soft-dark':'#4A2321',
  white:'#FFFFFF',
} as const;

/** Type, space, shape, control sizes and motion: the same in both themes. */
export const scale={
  'font-sans':'"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  'font-mono':'"Geist Mono Variable", "Pretendard Variable", ui-monospace, "SF Mono", Menlo, monospace',
  'text-11':'11px','lh-11':'16px','text-12':'12px','lh-12':'16px','text-13':'13px','lh-13':'20px',
  'text-15':'15px','lh-15':'22px','text-20':'20px','lh-20':'28px','text-28':'28px','lh-28':'36px',
  'w-regular':'400','w-medium':'500','w-semibold':'600',
  'track-20':'-0.012em','track-28':'-0.022em','track-caps':'0.04em',
  'space-1':'4px','space-2':'8px','space-3':'12px','space-4':'16px','space-5':'24px','space-6':'32px','space-7':'48px',
  'radius-1':'4px','radius-2':'8px','radius-3':'12px','radius-pill':'999px',
  hairline:'1px',ring:'2px',
  'control-sm':'28px','control-md':'32px','control-lg':'40px',
  'icon-12':'12px','icon-14':'14px','icon-16':'16px','icon-20':'20px','icon-stroke':'1.75',
  'switch-w':'32px','switch-h':'18px','switch-knob':'14px','dot':'8px','dot-sm':'6px','avatar':'20px',
  'composer-min-h':'112px','composer-sm-min-h':'64px','composer-lg-min-h':'152px',
  'modal-w':'420px','modal-w-md':'560px','modal-w-lg':'600px','strip-h':'36px',
  'home-side-w':'232px','content-max':'1080px','card-min-w':'240px',
  'thumb-w':'28px','thumb-h':'20px','handle':'7px','canvas-dot-size':'0.8px','canvas-dot-gap':'16px',
  'disabled-opacity':'0.4','danger-hover':'brightness(0.92)','danger-press':'brightness(0.84)',
  ease:'cubic-bezier(.2, 0, 0, 1)','dur-fast':'120ms',dur:'200ms',
} as const;

type Roles=Record<string,string>;
const light:Roles={
  'color-scheme':'light',
  'bg-app':'{n-50}','bg-panel':'{n-0}','bg-raised':'{n-0}','bg-sunken':'{n-100}','bg-page':'{white}','bg-canvas':'{floor-light}','canvas-dot':'rgb(33 31 25 / 0.16)',
  'bg-hover':'{n-100}','bg-active':'{n-200}','bg-inverse':'{n-900}','line':'{n-200}','line-strong':'{n-300}','edge-control':'{n-500}',
  'text-1':'{n-900}','text-2':'{n-600}','text-3':'{n-500}','text-inverse':'{n-50}',
  accent:'{n-900}','accent-hover':'{ink-hover-light}','accent-pressed':'{ink-hover-light}','accent-soft':'{ink-soft-light}','accent-text':'{n-900}','on-accent':'{n-50}',
  select:'{blue-500}','select-soft':'{blue-soft-light}','select-text':'{blue-600}','on-select':'{white}',
  agent:'{gold-500}','agent-soft':'{gold-soft-light}','agent-text':'{gold-600}','on-agent':'{n-950}','mark':'{gold-600}',
  'ok-text':'{ok-600}','ok-soft':'{ok-soft-light}','warn-text':'{warn-600}','warn-soft':'{warn-soft-light}',
  danger:'{danger-600}','danger-soft':'{danger-soft-light}','danger-text':'{danger-600}','danger-line':'{danger-600}','on-danger':'{white}',
  focus:'{blue-500}','knob':'{n-0}',
  scrim:'rgb(33 31 25 / 0.28)',
  'shadow-panel':'0 1px 2px rgb(33 31 25 / 0.06), 0 4px 12px rgb(33 31 25 / 0.06)',
  'shadow-window':'0 2px 6px rgb(33 31 25 / 0.08), 0 20px 48px rgb(33 31 25 / 0.16)',
  'shadow-frame':'0 0 0 1px rgb(33 31 25 / 0.06), 0 2px 8px rgb(33 31 25 / 0.07)',
  'shadow-press':'inset 0 1px 4px rgb(0 0 0 / 0.18)',
  'shadow-knob':'0 1px 2px rgb(0 0 0 / 0.2)',
  'shadow-seg':'0 0 0 1px {line}, 0 1px 2px rgb(0 0 0 / 0.06)',
  'swatch-edge':'rgb(0 0 0 / 0.12)',
};
const dark:Roles={
  'color-scheme':'dark',
  'bg-app':'{d-50}','bg-panel':'{d-100}','bg-raised':'{d-200}','bg-sunken':'{d-0}','bg-page':'{white}','bg-canvas':'{floor-dark}','canvas-dot':'rgb(243 239 227 / 0.14)',
  'bg-hover':'{d-300}','bg-active':'{d-400}','bg-inverse':'{d-950}','line':'{d-400}','line-strong':'{d-500}','edge-control':'{d-600}',
  'text-1':'{d-950}','text-2':'{d-800}','text-3':'{d-700}','text-inverse':'{d-50}',
  accent:'{d-950}','accent-hover':'{white}','accent-pressed':'{white}','accent-soft':'{ink-soft-dark}','accent-text':'{d-950}','on-accent':'{d-50}',
  select:'{blue-500}','select-soft':'{blue-soft-dark}','select-text':'{blue-300}','on-select':'{white}',
  agent:'{gold-400}','agent-soft':'{gold-soft-dark}','agent-text':'{gold-300}','on-agent':'{n-950}','mark':'{gold-300}',
  'ok-text':'{ok-300}','ok-soft':'{ok-soft-dark}','warn-text':'{warn-300}','warn-soft':'{warn-soft-dark}',
  danger:'{danger-600}','danger-soft':'{danger-soft-dark}','danger-text':'{danger-300}','danger-line':'{danger-300}','on-danger':'{white}',
  focus:'{blue-500}','knob':'{n-0}',
  scrim:'rgb(0 0 0 / 0.56)',
  'shadow-panel':'0 0 0 1px rgb(255 255 255 / 0.05), 0 4px 16px rgb(0 0 0 / 0.4)',
  'shadow-window':'0 0 0 1px rgb(255 255 255 / 0.07), 0 24px 56px rgb(0 0 0 / 0.55)',
  'shadow-frame':'0 0 0 1px rgb(255 255 255 / 0.07), 0 2px 12px rgb(0 0 0 / 0.45)',
  'shadow-press':'inset 0 1px 4px rgb(0 0 0 / 0.3)',
  'shadow-knob':'0 1px 2px rgb(0 0 0 / 0.4)',
  'shadow-seg':'0 0 0 1px {line-strong}, 0 1px 2px rgb(0 0 0 / 0.3)',
  'swatch-edge':'rgb(255 255 255 / 0.14)',
};
export const themes={light,dark};
export type Theme=keyof typeof themes;

/**
 * Every foreground a component puts on a background, with the contrast it must reach in both themes:
 * 4.5 for text, 3 for large text and for graphics that carry meaning (WCAG 2.1, 1.4.3 and 1.4.11).
 * tests/ui-contrast.test.ts reads the pairs the parts actually draw off the stylesheet and fails on one
 * that is not here, or is here at a lower minimum than the way it is drawn needs.
 *
 * A pair at 3 is for graphics only, unless it is marked `meta`: then text in a placeholder or in meta
 * that repeats something said elsewhere (a count, a shortcut, a time) may use it too. The test names
 * those selectors. Anything else a person must read to act is text, at 4.5.
 *
 * `short` names a theme where the value is known to fall under its minimum, and why that is tolerated
 * for now. The test fails if such a pair starts passing, so a fix also removes the note.
 */
export const pairs:{fg:string,bg:string,min:4.5|3,meta?:true,use:string,short?:Partial<Record<'light'|'dark',string>>}[]=[
  {fg:'text-1',bg:'bg-panel',min:4.5,use:'본문, 제목'},
  {fg:'text-1',bg:'bg-app',min:4.5,use:'사이드바 본문'},
  {fg:'text-1',bg:'bg-raised',min:4.5,use:'모달, 메뉴'},
  {fg:'text-1',bg:'bg-sunken',min:4.5,use:'칸 안, 띠'},
  {fg:'text-1',bg:'bg-hover',min:4.5,use:'마우스를 올린 버튼, 칩, 줄'},
  {fg:'text-1',bg:'bg-active',min:4.5,use:'현재 줄, 눌린 버튼'},
  {fg:'text-1',bg:'select-soft',min:4.5,use:'선택한 줄, 선택 알약'},
  {fg:'text-1',bg:'agent-soft',min:4.5,use:'에이전트가 바꾼 줄, 에이전트 띠'},
  {fg:'text-1',bg:'ok-soft',min:4.5,use:'성공 띠 제목'},
  {fg:'text-1',bg:'warn-soft',min:4.5,use:'주의 띠 제목'},
  {fg:'text-1',bg:'danger-soft',min:4.5,use:'위험 띠 제목'},
  {fg:'text-2',bg:'bg-panel',min:4.5,use:'설명, 메타'},
  {fg:'text-2',bg:'bg-raised',min:4.5,use:'모달 설명'},
  {fg:'text-3',bg:'bg-raised',min:4.5,use:'끌고 있는 줄의 메타'},
  {fg:'text-2',bg:'bg-sunken',min:4.5,use:'입력 칸 안, 썸네일 바탕'},
  {fg:'text-2',bg:'bg-app',min:4.5,use:'사이드바'},
  {fg:'text-2',bg:'bg-hover',min:4.5,use:'마우스를 올린 줄의 메타, 눌린 세그먼트, 칩의 아이콘'},
  {fg:'text-2',bg:'bg-active',min:4.5,use:'현재 줄 · 눌린 줄의 메타와 꼬리표, 눌린 칩 · 줄의 아이콘'},
  {fg:'text-2',bg:'select-soft',min:4.5,use:'선택한 줄의 메타와 아이콘'},
  {fg:'text-2',bg:'ok-soft',min:4.5,use:'성공 띠 설명'},
  {fg:'text-2',bg:'warn-soft',min:4.5,use:'주의 띠 설명'},
  {fg:'text-2',bg:'danger-soft',min:4.5,use:'위험 띠 설명'},
  {fg:'text-2',bg:'agent-soft',min:4.5,use:'에이전트 띠 설명'},
  {fg:'text-3',bg:'bg-panel',min:4.5,use:'자리 표시, 되풀이하는 메타, 선택 상자 화살표 · 점 · 호버 테두리'},
  {fg:'text-3',bg:'bg-hover',min:4.5,use:'마우스를 올린 조용한 선택 상자의 화살표'},
  {fg:'text-3',bg:'bg-sunken',min:4.5,use:'알약 안의 점'},
  {fg:'text-3',bg:'ok-soft',min:3,use:'성공 알약 안의 점 (그래픽)'},
  {fg:'text-3',bg:'warn-soft',min:3,use:'주의 알약 안의 점 (그래픽)'},
  {fg:'text-3',bg:'danger-soft',min:3,use:'위험 알약 안의 점 (그래픽)'},
  {fg:'text-3',bg:'agent-soft',min:3,use:'에이전트 알약 안의 점 (그래픽)'},
  {fg:'text-3',bg:'select-soft',min:3,use:'선택 알약 안의 점 (그래픽)'},
  {fg:'text-3',bg:'accent-soft',min:3,use:'강조 알약 안의 점 (그래픽)'},
  {fg:'text-inverse',bg:'bg-inverse',min:4.5,use:'알림(토스트)'},
  {fg:'on-accent',bg:'accent',min:4.5,use:'주 버튼, 보내기'},
  {fg:'on-accent',bg:'accent-hover',min:4.5,use:'마우스를 올린 주 버튼, 보내기'},
  {fg:'on-accent',bg:'accent-pressed',min:4.5,use:'눌린 주 버튼, 보내기'},
  {fg:'accent-text',bg:'bg-panel',min:4.5,use:'강조 글자, 링크'},
  {fg:'accent-text',bg:'accent-soft',min:4.5,use:'현재 도구, 강조 알약'},
  {fg:'on-select',bg:'select',min:4.5,use:'선택 크기 표시'},
  {fg:'select',bg:'bg-canvas',min:3,use:'선택선 (그래픽)'},
  {fg:'select',bg:'bg-panel',min:3,use:'선택 점 (그래픽)'},
  {fg:'focus',bg:'bg-panel',min:3,use:'키보드 포커스 고리, 포커스 받은 입력 칸 테두리 (그래픽)'},
  {fg:'line-strong',bg:'bg-panel',min:3,use:'입력 칸 · 글 상자 · 선택 상자 · 요청 입력창 테두리, 꺼진 스위치 막대, 칩 · 보조 버튼 · 연결 카드 테두리 (그래픽)',short:{
    light:'방향 A의 값(1.70:1, 0.3-F에서는 1.47). 칸 안의 이름표 · 자리 표시와 스위치 손잡이의 자리가 함께 알리고, 칩 · 보조 버튼 · 연결 카드는 글자가 알린다. 대표님이 승인한 예외가 아니다: 3:1로 올릴지 보드에서 여쭌다.',
    dark:'방향 A의 값(1.78:1, 0.3-F에서는 1.92). 칸 안의 이름표 · 자리 표시와 스위치 손잡이의 자리가 함께 알리고, 칩 · 보조 버튼 · 연결 카드는 글자가 알린다. 대표님이 승인한 예외가 아니다: 3:1로 올릴지 보드에서 여쭌다.'}},
  {fg:'accent',bg:'bg-panel',min:3,use:'켜진 스위치, 연결된 카드 테두리, 강조 점 (그래픽)'},
  {fg:'accent-hover',bg:'bg-panel',min:3,use:'마우스를 올린 켜진 스위치 (그래픽)'},
  {fg:'on-agent',bg:'agent',min:4.5,use:'에이전트 이름표'},
  {fg:'agent',bg:'bg-panel',min:3,use:'에이전트 점 (그래픽)'},
  {fg:'agent-text',bg:'bg-panel',min:4.5,use:'에이전트 상태 글자'},
  {fg:'agent-text',bg:'agent-soft',min:4.5,use:'에이전트 알약'},
  {fg:'mark',bg:'bg-panel',min:4.5,use:'목록 머리의 수, 화면 머리의 수'},
  {fg:'accent',bg:'bg-active',min:3,use:'진행 막대의 채움 (그래픽)'},
  {fg:'text-3',bg:'bg-app',min:4.5,use:'위 줄(띠)의 점'},
  {fg:'agent-text',bg:'bg-app',min:4.5,use:'위 줄(띠)의 "변경 N개"'},
  {fg:'agent',bg:'bg-app',min:3,use:'위 줄(띠)의 에이전트 점 (그래픽, 점의 색은 변형 클래스라 손으로 적음)'},
  {fg:'agent',bg:'agent-soft',min:3,use:'에이전트 모드 띠 · 에이전트 알약 안의 에이전트 점 (그래픽, 손으로 적음)'},
  {fg:'agent-text',bg:'warn-soft',min:4.5,use:'주의 띠 안의 "변경 N개"'},
  {fg:'agent-text',bg:'danger-soft',min:4.5,use:'폴더 없음 띠 안의 "변경 N개"'},
  {fg:'danger-text',bg:'bg-raised',min:4.5,use:'메뉴의 위험 항목'},
  {fg:'edge-control',bg:'bg-panel',min:3,use:'선택지 카드의 동그라미, 체크 상자, 호버한 선택지 카드 테두리 (그래픽)'},
  {fg:'edge-control',bg:'bg-raised',min:3,use:'모달 위 선택지 카드 · 체크 상자 테두리 (그래픽, 시트가 바탕을 말하지 않아 손으로 적음)'},
  {fg:'edge-control',bg:'bg-sunken',min:3,use:'가라앉은 바탕 위 체크 상자 (그래픽)'},
  {fg:'text-1',bg:'bg-canvas',min:4.5,use:'보드 위 틀 이름'},
  {fg:'text-2',bg:'bg-canvas',min:4.5,use:'보드 위 틀 머리줄, 그 아이콘과 눈 단추'},
  {fg:'text-3',bg:'bg-canvas',min:4.5,use:'보드 위 틀 크기(되풀이하는 메타)'},
  {fg:'select-text',bg:'bg-canvas',min:4.5,use:'선택된 틀의 이름'},
  {fg:'select',bg:'bg-page',min:3,use:'선택 테두리와 손잡이, 페이지 위 (그래픽, 시트가 읽지 못해 손으로 적음)'},
  {fg:'agent',bg:'bg-canvas',min:3,use:'에이전트가 고친 틀의 금색 테두리 (그래픽, outline이라 손으로 적음)'},  {fg:'ok-text',bg:'bg-panel',min:4.5,use:'성공 점, 성공 글자'},
  {fg:'ok-text',bg:'ok-soft',min:4.5,use:'성공 알약'},
  {fg:'warn-text',bg:'bg-panel',min:4.5,use:'주의 점(저장 안 됨)'},
  {fg:'warn-text',bg:'warn-soft',min:4.5,use:'주의 알약'},
  {fg:'danger-text',bg:'danger-soft',min:4.5,use:'위험 알약, 오류 설명'},
  {fg:'danger-text',bg:'bg-panel',min:4.5,use:'입력 오류 설명'},
  {fg:'danger-text',bg:'bg-sunken',min:4.5,use:'에이전트 패널의 잠긴 권한'},
  {fg:'danger-line',bg:'bg-panel',min:3,use:'입력 오류 테두리 (그래픽)'},
  {fg:'on-danger',bg:'danger',min:4.5,use:'위험 버튼'},
];

const ref=(value:string)=>value.replace(/\{([\w-]+)\}/g,(_,name)=>`var(--ui-${name})`);

/** A role or primitive as the hex it ends at in one theme, or undefined when it is not a plain colour. */
export function resolve(theme:Theme,name:string):string|undefined{
  const roles:Roles=themes[theme];
  let value:string|undefined=name in roles?roles[name]:(primitives as Record<string,string>)[name];
  for(let i=0;i<8&&value;i++){
    const next:RegExpMatchArray|null=value.match(/^\{([\w-]+)\}$/);
    if(!next)break;
    value=next[1] in roles?roles[next[1]]:(primitives as Record<string,string>)[next[1]];
  }
  return value&&/^#[0-9a-f]{6}$/i.test(value)?value:undefined;
}

const block=(selector:string,entries:Record<string,string>,indent='')=>
  `${indent}${selector} {\n${Object.entries(entries).map(([name,value])=>`${indent}  --ui-${name}: ${ref(value)};`).join('\n')}\n${indent}}\n`;

export function tokensCss(){
  return [
    '/* Generated from src/ui/tokens.ts by scripts/build-ui-tokens.mjs. Do not edit: change the source and run the script. */\n',
    block(':root',{...primitives,...scale}),
    block(':root, [data-theme="light"]',light),
    block('[data-theme="dark"]',dark),
    `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])',dark,'  ')}}\n`,
  ].join('\n');
}

/** The token table in docs/UI-SYSTEM.md, between its two markers. */
export function tokensDoc(){
  const cell=(value:string)=>`\`${value.replace(/\|/g,'\\|')}\``;
  const rows=[
    '| 토큰 | 밝은 판 | 어두운 판 |','|---|---|---|',
    ...Object.keys(light).map(name=>`| \`--ui-${name}\` | ${cell(light[name])}${resolve('light',name)&&light[name]!==resolve('light',name)?` ${resolve('light',name)}`:''} | ${cell(dark[name])}${resolve('dark',name)&&dark[name]!==resolve('dark',name)?` ${resolve('dark',name)}`:''} |`),
  ];
  const fixed=['| 토큰 | 값 |','|---|---|',...Object.entries({...primitives,...scale}).map(([name,value])=>`| \`--ui-${name}\` | ${cell(value)} |`)];
  return ['### 역할 (판마다 다름)','',...rows,'','### 원값과 단계 (두 판 공통)','',...fixed,''].join('\n');
}
