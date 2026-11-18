/**
 * Update notice. The app checks its own release feed at most once every few hours, and when a newer
 * version exists it says so in a small card in the bottom-left corner. Install puts that version in
 * place and then asks whether to restart. Declining a version is remembered, so the offer asks once.
 */
export type UpdateInfo={current:string;latest?:string;newer:boolean;name?:string;url?:string;size?:number;notes?:string;summary?:string[]};
export type NoticeState='offer'|'working'|'installing'|'restart'|'ready'|'failed';

/** Progress ticks stay on the card that is already open. A new state still draws a new card. */
export function keepsCard(previous:NoticeState|undefined,next:NoticeState):boolean{
  return previous===next&&(next==='working'||next==='installing');
}

/** "받는 중 · 42%" — empty until the server says how big the download is, so it never guesses. */
export function progressLabel(received:number,total:number|undefined,lang:'en'|'ko'):string{
  if(!total||total<=0||received<=0)return '';
  const pct=Math.min(100,Math.max(1,Math.round(received/total*100)));
  return lang==='ko'?`${pct}%`:`${pct}%`;
}

export const SKIP_KEY='aphrodite-update-skip';
export const CHECKED_KEY='aphrodite-update-checked';
export const OFF_KEY='aphrodite-update-off';
/** Long enough that launching the app repeatedly does not hammer the release feed. */
export const CHECK_INTERVAL=6*60*60*1000;

/** True when enough time has passed and the person has not turned the check off. */
export function shouldCheck(now:number,lastChecked:string|null,off:string|null):boolean{
  if(off==='1')return false;
  const last=Number(lastChecked);
  if(!Number.isFinite(last)||last<=0)return true;
  return now-last>=CHECK_INTERVAL||last>now;
}

/** A card is only worth showing for a newer version the person has not already waved away. */
export function shouldOffer(info:UpdateInfo,skipped:string|null):boolean{
  return info.newer&&!!info.latest&&!!info.url&&!!info.name&&info.latest!==skipped;
}

export function formatSize(bytes:number|undefined):string{
  if(!bytes||bytes<=0)return '';
  if(bytes<1024*1024)return `${Math.max(1,Math.round(bytes/1024))} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

/** The particle a version number takes, by how its last digit is read aloud: 0·1·3·6·7·8 end in a
 *  consonant, 2·4·5·9 do not. "0.1.6이" but "0.1.5가"; "0.1.6은" but "0.1.5는". The card puts the
 *  version on its own line and needs none, but the sentences around it — skipping a version, saying
 *  one is installed — still read it out loud. */
export function koParticle(version:string,pair:'이가'|'은는'='이가'):string{
  const digit=version.replace(/[^0-9]/g,'').slice(-1);
  const vowel='2459'.includes(digit);
  return pair==='은는'?(vowel?'는':'은'):(vowel?'가':'이');
}

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** The card itself. `state` drives the line of copy and which buttons are offered. */
export function updateNoticeHtml(info:UpdateInfo,state:NoticeState,lang:'en'|'ko',detail='',open=false):string{
  const t=(en:string,ko:string)=>lang==='ko'?ko:en;
  const version=esc(info.latest??'');
  const icon=(name:string)=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const working=state==='working'||state==='installing';
  /* One card, four states, and only ever one thing to press. Everything that is not "get this
     version" — the notes, the disk image, skipping, turning checks off — lives behind the dots, so
     the card never asks the person to choose between four things at once. */
  const askRestart=state==='restart';
  const eyebrow=state==='failed'?t('Update','업데이트')
    :state==='ready'?t('Downloaded','받았습니다')
    :askRestart?t('Installed','설치됨')
    :state==='installing'?t('Installing','설치하는 중')
    :working?t('Downloading','받는 중')
    :t('New version','새 버전');
  const line=state==='failed'
    ? esc(detail||t('The download did not finish.','다운로드를 끝내지 못했습니다.'))
    : state==='ready'
      ? t('Open it and drag Aphrodite to Applications.','열어서 Aphrodite를 응용 프로그램으로 옮기세요.')
      : askRestart
        ? t('The new version is in place. Restart now?','새 버전이 자리를 잡았습니다. 지금 다시 시작할까요?')
      : state==='installing'
        ? t('Putting the new version in place.','새 버전을 자리에 놓는 중.')
        : state==='working'
          ? (detail?esc(detail):t('Starting…','시작하는 중…'))
          : t('Install it, then choose when to restart.','설치한 뒤, 다시 시작할지 고릅니다.');
  const bar=working
    ? `<div class="update-bar"${state==='installing'||!detail?' data-indeterminate="true"':''}><i style="width:${state==='installing'?'38%':detail||'6%'}"></i></div>`:'';
  const summary=!working&&state!=='ready'&&info.summary?.length
    ? `<details class="update-summary"${open?' open':''}><summary>${t('What changed','바뀐 것')}</summary><ul>${info.summary.slice(0,3).map(l=>`<li>${esc(l)}</li>`).join('')}</ul></details>`:'';
  const action=working?''   // the bar is the state; a button that only repeats the eyebrow is noise
    : askRestart
      ? `<button class="primary-button" data-action="update-relaunch">${icon('rotate-cw')}<span>${t('Restart now','다시 시작')}</span></button>`
    : state==='ready'
      ? `<button class="primary-button" data-action="update-open">${icon('arrow-up-right')}<span>${t('Open it','열기')}</span></button>`
      : `<button class="primary-button" data-action="update-install">${icon('download')}<span>${state==='failed'?t('Try again','다시 시도'):t('Install','설치하기')}</span></button>`;
  const menu=working||askRestart?''
    : `<details class="update-more"><summary aria-label="${t('More','더 보기')}" title="${t('More','더 보기')}">${icon('ellipsis')}</summary><div class="update-menu" role="menu">`
      +(info.notes?`<button data-action="update-notes">${t('Release notes','릴리즈 노트')}</button>`:'')
      +`<button data-action="update-download">${t('Download the disk image','디스크 이미지로 받기')}</button>`
      +`<button data-action="update-dismiss">${t('Skip this version','이 버전 건너뛰기')}</button>`
      +`<button data-action="update-never">${t('Stop checking','업데이트 확인 끄기')}</button>`
      +`</div></details>`;
  return `<div class="update-card" role="status" aria-live="polite" data-state="${state}">`
    +(working?'':`<button class="icon-button update-close" data-action="${askRestart?'update-later':'update-dismiss'}" aria-label="${askRestart?t('Later','나중에'):t('Not now','나중에')}" title="${askRestart?t('Later','나중에'):t('Not now','나중에')}">${icon('x')}</button>`)
    +`<span class="update-eyebrow">${eyebrow}</span>`
    +`<strong>${version}</strong>`
    +`<p>${line}</p>${bar}${summary}`
    +(action||menu?`<div class="update-actions">${action}${menu}</div>`:'')
    +`</div>`;
}

