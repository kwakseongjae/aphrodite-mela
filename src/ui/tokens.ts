/**
 * The app's own look: the one source for its colours, type, space, shape and control sizes.
 *
 * Values come from the approved direction (lab/review-board/proposals/0.3-F/tokens.css). This file is
 * not imported by the app; `scripts/build-ui-tokens.mjs` renders it to `src/ui/tokens.css` and to the
 * token table in `docs/UI-SYSTEM.md`, and tests/ui-tokens.test.ts refuses a stylesheet or a table that
 * no longer matches it. Every emitted name is `--ui-` prefixed so nothing an existing screen or a
 * design on the canvas already uses is redefined.
 *
 * Two layers. Primitives are raw values and are never used by a component directly; roles are what
 * components use, and light and dark differ only in the roles. `{name}` in a value is a reference to
 * another token and renders as `var(--ui-name)`.
 */

/** Neutral ramp: OKLCH hue 150 (toward the Aphrodite green), chroma 0.0015–0.008. */
export const primitives={
  'n-0':'#FDFEFD','n-50':'#F8FAF8','n-100':'#F1F3F1','n-200':'#E4E7E4','n-300':'#D1D5D1','n-400':'#A9AEAA',
  'n-500':'#848985','n-600':'#666A66','n-700':'#4A4E4B','n-800':'#323532','n-900':'#1E211F','n-950':'#131614',
  'green-600':'#2A583C','green-500':'#356748','green-300':'#7FBB93','green-soft-light':'#E6F4EA','green-soft-dark':'#1D3124',
  'blue-500':'#1A6FE1','blue-soft-light':'#E6F1FF','blue-soft-dark':'#1C314E',
  'gold-600':'#8A6419','gold-500':'#B48A32','gold-300':'#D0A348','gold-soft-light':'#FBEFD6','gold-soft-dark':'#382C15',
  'ok-600':'#267543','ok-300':'#72C78B','ok-soft-light':'#E2F6E6','ok-soft-dark':'#1B3422',
  'warn-600':'#955E11','warn-300':'#E8B45E','warn-soft-light':'#FFF0D4','warn-soft-dark':'#402C12',
  'danger-600':'#BA362E','danger-300':'#F07F77','danger-soft-light':'#FFEAE8','danger-soft-dark':'#4A2321',
  white:'#FFFFFF',
} as const;

/** Type, space, shape, control sizes and motion: the same in both themes. */
export const scale={
  'font-sans':'"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  'font-mono':'ui-monospace, "SF Mono", Menlo, monospace',
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
  'modal-w':'420px','modal-w-lg':'600px',
  'disabled-opacity':'0.4','danger-hover':'brightness(0.92)','danger-press':'brightness(0.84)',
  ease:'cubic-bezier(.2, 0, 0, 1)','dur-fast':'120ms',dur:'200ms',
} as const;

