/**
 * The reference archive and the taste file, held at arm's length from the editor.
 *
 * The two share a promise — your own words, in a file you can open and cross out — and they share
 * almost nothing with the rest of the editor. They lived in `main.ts` as ambient module state among
 * everything else, which is how a 237,000-character file happens: every feature reaches for whatever
 * is in scope, and nothing ever records what it actually needed.
 *
 * So the dependencies are a parameter. `ArchiveHost` is the whole of what this needs from the app
 * around it — nine things — and writing them down is most of the point. Moving the lines is the
 * smaller half.
 */
import {invoke} from '@tauri-apps/api/core';
import {esc} from '../html';
import type {Project} from '../model';
import type {AssemblyRun} from '../agent/run';
import {POSTER_PREFIX, type Reference, type ReferenceScope} from '../design/references';
import {deriveTaste, renderTaste, parseTaste, mergeTaste, EMPTY as EMPTY_TASTE, type Taste, type TasteConsent} from '../design/taste';
import {fitWithin, worthShrinking, base64Of} from '../design/downscale';

/** Everything the archive needs from the app around it, and nothing else. */
export type ArchiveHost = {
  /** Read live: the person changes project underneath us. */
  project: () => Project;
  library: () => {entries: {project: Project}[]};
  run: () => AssemblyRun | undefined;
  desktop: boolean;
  ui: (en: string, ko: string) => string;
  toast: (text: string) => void;
  showModal: (title: string, subtitle: string, body: string) => void;
  /** Redraw the left panel, when what it lists has changed. */
  refreshPanel: () => void;
  /** Whether the archive tab is the one on screen. */
  onArchiveTab: () => boolean;
};

export type Archive = ReturnType<typeof createArchive>;

