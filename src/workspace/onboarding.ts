import {esc} from '../html';
import {icon} from '../design/icon';
import {initialProject,makeBlock,uid,type BlockKind,type Project} from '../model';
import type {Language} from '../i18n';

export const ONBOARDING_KEY='aphrodite-onboarding-v1';
export type OnboardingState={welcomed:boolean;toured:boolean};

export function readOnboarding(storage:Pick<Storage,'getItem'>):OnboardingState{
  try{
    const raw=storage.getItem(ONBOARDING_KEY);if(!raw)return {welcomed:false,toured:false};
    const v=JSON.parse(raw) as Partial<OnboardingState>;
    return {welcomed:v.welcomed===true,toured:v.toured===true};
  }catch{return {welcomed:false,toured:false};}
}
export function writeOnboarding(storage:Pick<Storage,'setItem'>,state:OnboardingState):void{
  try{storage.setItem(ONBOARDING_KEY,JSON.stringify(state));}catch{/* private mode / quota */}
}

/** First-run sheet on Home: what this is, pick a language, start with a sample or a blank project. */
export function welcomeHtml(language:Language):string{
  const ko=language==='ko';
  const t=(en:string,k:string)=>ko?k:en;
  const points:[string,string,string][]=[
    [icon('bot','ui-icon'),t('Agents put pages on the board','에이전트가 보드에 페이지를 올려요'),t('A connected agent, such as Claude Code or Codex, puts pages on the board and edits them. Each change is kept with who made it and why.','Claude Code나 Codex 같은 에이전트를 연결하면 보드에 페이지를 올리고 고쳐요. 고친 것은 누가, 왜 고쳤는지와 함께 남아요.')],
    [icon('scan-eye','ui-icon'),t('You look and choose','보고 고르는 건 사람이에요'),t('You see the pages side by side and pick the one that works. Deciding the direction is always yours.','페이지를 나란히 놓고 보고, 마음에 드는 것을 골라요. 방향을 정하는 건 언제나 사람이에요.')],
    [icon('file-up','ui-icon'),t('Hand it over as a file','파일 하나로 건네요'),t('A board saves as one file. Whoever receives it opens the same board, pages and history included.','보드는 파일 하나로 저장돼요. 받은 사람은 그 파일로 페이지와 기록까지 같은 보드를 열어요.')],
    [icon('hard-drive','ui-icon'),t('It stays on this Mac','이 Mac에 남아요'),t('Boards are kept in a folder on this Mac. There is no account and no cloud.','보드는 이 Mac의 폴더에 저장돼요. 계정도 클라우드도 없어요.')],
  ];
  return `<div class="welcome ui-welcome"><div class="ui-welcome-art"><img src="/brand/cutouts/aphrodite.png" alt="" width="360" height="360"></div><div class="ui-welcome-body"><div class="ui-seg ui-welcome-lang" role="group" aria-label="${t('Language','언어')}">${(['en','ko'] as const).map(l=>`<button type="button" class="ui-seg-item" data-action="set-language" data-lang="${l}" aria-pressed="${language===l}">${l==='ko'?'한국어':'English'}</button>`).join('')}</div><ul class="ui-welcome-points">${points.map(([ic,h,p])=>`<li>${ic}<div><strong>${esc(h)}</strong><span>${esc(p)}</span></div></li>`).join('')}</ul><div class="ui-welcome-actions"><button type="button" class="ui-btn ui-btn-primary ui-btn-md" data-action="welcome-sample">${icon('sparkles','ui-icon ui-icon-sm')}${t('Start with a sample board','샘플 보드로 시작하기')}</button><button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="welcome-blank">${t('Create a blank board','빈 보드 만들기')}</button><button type="button" class="ui-btn ui-btn-quiet ui-btn-md ui-welcome-skip" data-action="welcome-dismiss">${t('Not now','나중에')}</button></div><p class="ui-help">${t('The sample is a small furniture brand: a board with a desktop page and a mobile page on it. A short tour of the board follows.','샘플은 작은 가구 브랜드의 보드예요. 데스크톱 페이지와 모바일 페이지가 올라 있고, 이어서 보드를 짧게 둘러봐요.')}</p></div></div>`;
}

/** A small furniture brand: a filled desktop page and a mobile page, placed side by side on the space. */
export function sampleProject(language:Language):Project{
  const p=initialProject();
  const ko=language==='ko';
  p.name=ko?'빛공방 · 샘플':'Light Atelier · Sample';
  p.brief=ko?'따뜻하고 에디토리얼한 조명 브랜드. 자연 소재, 사려 깊은 오브제, 조금 느린 생활.':'A warm, editorial lighting brand. Natural materials, thoughtful objects, and a slower way of living.';
  p.contentLanguage=language;
  const home=p.pages[0];
  const mobileId=uid();
  const mobile={id:mobileId,name:ko?'모바일':'Mobile',blocks:(['navigation','hero','cta','footer'] as BlockKind[]).map(k=>makeBlock(k,true))};
  p.pages.push(mobile);
  p.space={frames:{[home.id]:{x:0,y:0,preset:'desktop'},[mobileId]:{x:1600,y:0,preset:'mobile'}}};
  return p;
}

