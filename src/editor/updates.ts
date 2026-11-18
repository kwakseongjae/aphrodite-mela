/**
 * The update card: the state behind it, the check that offers it, and what its buttons do.
 *
 * `src/update-notice.ts` already owned how the card looks and how it reads. What lived in `main.ts`
 * was the other half — which version is on offer, how far a download has got, and the eight actions
 * — reaching for whatever happened to be in scope around it. `UpdateHost` is the whole of what that
 * half needs from the app: five things, written down rather than reached for.
 *
 * The same shape as the archive, for the same reason. `main.ts` does not resist splitting because it
 * is long; it resists because nothing in it ever recorded what it depended on.
 */
import {invoke} from '@tauri-apps/api/core';
import {shouldCheck, shouldOffer, updateNoticeHtml, progressLabel, koParticle, keepsCard,
        SKIP_KEY, CHECKED_KEY, OFF_KEY, type UpdateInfo, type NoticeState} from '../update-notice';

/** Everything the update card needs from the app around it. */
export type UpdateHost = {
  desktop: boolean;
  korean: () => boolean;
  ui: (en: string, ko: string) => string;
  toast: (text: string) => void;
  /** Icons are drawn once the card's markup is in the document. */
  hydrateIcons: () => void;
};

export type Updates = ReturnType<typeof createUpdates>;

export function createUpdates(host: UpdateHost) {
  const updateRoot=document.createElement('div');updateRoot.className='update-layer';updateRoot.hidden=true;document.body.append(updateRoot);
  let updateInfo:UpdateInfo|undefined,updateState:NoticeState='offer',updateDetail='',updateFile='';
  function paintUpdate(){
    if(!updateInfo){updateRoot.hidden=true;updateRoot.innerHTML='';return;}
    updateRoot.hidden=false;
    const html=updateNoticeHtml(updateInfo,updateState,host.korean()?'ko':'en',updateDetail);
    const current=updateRoot.querySelector<HTMLElement>('.update-card');
    // Replacing the card on every percent replays its entrance, which reads as the card flashing.
    if(current&&keepsCard(current.dataset.state as NoticeState,updateState)){
      const holder=document.createElement('div');
      holder.innerHTML=html;
      const next=holder.querySelector('.update-card');
      const line=current.querySelector('p');
      const nextLine=next?.querySelector('p');
      if(line&&nextLine)line.textContent=nextLine.textContent??'';
      const bar=current.querySelector<HTMLElement>('.update-bar');
      const nextBar=next?.querySelector<HTMLElement>('.update-bar');
      const fill=current.querySelector<HTMLElement>('.update-bar i');
      const nextFill=next?.querySelector<HTMLElement>('.update-bar i');
      if(bar&&nextBar){
        if(nextBar.hasAttribute('data-indeterminate'))bar.setAttribute('data-indeterminate','true');
        else bar.removeAttribute('data-indeterminate');
      }
      if(fill&&nextFill)fill.style.width=nextFill.style.width;
      return;
    }
    updateRoot.innerHTML=html;
    host.hydrateIcons();
  }
  function closeUpdate(){updateInfo=undefined;updateDetail='';paintUpdate();}
  /** Asks the release feed, at most every few hours and only in the desktop app. Silence on failure:
   *  an offline Mac must not be nagged about a version it could not look up. */
  async function checkForUpdate(){
    if(!host.desktop)return;
    let skipped:string|null=null;
    try{
      if(!shouldCheck(Date.now(),localStorage.getItem(CHECKED_KEY),localStorage.getItem(OFF_KEY)))return;
      skipped=localStorage.getItem(SKIP_KEY);
    }catch{/* storage unavailable: ask once rather than never */}
    try{
      const info=await invoke<UpdateInfo>('update_check');
      try{localStorage.setItem(CHECKED_KEY,String(Date.now()));}catch{/* nothing to remember it with */}
      if(!shouldOffer(info,skipped))return;
      updateInfo=info;updateState='offer';updateDetail='';updateFile='';paintUpdate();
    }catch{/* offline, rate limited, or GitHub unreachable */}
  }
  /* Connected mode: the person keeps the screen and an agent may edit alongside them. The allow lasts

  /** The `update-*` actions. Returns false for anything that is not ours. */
  async function handle(action: string): Promise<boolean> {
    switch(action){
          case 'update-install': {
            if(updateState==='working'||updateState==='installing'||updateState==='restart')break;
            updateState='working';updateDetail='';paintUpdate();
            try{
              const {check}=await import('@tauri-apps/plugin-updater');
              const found=await check();
              if(!found){updateState='failed';updateDetail=host.ui('This version cannot install itself. Use the disk image.','이 버전은 스스로 설치할 수 없습니다. 디스크 이미지로 받아주세요.');paintUpdate();break;}
              let total=0,got=0;
              await found.downloadAndInstall(event=>{
                if(event.event==='Started')total=event.data.contentLength??0;
                else if(event.event==='Progress'){got+=event.data.chunkLength??0;const label=progressLabel(got,total,host.korean()?'ko':'en');if(label!==updateDetail){updateDetail=label;paintUpdate();}}
                else if(event.event==='Finished'){updateState='installing';updateDetail='';paintUpdate();}
              });
              updateState='restart';updateDetail='';paintUpdate();
            }catch(error){updateState='failed';updateDetail=String(error);paintUpdate();}
            break;
          }
          case 'update-relaunch': {
            try{const {relaunch}=await import('@tauri-apps/plugin-process');await relaunch();}
            catch(error){host.toast(String(error));}
            break;
          }
          case 'update-later': closeUpdate();host.toast(host.ui('The new version starts the next time you open Aphrodite.','새 버전은 다음에 열 때 시작합니다.'));break;
          case 'update-download': {
            if(!updateInfo?.url||!updateInfo.name||updateState==='working')break;
            updateState='working';updateDetail='';paintUpdate();
            try{const got=await invoke<{path:string}>('update_download',{url:updateInfo.url,name:updateInfo.name});updateFile=got.path;updateState='ready';}
            catch(error){updateState='failed';updateDetail=String(error);}
            paintUpdate();break;
          }
          case 'update-open': if(updateFile)try{await invoke('update_open',{path:updateFile});}catch(error){host.toast(String(error));}break;
          case 'update-reveal': if(updateFile)try{await invoke('update_reveal',{path:updateFile});}catch(error){host.toast(String(error));}break;
          case 'update-notes': if(updateInfo?.notes)try{await invoke('update_notes',{url:updateInfo.notes});}catch(error){host.toast(String(error));}break;
          case 'update-dismiss': {const skipped=updateInfo?.latest;try{if(skipped)localStorage.setItem(SKIP_KEY,skipped);}catch{/* not remembered */}closeUpdate();if(skipped)host.toast(host.korean()?`${skipped}${koParticle(skipped,'은는')} 건너뜁니다. 다음 버전이 나오면 다시 알려드립니다.`:`Skipping ${skipped}. You will hear about the next one.`);break;}
          case 'update-never': try{localStorage.setItem(OFF_KEY,'1');}catch{/* not remembered */}closeUpdate();host.toast(host.ui('Aphrodite will stop checking for updates.','업데이트 확인을 끕니다.'));break;
      default: return false;
    }
    return true;
  }

  return {check: checkForUpdate, paint: paintUpdate, close: closeUpdate, handle};
}