export function createArchive(host: ArchiveHost) {
  /* The reference archive. Held in memory only as a cache of what Rust has on disk; the folder is the
     truth, so every change reloads rather than patching this list. */
  let references:Reference[]=[];
  /** Which project the list above belongs to. Without this, opening a second project showed the
      first one's archive until something happened to force a reload. */
  let referencesFor='';
  let referenceScope:ReferenceScope='all';
  const posterCache=new Map<string,string>();
  /* taste.md — off unless the person turns it on. The file is the record; this only reads and writes it.
     Kept beside the archive because they are the same promise: your own words, in a file you can edit. */
  let tasteFile:Taste=EMPTY_TASTE;
  /** Fields this person has rewritten, so one edit is one receipt rather than one per keystroke. */
  const personEdited=new Set<string>();
  async function readTaste():Promise<{markdown:string;taste:Taste}>{
    if(!host.desktop)return {markdown:'',taste:EMPTY_TASTE};
    try{
      const got=await invoke<{markdown:string}>('taste_read',{project:undefined});
      tasteFile=got.markdown?parseTaste(got.markdown):EMPTY_TASTE;
      return {markdown:got.markdown,taste:tasteFile};
    }catch{return {markdown:'',taste:EMPTY_TASTE};}
  }
  /** What we produced last time. Without it a line they struck out cannot be told from a new one. */
  async function readLastDerived():Promise<Taste>{
    try{
      const got=await invoke<{markdown:string}>('taste_read',{project:undefined,file:'taste.derived.json'});
      return got.markdown?{...EMPTY_TASTE,...JSON.parse(got.markdown)}:EMPTY_TASTE;
    }catch{return EMPTY_TASTE;}
  }
  function tasteSignals(){
    const projects=host.library().entries.map(e=>({
      id:e.project.id,
      brief:e.project.brief,
      systemName:e.project.system?.name,
      font:e.project.system?.font,
      variants:e.project.pages.flatMap(pg=>pg.blocks.filter(b=>b.variant).map(b=>`${b.kind}:${b.variant}`)),
    }));
    /* Every run we still have, not only the one open right now. Taste is a habit, and a habit needs
       more than one sitting to show — reading a single run is why `Corrected` was always empty. */
    const stored:AssemblyRun[]=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!key?.startsWith('aphrodite-assembly-run:'))continue;
        const raw=localStorage.getItem(key);
        if(raw)stored.push(JSON.parse(raw) as AssemblyRun);
      }
    }catch{/* unreadable storage is no history, not an error */}
    const live=host.run();
    if(live&&!stored.some(r=>r.id===live.id))stored.push(live);
    const runs=stored.map(run=>({
      id:run.id,
      intent:run.intent,
      vibeWrote:(run.events??[]).filter(e=>e.kind==='vibe:receipt')
        .flatMap(e=>((e.details.changedFields as {nodeId:string;field:string}[]|undefined)??[]).map(c=>`${c.nodeId}:${c.field}`)),
      personRewrote:(run.events??[]).filter(e=>e.kind==='person:edit')
        .map(e=>`${String(e.details.blockId??'')}:${String(e.details.field??'')}`),
      discarded:(run.events??[]).filter(e=>e.kind==='proposal:discarded').length,
      accepted:(run.events??[]).filter(e=>e.kind==='proposal:accepted').length,
    }));
    return {projects,runs};
  }
  async function setTasteConsent(next:TasteConsent){
    const today=new Date().toISOString().slice(0,10);
    if(next==='off'){
      try{await invoke('taste_forget',{project:undefined});}catch(error){host.toast(String(error));return;}
      host.toast(host.ui('Forgotten. Nothing is being recorded.','지웠습니다. 이제 아무것도 기록하지 않습니다.'));
      tasteModal();return;
    }
    const {taste:onFile}=await readTaste();
    const since=onFile.since||today;
    const {projects,runs}=tasteSignals();
    const derived=deriveTaste(projects,runs,next,since,today);
    const lastDerived=await readLastDerived();
    const merged=onFile.consent==='off'?derived:mergeTaste(derived,onFile,lastDerived);
    try{
      await invoke('taste_write',{project:undefined,markdown:renderTaste(merged)});
      // Remember this derivation, so next time a missing line reads as a deletion rather than as news.
      await invoke('taste_write',{project:undefined,file:'taste.derived.json',markdown:JSON.stringify(derived)});
    }catch(error){host.toast(String(error));return;}
    host.toast(host.ui('Written to taste.md. Open it any time; delete any line.','taste.md에 적었습니다. 언제든 열어 보고, 아무 줄이나 지우세요.'));
    tasteModal();
  }
  async function tasteModal(){
    const {markdown,taste}=await readTaste();
    const t=(en:string,ko:string)=>host.ui(en,ko);
    const choice=(id:TasteConsent,en:string,ko:string,whatEn:string,whatKo:string)=>
      `<button type="button" class="taste-choice" data-action="taste-consent" data-consent="${id}" aria-pressed="${taste.consent===id}"><strong>${t(en,ko)}</strong><small>${t(whatEn,whatKo)}</small></button>`;
    const body=markdown
      ? `<pre class="taste-file">${esc(markdown)}</pre>`
      : `<p class="panel-description">${t('Nothing is recorded. Turning this on writes a file you can read and edit — every line carries a count and where it came from.','아무것도 기록하지 않고 있습니다. 켜면 읽고 고칠 수 있는 파일을 씁니다 — 모든 줄에 횟수와 출처가 붙습니다.')}</p>`;
    host.showModal(t('What Aphrodite remembers about your taste','취향에 대해 기억하는 것'),
      t('Off by default. What it keeps is a Markdown file on this Mac, never sent anywhere and never in an export unless you put it there.','기본은 꺼짐입니다. 기록은 이 Mac의 마크다운 파일이고, 어디로도 보내지 않으며 내보내기에도 넣지 않습니다.'),
      `<div class="taste-choices">
        ${choice('off','Off','끄기','Nothing is derived or kept.','아무것도 만들지 않고 남기지 않습니다.')}
        ${choice('project','This project','이 프로젝트','Observed and used inside one project.','한 프로젝트 안에서만 관찰하고 씁니다.')}
        ${choice('global','All projects','모든 프로젝트','Collected in one file and used everywhere.','한 파일에 모아 모든 곳에서 씁니다.')}
      </div>
      ${body}
      ${markdown?`<div class="modal-actions"><button type="button" class="secondary-button" data-action="taste-forget">${t('Forget all of it','전부 잊기')}</button></div>`:''}`);
  }

  async function loadReferences(force=false){
    if(!host.desktop)return;
    if(referencesFor===host.project().id&&!force)return;
    try{
      const got=await invoke<{entries:Reference[]}>('references_list',{project:host.project().id});
      references=got.entries??[];referencesFor=host.project().id;
    }catch{/* the folder is the person's; an unreadable one is an empty archive, not an error */}
  }
  /** Posters come back as data URLs one at a time, the way local pictures do. */
  function hydratePosters(root:ParentNode){
    for(const img of Array.from(root.querySelectorAll<HTMLImageElement>(`img[src^="${POSTER_PREFIX}"]`))){
      const id=(img.getAttribute('src')??'').slice(POSTER_PREFIX.length);
      const hit=posterCache.get(id);
      if(hit){img.src=hit;continue;}
      img.removeAttribute('src');
      invoke<{src:string}>('references_poster',{id,project:host.project().id})
        .then(got=>{posterCache.set(id,got.src);img.src=got.src;})
        .catch(()=>{img.closest('.reference-poster')?.classList.add('reference-poster-missing');});
    }
  }
  /**
   * A picture on its way into the archive, cut down to what a card and the analysis actually need.
   * A phone photograph stored whole crossed the bridge as eleven megabytes of base64 the first time
   * its card was drawn; capped at a 1600px long edge it is a few hundred kilobytes and still carries
   * legible text for the on-device reader.
   */
  async function posterFrom(file: File): Promise<string> {
    const bytes=new Uint8Array(await file.arrayBuffer());
    const raw=()=>{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);};
    try{
      const bitmap=await createImageBitmap(new Blob([bytes],{type:file.type}));
      if(!worthShrinking(bytes.length,bitmap.width,bitmap.height)){bitmap.close();return raw();}
      const {width,height}=fitWithin(bitmap.width,bitmap.height);
      if(!width||!height){bitmap.close();return raw();}
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');
      if(!context){bitmap.close();return raw();}
      context.drawImage(bitmap,0,0,width,height);
      bitmap.close();
      // JPEG, because a photograph is what this usually is and a lossless copy of one is the problem.
      return base64Of(canvas.toDataURL('image/jpeg',0.88));
    }catch{
      // A format the canvas cannot decode is still a picture the person chose: keep it whole.
      return raw();
    }
  }

  /** The `reference-*` and `taste-*` actions. Returns false for anything that is not ours. */
  async function handle(action: string, el: HTMLElement, pickFile: (accept: string, run: (file: File) => Promise<void>) => void, onPromote: (src: string) => void): Promise<boolean> {
    switch(action){
          case 'taste': await tasteModal(); break;
          case 'taste-consent': await setTasteConsent((el.dataset.consent as TasteConsent)??'off'); break;
          case 'taste-forget': await setTasteConsent('off'); break;
          case 'reference-scope': referenceScope=(el.dataset.scope as ReferenceScope)??'all'; host.refreshPanel(); break;
          case 'reference-add-image': pickFile('image/png,image/jpeg,image/webp',async file=>{
            if(file.size>16_000_000)throw new Error(host.ui('Pick an image under 16 MB.','16MB 이하 이미지를 골라주세요.'));
            const scope=el.dataset.scope==='project'?host.project().id:undefined;
            await invoke('references_add',{item:{kind:'image',title:file.name.replace(/\.[^.]+$/,''),poster:await posterFrom(file),addedBy:'human'},project:scope});
            await loadReferences(true);host.refreshPanel();
            host.toast(host.ui('Kept in the archive','아카이브에 넣었습니다'));
          });break;
          case 'reference-add-link': {
            host.showModal(host.ui('Keep a reference','레퍼런스 넣기'),host.ui('The address, and a line about why it is here. Nothing is fetched yet — this saves what you typed.','주소와, 왜 넣는지 한 줄. 아직 아무것도 가져오지 않습니다 — 적은 것만 저장합니다.'),
              `<form id="reference-form"><label class="form-label">${host.ui('Address','주소')}<input name="url" type="url" placeholder="https://" required></label><label class="form-label">${host.ui('Title','제목')}<input name="title" type="text"></label><label class="form-label">${host.ui('Why it is here','왜 넣는지')}<textarea name="note" rows="3"></textarea></label><label class="form-label">${host.ui('Tags, separated by commas','태그, 쉼표로 구분')}<input name="tags" type="text"></label><div class="modal-actions"><button type="submit" class="primary-button">${host.ui('Keep it','넣기')}</button></div></form>`);
            break;
          }
          case 'reference-promote': {
            const hit=references.find(r=>r.id===el.dataset.id);
            if(!hit)break;
            if(!hit.poster){host.toast(host.ui('That reference has no picture to analyse yet.','그 레퍼런스에는 아직 분석할 그림이 없습니다.'));break;}
            try{
              const got=await invoke<{src:string}>('references_poster',{id:hit.poster,project:host.project().id});
              // Keeping and using are separate. The archive found the picture; putting it on the
              // analysis slot is the editor's business, so hand it back rather than reach in.
              onPromote(got.src);
            }catch(error){host.toast(String(error));}
            break;
          }
          case 'reference-lookup': {
            const hit=references.find(r=>r.id===el.dataset.id);
            if(!hit?.url)break;
            const scope=hit.scope==='project'?host.project().id:undefined;
            host.toast(host.ui('Looking it up…','가져오는 중…'));
            try{
              const got=await invoke<{url:string;title:string;poster:string}>('references_fetch',{url:hit.url});
              await invoke('references_add',{item:{kind:hit.kind,url:hit.url,title:got.title||hit.title,note:hit.note,tags:hit.tags,poster:got.poster||undefined,addedBy:hit.addedBy,alive:true},project:scope});
              host.toast(got.poster?host.ui('Got the title and a picture','제목과 그림을 가져왔습니다'):host.ui('Got the title; the page offered no picture','제목만 가져왔습니다 — 페이지에 그림이 없습니다'));
            }catch{
              // The card stays: the point of keeping bytes is that a dead link still shows something.
              await invoke('references_add',{item:{kind:hit.kind,url:hit.url,title:hit.title,note:hit.note,tags:hit.tags,addedBy:hit.addedBy,alive:false},project:scope}).catch(()=>{});
              host.toast(host.ui('That address did not answer. The card is kept and marked.','주소가 답하지 않습니다. 카드는 남기고 표시해 둡니다.'));
            }
            await loadReferences(true);host.refreshPanel();
            break;
          }
          case 'reference-open': {
            const hit=references.find(r=>r.id===el.dataset.id);
            if(!hit?.url)break;
            try{await invoke('open_external',{url:hit.url});}catch(error){host.toast(String(error));}
            break;
          }
          case 'reference-delete': {
            const id=el.dataset.id;if(!id)break;
            const hit=references.find(r=>r.id===id);
            const scope=hit?.scope==='project'?host.project().id:undefined;
            try{await invoke('references_delete',{id,project:scope});}catch(error){host.toast(String(error));break;}
            await loadReferences(true);host.refreshPanel();
            host.toast(host.ui('Removed from the archive','아카이브에서 뺐습니다'));
            break;
          }
      default: return false;
    }
    return true;
  }

  return {
    /** What the panel lists, and which chip is lit. */
    entries: () => references,
    scope: () => referenceScope,
    setScope: (next: ReferenceScope) => {referenceScope = next;},
    load: loadReferences,
    hydratePosters,
    posterFrom,
    /** The parsed taste file, for ordering the three directions. */
    taste: () => tasteFile,
    readTaste,
    openTasteSheet: tasteModal,
    /** One receipt per field per run: the count that matters is how many runs, not how many keys. */
    firstEditOf: (blockId: string, field: string) => {
      const key = `${blockId}:${field}`;
      if (personEdited.has(key)) return false;
      personEdited.add(key);
      return true;
    },
    handle,
  };
}