export type TourStep={id:string;target:string;placement:'top'|'bottom'|'left'|'right';title:string;body:string};
export function tourSteps(language:Language,sections=true):TourStep[]{
  const ko=language==='ko';
  const t=(en:string,k:string)=>ko?k:en;
  return [
    {id:'dock',target:'.dock',placement:'top',title:t('Tools sit on the bar below','도구는 아래 막대에 있어요'),body:(sections?t('V select · H hand · A add a component · F new frame · R reference · G Get Vibe · P preview.','V 선택 · H 손 · A 컴포넌트 추가 · F 새 프레임 · R 레퍼런스 · G Get Vibe · P 미리보기.'):t('Use V to select, H to pan, F to add a frame and P to preview.','V로 선택하고 H로 보드를 움직여요. F로 새 프레임을 만들고 P로 미리 봐요.'))+' '+t('The right end switches between Design (1), Dev (2) and Agent (3).','오른쪽 끝에서 디자인(1) · 개발(2) · 에이전트(3)를 바꿔요.')},
    {id:'search',target:'.panel-search',placement:'right',title:t('One search finds everything','찾기 하나로 다 돼요'),body:t('Press ⌘K to open it.','⌘K로 열어요.')+' '+(sections?t('Type the name of a command, a component or a frame, and press Enter to run it or go there.','명령, 컴포넌트, 프레임의 이름을 치고 Enter를 누르면 실행하거나 그리로 가요.'):t('Type the name of a command or a frame, and press Enter to run it or go there.','명령이나 프레임의 이름을 치고 Enter를 누르면 실행하거나 그리로 가요.'))},
    {id:'frame',target:'.space-frame.active .frame-head',placement:'bottom',title:t('Pages are frames on the board','페이지는 보드 위의 프레임이에요'),body:t('Drag a frame by its name and change its width beside it. Move around with Space and drag or the wheel, and zoom with ⌘ and the wheel. ⇧1 shows everything; ⇧2 fits the frame you are in.','이름표를 끌어 프레임을 옮기고, 옆에서 너비를 바꿔요. Space를 누른 채 끌거나 휠로 움직이고, ⌘와 휠로 확대해요. ⇧1은 전체를, ⇧2는 지금 프레임을 화면에 맞춰요.')},
    {id:'inspector',target:'.inspector',placement:'left',title:t('The right side shows what you picked','오른쪽은 고른 것을 보여 줘요'),body:t('In Design, the tokens, copy and layout of the selected component. In Dev, a read-only handoff with its CSS and markup. Both side panels fold into corner tabs.','디자인에서는 고른 컴포넌트의 토큰 · 문구 · 배치를, 개발에서는 CSS와 마크업이 있는 읽기 전용 핸드오프를 보여 줘요. 양쪽 패널은 모서리 탭으로 접혀요.')},
    {id:'agent',target:'.dock-modes',placement:'top',title:t('Agents work on this board too','에이전트도 이 보드에서 일해요'),body:t('A connected agent puts pages on the board and edits them. Each change is kept with who made it and why, and ⌘Z undoes it. Choosing and deciding stay with you.','연결한 에이전트가 페이지를 올리고 고쳐요. 고친 것은 누가, 왜 고쳤는지와 함께 남고, ⌘Z로 되돌릴 수 있어요. 고르고 정하는 건 언제나 사람이에요.')},
  ];
}
export function tourCardHtml(step:TourStep,index:number,total:number,language:Language):string{
  const ko=language==='ko';
  const last=index===total-1;
  return `<div class="tour-card ui-popover" data-placement="${step.placement}" role="dialog" aria-label="${esc(step.title)}"><h3 class="ui-popover-title">${esc(step.title)}</h3><p class="ui-popover-text">${esc(step.body)}</p><div class="ui-popover-foot"><span class="ui-popover-step">${index+1} / ${total}</span><button type="button" class="ui-btn ui-btn-quiet" data-action="tour-skip">${ko?'건너뛰기':'Skip'}</button><button type="button" class="ui-btn ui-btn-primary" data-action="${last?'tour-skip':'tour-next'}">${last?(ko?'시작하기':'Start making'):(ko?'다음':'Next')}</button></div></div>`;
}
