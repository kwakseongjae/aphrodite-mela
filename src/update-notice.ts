/**
 * Update notice. The app checks its own release feed at most once every few hours, and when a newer
 * version exists it says so in a small card in the bottom-left corner. Clicking downloads that
 * release's disk image; the person still opens it and moves the app across, so nothing on this Mac
 * is replaced without them watching. Declining a version is remembered, so the card asks once.
 */
export type UpdateInfo={current:string;latest?:string;newer:boolean;name?:string;url?:string;size?:number;notes?:string};
export type NoticeState='offer'|'working'|'ready'|'failed';

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

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** The card itself. `state` drives the line of copy and which buttons are offered. */
export function updateNoticeHtml(info:UpdateInfo,state:NoticeState,lang:'en'|'ko',detail=''):string{
  const t=(en:string,ko:string)=>lang==='ko'?ko:en;
  const version=esc(info.latest??'');
  const size=formatSize(info.size);
  const icon=(name:string)=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const heading=state==='ready'
    ? t(`Version ${version} is downloaded`,`${version} 버전을 받았습니다`)
    : t(`Version ${version} is available`,`새 버전 ${version}이 나왔습니다`);
  const line=state==='failed'
    ? esc(detail||t('The download did not finish.','다운로드를 끝내지 못했습니다.'))
    : state==='ready'
      ? t('It is in your Downloads folder. Quit Aphrodite, then open it and drag the app to Applications.','다운로드 폴더에 있습니다. Aphrodite를 종료한 뒤 열어서 응용 프로그램으로 옮기세요.')
      : state==='working'
        ? t('Downloading…','받는 중…')
        : `${t('You have','현재')} ${esc(info.current)}${size?` · ${size}`:''}`;
  const actions=state==='ready'
    ? `<button class="primary-button" data-action="update-open">${icon('arrow-up-right')}<span>${t('Open installer','설치 파일 열기')}</span></button>`
      +`<button data-action="update-reveal" class="update-quiet">${t('Show in Finder','Finder에서 보기')}</button>`
    : state==='working'
      ? `<button class="primary-button" disabled>${icon('circle-dashed')}<span>${t('Downloading…','받는 중…')}</span></button>`
      : `<button class="primary-button" data-action="update-download">${icon('download')}<span>${state==='failed'?t('Try again','다시 시도'):t('Download','받기')}</span></button>`
        +(info.notes?`<button data-action="update-notes" class="update-quiet">${t("What's new",'변경 내용')}</button>`:'');
  return `<div class="update-card" role="status" aria-live="polite" data-state="${state}">`
    +`<button class="icon-button update-close" data-action="update-dismiss" aria-label="${t('Not now','나중에')}" title="${t('Not now','나중에')}">${icon('x')}</button>`
    +`<strong>${esc(heading)}</strong><p>${line}</p>`
    +`<div class="update-actions">${actions}</div>`
    +`<button class="update-off" data-action="update-never">${t('Stop checking for updates','업데이트 확인 끄기')}</button>`
    +`</div>`;
}
