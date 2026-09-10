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
    ['hard-drive',t('Local-first','로컬 우선'),t('Projects live on this Mac. No account, no cloud, no credits.','프로젝트는 이 Mac에 저장됩니다. 계정도, 클라우드도, 크레딧도 없습니다.')],
    ['frame',t('Real components on an open canvas','열린 캔버스 위의 실제 컴포넌트'),t('Every page is a frame — desktop, mobile or your own width — built from real components and tokens.','모든 페이지는 프레임입니다. 데스크톱·모바일·원하는 너비, 실제 컴포넌트와 토큰으로.')],
    ['bot',t('Agents work here too','에이전트도 함께 일합니다'),t('Hand the screen to a computer-use agent with a scope and receipts. Approval stays yours.','범위와 영수증을 붙여 컴퓨터 유즈 에이전트에게 화면을 맡기세요. 승인은 사람의 몫입니다.')],
  ];
  return `<div class="welcome"><div class="welcome-art"><img src="/brand/cutouts/aphrodite.png" alt="" width="360" height="360"><span class="welcome-hand">make something yours.</span></div><div class="welcome-body"><div class="welcome-lang" role="group" aria-label="${t('Language','언어')}">${(['en','ko'] as const).map(l=>`<button type="button" data-action="set-language" data-lang="${l}" aria-pressed="${language===l}">${l==='ko'?'한국어':'English'}</button>`).join('')}</div><ul class="welcome-points">${points.map(([ic,h,p])=>`<li>${icon(ic)}<div><strong>${esc(h)}</strong><span>${esc(p)}</span></div></li>`).join('')}</ul><div class="welcome-actions"><button type="button" class="primary-button" data-action="welcome-sample">${icon('sparkles')}${t('Start with a sample project','샘플 프로젝트로 시작하기')}</button><button type="button" class="secondary-button" data-action="welcome-blank">${t('Create a blank project','빈 프로젝트 만들기')}</button></div><p class="welcome-note">${t('The sample is a small furniture brand: a desktop page and a mobile page you can edit, break and rebuild. A two-minute tour of the editor follows.','샘플은 작은 가구 브랜드입니다. 데스크톱 페이지와 모바일 페이지를 마음껏 고치고 부수고 다시 만들어 보세요. 이어서 2분짜리 에디터 둘러보기가 시작됩니다.')}</p><button type="button" class="welcome-skip" data-action="welcome-dismiss">${t('Not now','나중에')}</button></div></div>`;
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
export function tourSteps(language:Language):TourStep[]{
  const ko=language==='ko';
  const t=(en:string,k:string)=>ko?k:en;
  return [
    {id:'dock',target:'.dock',placement:'top',title:t('Tools and modes live on the dock','도구와 모드는 독에 있습니다'),body:t('V select · H hand · A add a component · F new frame · R reference · G Get Vibe · P preview. The segment on the right switches Design (1), Dev (2) and Agent (3).','V 선택 · H 손 · A 컴포넌트 추가 · F 새 프레임 · R 레퍼런스 · G Get Vibe · P 미리보기. 오른쪽 세그먼트로 디자인(1)·개발(2)·에이전트(3) 모드를 바꿉니다.')},
    {id:'search',target:'.topbar-search',placement:'bottom',title:t('Search does everything','검색창 하나로 다 됩니다'),body:t('⌘K or / opens it. Type "button" and press Enter to drop one on the page; type a frame name to jump to it; every command and shortcut is listed there.','⌘K 또는 / 로 엽니다. "버튼"을 치고 Enter를 누르면 페이지에 바로 들어가고, 프레임 이름을 치면 그리로 이동합니다. 모든 명령과 단축키가 여기 있습니다.')},
    {id:'frame',target:'.space-frame.active .frame-head',placement:'bottom',title:t('Pages are frames on an open space','페이지는 열린 공간 위의 프레임입니다'),body:t('Drag a frame by its label, change its size preset next to it, pan with Space+drag or the wheel, zoom with ⌘wheel. ⇧1 shows everything, ⇧2 fits the current frame.','라벨을 끌어 프레임을 옮기고, 옆의 프리셋으로 크기를 바꾸세요. Space+드래그나 휠로 이동, ⌘휠로 줌. ⇧1은 전체 보기, ⇧2는 현재 프레임 맞춤입니다.')},
    {id:'inspector',target:'.inspector',placement:'left',title:t('The inspector follows the mode','인스펙터는 모드를 따라갑니다'),body:t('Design: tokens, copy and layout of the selected component. Dev: a read-only handoff with identity, CSS tokens and markup. Agent: the console with scope and receipts. Both side panels collapse into corner tabs.','디자인: 선택한 컴포넌트의 토큰·문구·레이아웃. 개발: 식별자·CSS 토큰·마크업이 있는 읽기 전용 핸드오프. 에이전트: 범위와 영수증이 보이는 콘솔. 양쪽 패널은 모서리 탭으로 접힙니다.')},
    {id:'agent',target:'.dock-modes',placement:'top',title:t('Hand the screen to an agent when you like','원할 때 화면을 에이전트에게 맡기세요'),body:t('Agent mode delegates this same UI to a computer-use agent. You set the scope, every edit is receipted, and approving a direction is always yours. Take control back from the banner.','에이전트 모드는 같은 UI를 컴퓨터 유즈 에이전트에게 위임합니다. 범위는 당신이 정하고, 모든 편집은 영수증으로 남으며, 방향 승인은 언제나 사람의 몫입니다. 배너에서 언제든 제어를 되찾습니다.')},
  ];
}
export function tourCardHtml(step:TourStep,index:number,total:number,language:Language):string{
  const ko=language==='ko';
  const last=index===total-1;
  return `<div class="tour-card" data-placement="${step.placement}" role="dialog" aria-label="${esc(step.title)}"><span class="tour-count">${index+1} / ${total}</span><h3>${esc(step.title)}</h3><p>${esc(step.body)}</p><div class="tour-actions"><button type="button" data-action="tour-skip">${ko?'건너뛰기':'Skip'}</button><button type="button" class="primary-button" data-action="${last?'tour-skip':'tour-next'}">${last?(ko?'시작하기':'Start making'):(ko?'다음':'Next')}</button></div></div>`;
}
