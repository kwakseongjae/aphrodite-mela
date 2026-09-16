/**
 * Update notice. The app checks its own release feed at most once every few hours, and when a newer
 * version exists it says so in a small card in the bottom-left corner. Clicking downloads that
 * release's disk image; the person still opens it and moves the app across, so nothing on this Mac
 * is replaced without them watching. Declining a version is remembered, so the card asks once.
 */
export type UpdateInfo={current:string;latest?:string;newer:boolean;name?:string;url?:string;size?:number;notes?:string};
export type NoticeState='offer'|'working'|'installing'|'ready'|'failed';

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

/** 이 or 가 after a version number, by how its last digit is read aloud: 0·1·3·6·7·8 end in a
 *  consonant and take 이, while 2·4·5·9 take 가. "0.1.6이" but "0.1.5가". */
export function koParticle(version:string):string{
  const digit=version.replace(/[^0-9]/g,'').slice(-1);
  return '2459'.includes(digit)?'가':'이';
}

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** The card itself. `state` drives the line of copy and which buttons are offered. */
export function updateNoticeHtml(info:UpdateInfo,state:NoticeState,lang:'en'|'ko',detail=''):string{
  const t=(en:string,ko:string)=>lang==='ko'?ko:en;
  const version=esc(info.latest??'');
  const size=formatSize(info.size);
  const icon=(name:string)=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const heading=state==='ready'
    ? t(`Version ${version} is downloaded`,`${version} 버전을 받았습니다`)
    : t(`Version ${version} is available`,`새 버전 ${version}${koParticle(version)} 나왔습니다`);
  const line=state==='failed'
    ? esc(detail||t('The download did not finish.','다운로드를 끝내지 못했습니다.'))
    : state==='ready'
      ? t('It is in your Downloads folder. Quit Aphrodite, then open it and drag the app to Applications.','다운로드 폴더에 있습니다. Aphrodite를 종료한 뒤 열어서 응용 프로그램으로 옮기세요.')
      : state==='installing'
        ? t('Installing — Aphrodite will restart itself.','설치하는 중입니다 — 잠시 뒤 Aphrodite가 스스로 다시 열립니다.')
        : state==='working'
          ? `${t('Downloading','받는 중')}${detail?` · ${esc(detail)}`:'…'}`
          : `${t('You have','현재')} ${esc(info.current)}${size?` · ${size}`:''}`;
  const actions=state==='ready'
    ? `<button class="primary-button" data-action="update-open">${icon('arrow-up-right')}<span>${t('Open installer','설치 파일 열기')}</span></button>`
      +`<button data-action="update-reveal" class="update-quiet">${t('Show in Finder','Finder에서 보기')}</button>`
    : state==='installing'
      ? `<button class="primary-button" disabled>${icon('circle-dashed')}<span>${t('Installing…','설치하는 중…')}</span></button>`
      : state==='working'
        ? `<button class="primary-button" disabled>${icon('circle-dashed')}<span>${t('Downloading…','받는 중…')}</span></button>`
        // Installing in place is the path people expect; the disk image stays for when it cannot run.
        : `<button class="primary-button" data-action="update-install">${icon('download')}<span>${state==='failed'?t('Try again','다시 시도'):t('Install and restart','설치하고 재시작')}</span></button>`
          +`<button data-action="update-download" class="update-quiet">${t('Download the disk image','디스크 이미지로 받기')}</button>`
          +(info.notes?`<button data-action="update-notes" class="update-quiet">${t("What's new",'변경 내용')}</button>`:'');
  return `<div class="update-card" role="status" aria-live="polite" data-state="${state}">`
    +`<button class="icon-button update-close" data-action="update-dismiss" aria-label="${t('Not now','나중에')}" title="${t('Not now','나중에')}">${icon('x')}</button>`
    +`<strong>${esc(heading)}</strong><p>${line}</p>`
    +`<div class="update-actions">${actions}</div>`
    +`<button class="update-off" data-action="update-never">${t('Stop checking for updates','업데이트 확인 끄기')}</button>`
    +`</div>`;
}