type Roles=Record<string,string>;
const light:Roles={
  'color-scheme':'light',
  'bg-app':'{n-50}','bg-panel':'{n-0}','bg-raised':'{n-0}','bg-sunken':'{n-100}','bg-canvas':'{n-100}','canvas-dot':'{n-300}',
  'bg-hover':'{n-100}','bg-active':'{n-200}','bg-inverse':'{n-900}','line':'{n-200}','line-strong':'{n-300}',
  'text-1':'{n-900}','text-2':'{n-600}','text-3':'{n-500}','text-inverse':'{n-50}',
  accent:'{green-500}','accent-hover':'{green-600}','accent-pressed':'{green-600}','accent-soft':'{green-soft-light}','accent-text':'{green-500}','on-accent':'{n-0}',
  select:'{blue-500}','select-soft':'{blue-soft-light}','on-select':'{white}',
  agent:'{gold-500}','agent-soft':'{gold-soft-light}','agent-text':'{gold-600}','on-agent':'{n-950}',
  'ok-text':'{ok-600}','ok-soft':'{ok-soft-light}','warn-text':'{warn-600}','warn-soft':'{warn-soft-light}',
  danger:'{danger-600}','danger-soft':'{danger-soft-light}','danger-text':'{danger-600}','on-danger':'{white}',
  focus:'{blue-500}','knob':'{n-0}',
  scrim:'rgb(19 22 20 / 0.32)',
  'shadow-panel':'0 1px 2px rgb(19 22 20 / 0.06), 0 4px 12px rgb(19 22 20 / 0.06)',
  'shadow-window':'0 2px 6px rgb(19 22 20 / 0.08), 0 16px 40px rgb(19 22 20 / 0.14)',
  'shadow-press':'inset 0 1px 4px rgb(0 0 0 / 0.18)',
  'shadow-knob':'0 1px 2px rgb(0 0 0 / 0.2)',
  'shadow-seg':'0 0 0 1px {line}, 0 1px 2px rgb(0 0 0 / 0.06)',
  'swatch-edge':'rgb(0 0 0 / 0.12)',
};
const dark:Roles={
  'color-scheme':'dark',
  'bg-app':'{n-950}','bg-panel':'{n-900}','bg-raised':'{n-800}','bg-sunken':'{n-950}','bg-canvas':'{n-950}','canvas-dot':'{n-800}',
  'bg-hover':'{n-800}','bg-active':'{n-700}','bg-inverse':'{n-50}','line':'{n-800}','line-strong':'{n-700}',
  'text-1':'{n-50}','text-2':'{n-400}','text-3':'{n-500}','text-inverse':'{n-900}',
  accent:'{green-500}','accent-hover':'{green-600}','accent-pressed':'{green-600}','accent-soft':'{green-soft-dark}','accent-text':'{green-300}','on-accent':'{n-0}',
  select:'{blue-500}','select-soft':'{blue-soft-dark}','on-select':'{white}',
  agent:'{gold-500}','agent-soft':'{gold-soft-dark}','agent-text':'{gold-300}','on-agent':'{n-950}',
  'ok-text':'{ok-300}','ok-soft':'{ok-soft-dark}','warn-text':'{warn-300}','warn-soft':'{warn-soft-dark}',
  danger:'{danger-600}','danger-soft':'{danger-soft-dark}','danger-text':'{danger-300}','on-danger':'{white}',
  focus:'{blue-500}','knob':'{n-0}',
  scrim:'rgb(0 0 0 / 0.5)',
  'shadow-panel':'0 0 0 1px rgb(255 255 255 / 0.04), 0 4px 16px rgb(0 0 0 / 0.36)',
  'shadow-window':'0 0 0 1px rgb(255 255 255 / 0.06), 0 20px 48px rgb(0 0 0 / 0.5)',
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
 * `text-3` is held to 3 because it is only for placeholders, disabled controls and meta that repeats
 * something said elsewhere; anything a person must read to act is text-2 or stronger.
 */
export const pairs:{fg:string,bg:string,min:4.5|3,use:string}[]=[
  {fg:'text-1',bg:'bg-panel',min:4.5,use:'본문, 제목'},
  {fg:'text-1',bg:'bg-app',min:4.5,use:'사이드바 본문'},
  {fg:'text-1',bg:'bg-raised',min:4.5,use:'모달, 메뉴'},
  {fg:'text-1',bg:'bg-sunken',min:4.5,use:'칸 안, 띠'},
  {fg:'text-1',bg:'bg-active',min:4.5,use:'현재 줄, 눌린 버튼'},
  {fg:'text-1',bg:'select-soft',min:4.5,use:'선택한 줄, 선택 알약'},
  {fg:'text-1',bg:'agent-soft',min:4.5,use:'에이전트가 바꾼 줄, 에이전트 띠'},
  {fg:'text-1',bg:'ok-soft',min:4.5,use:'성공 띠 제목'},
  {fg:'text-1',bg:'warn-soft',min:4.5,use:'주의 띠 제목'},
  {fg:'text-1',bg:'danger-soft',min:4.5,use:'위험 띠 제목'},
  {fg:'text-2',bg:'bg-panel',min:4.5,use:'설명, 메타'},
  {fg:'text-2',bg:'bg-raised',min:4.5,use:'모달 설명'},
  {fg:'text-2',bg:'bg-sunken',min:4.5,use:'입력 칸 안, 썸네일 바탕'},
  {fg:'text-2',bg:'bg-app',min:4.5,use:'사이드바'},
  {fg:'text-2',bg:'ok-soft',min:4.5,use:'성공 띠 설명'},
  {fg:'text-2',bg:'warn-soft',min:4.5,use:'주의 띠 설명'},
  {fg:'text-2',bg:'danger-soft',min:4.5,use:'위험 띠 설명'},
  {fg:'text-2',bg:'agent-soft',min:4.5,use:'에이전트 띠 설명'},
  {fg:'text-3',bg:'bg-panel',min:3,use:'자리 표시, 비활성, 되풀이하는 메타만'},
  {fg:'text-inverse',bg:'bg-inverse',min:4.5,use:'알림(토스트)'},
  {fg:'on-accent',bg:'accent',min:4.5,use:'주 버튼, 보내기'},
  {fg:'accent-text',bg:'bg-panel',min:4.5,use:'강조 글자, 링크'},
  {fg:'accent-text',bg:'accent-soft',min:4.5,use:'현재 도구, 강조 알약'},
  {fg:'on-select',bg:'select',min:4.5,use:'선택 크기 표시'},
  {fg:'select',bg:'bg-canvas',min:3,use:'선택선 (그래픽)'},
  {fg:'focus',bg:'bg-panel',min:3,use:'키보드 포커스 고리 (그래픽)'},
  {fg:'accent',bg:'bg-panel',min:3,use:'켜진 스위치, 연결된 카드 테두리 (그래픽)'},
  {fg:'on-agent',bg:'agent',min:4.5,use:'에이전트 이름표'},
  {fg:'agent-text',bg:'bg-panel',min:4.5,use:'에이전트 상태 글자'},
  {fg:'agent-text',bg:'agent-soft',min:4.5,use:'에이전트 알약'},
  {fg:'ok-text',bg:'ok-soft',min:4.5,use:'성공 알약'},
  {fg:'warn-text',bg:'warn-soft',min:4.5,use:'주의 알약'},
  {fg:'danger-text',bg:'danger-soft',min:4.5,use:'위험 알약, 오류 설명'},
  {fg:'danger-text',bg:'bg-panel',min:4.5,use:'입력 오류 설명'},
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
