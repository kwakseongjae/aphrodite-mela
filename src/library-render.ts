import type { Block, Project } from './model';
import {onColor} from './design/contrast';

/**
 * The official-library runtime is fetched when something actually needs it.
 *
 * It is React plus four vendor stylesheets — 1,330 kB of script and 408 kB of css — and it was
 * imported as a raw string at the top of this file, so it sat in the main chunk and was parsed on
 * every launch. Three quarters of the bundle, for a preview most sessions never open: a project
 * whose blocks are all `own` never touches a line of it.
 *
 * `libraryHtml` stays synchronous, because the render loop, the export and the tests all call it
 * that way and making it async would ripple through every one of them. Instead the bytes live in a
 * cache this module fills on request, and a call that arrives before they land gets a quiet frame
 * that says so rather than a broken one.
 */
let runtime: string | undefined;
let vendorCss: string | undefined;
let arriving: Promise<void> | undefined;

export function libraryRuntimeReady(): boolean {
  return runtime !== undefined;
}

/** Fetches it once; every later caller waits on the same promise. */
export function loadLibraryRuntime(): Promise<void> {
  if (runtime !== undefined) return Promise.resolve();
  arriving ??= Promise.all([
    import('./generated/library-runtime.js?raw'),
    import('./generated/library-runtime.css?raw'),
  ]).then(([js, css]) => {
    runtime = (js as {default: string}).default;
    vendorCss = (css as {default: string}).default;
  });
  return arriving;
}

/** True when this project has anything the runtime is needed for. */
export function needsLibraryRuntime(p: {pages: {blocks: {provider?: string}[]}[]}): boolean {
  return p.pages.some(page => page.blocks.some(b => b.provider !== undefined && b.provider !== 'own'));
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function libraryHtml(b:Block,p?:Project):string {
  if(runtime===undefined||vendorCss===undefined){
    // Not here yet. Say so plainly rather than draw an empty box someone reads as a broken component.
    void loadLibraryRuntime();
    return `<section class="official-component official-pending" data-provider="${escape(b.provider??'')}"><div class="official-pending-note">${escape(b.provider??'')} · loading</div></section>`;
  }
  // Provider styles share the bundle; explicitly own the adapted button's resting colors.
  const css=vendorCss;
  const scopedCss=b.provider!=='shadcn'?'':b.kind==='button'?`#root button{color:${b.variant==='outline'||b.variant==='ghost'?'var(--ink)':'var(--on-brand)'};background:${b.variant==='outline'||b.variant==='ghost'?'var(--paper)':'var(--brand)'};border:${b.variant==='outline'?'1px solid var(--ink)':'0'}}`:b.kind==='input'||b.kind==='textarea'?`#root input,#root textarea{color:var(--ink);background:${b.variant==='filled'?'#f4f4f5':'var(--paper)'};border:1px solid ${b.options?.state==='error'?'#dc2626':'#d4d4d8'}}`:b.kind==='notice'?`#root [role="alert"]{background:var(--paper);color:${b.variant==='error'?'#dc2626':'var(--ink)'}}`:b.kind==='cards'?`#root .bg-card{background:var(--paper);color:var(--ink)}`:b.kind==='table'?`#root table{color:var(--ink)}`:b.kind==='badge'?`#root .bg-primary{background:var(--brand);color:var(--on-brand)}`:b.kind==='pagination'||b.kind==='breadcrumb'?`#root a{color:var(--ink)}`:'';
  const system=p?.system??{accent:'#344e41',background:'#ffffff',foreground:'#191919',radius:8};
  const headingFont=p?.system.font==='serif'?"Georgia, 'Times New Roman', serif":"Arial, Helvetica, sans-serif";
  const props=JSON.stringify({...b,accent:system.accent,onAccent:onColor(system.accent),foreground:system.foreground,background:system.background,headingFont,radius:system.radius}).replaceAll('<','\\u003c');
  const doc=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>/*CSS_START*/${css.replaceAll('</style','<\\/style')}/*CSS_END*/</style></head><body style="--brand:${system.accent};--on-brand:${onColor(system.accent)};--paper:${system.background};--ink:${system.foreground};--radius:${system.radius}px"><div id="root" data-props="${escape(props)}"></div><script>/*RUNTIME_START*/${runtime.replaceAll('</script','<\\/script')}/*RUNTIME_END*/</script></body></html>`;
  const styledDoc=doc.replace('</head>',`<style data-component-style>${scopedCss}</style></head>`);
  // Authored copy belongs to the page, not to the vendor's isolated demo frame.
  // Keep provider controls sandboxed while headings inherit the reviewed project style.
  const button=b.kind==='button';
  const flexible=!button&&b.layout?.height!==undefined;
  const sectionStyle=flexible?`height:${b.layout!.height}px;box-sizing:border-box;display:flex;flex-direction:column`:b.layout?.height?'padding:16px':'';
  const frameHeight:Record<string,number>={button:90,input:112,textarea:120,select:112,toggle:110,slider:120,notice:120,badge:110,avatar:120,chips:120,progress:120,breadcrumb:120,pagination:120,switch:120,checkbox:120,tabs:240,accordion:260,stepper:250,skeleton:240,cards:360,table:360,stats:360,calendar:240};
  const frameSizing=flexible?'height:auto;flex:1;min-height:64px':`height:${frameHeight[b.kind]??120}px`;
  const copy=button||b.kind==='cards'?`<div class="official-copy">${b.title?`<h2>${escape(b.title).replaceAll('\n','<br>')}</h2>`:''}${button&&b.text?`<p>${escape(b.text).replaceAll('\n','<br>')}</p>`:''}</div>`:'';
  return `<section class="official-component official-action" data-provider="${b.provider}"${sectionStyle?` style="${sectionStyle}"`:''}>${copy}<iframe title="${escape(b.provider+' '+b.kind+' · '+b.title)}" sandbox="allow-scripts" style="display:block;border:0;width:100%;${frameSizing}" srcdoc="${escape(styledDoc)}"></iframe></section>`;
}
