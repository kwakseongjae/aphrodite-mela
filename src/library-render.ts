import type { Block, Project } from './model';
import runtime from './generated/library-runtime.js?raw';
import vendorCss from './generated/library-runtime.css?raw';
import {onColor} from './design/contrast';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function libraryHtml(b:Block,p?:Project):string {
  // Provider styles share the bundle; explicitly own the adapted button's resting colors.
  const css=vendorCss;
  const scopedCss=b.provider==='shadcn'?`#root button{color:${b.variant==='outline'||b.variant==='ghost'?'var(--ink)':'var(--on-brand)'};background:${b.variant==='outline'||b.variant==='ghost'?'var(--paper)':'var(--brand)'};border:${b.variant==='outline'?'1px solid var(--ink)':'0'}}`:'';
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
  const frameSizing=flexible?'height:auto;flex:1;min-height:64px':`height:${button?90:b.kind==='input'?112:360}px`;
  const copy=button||b.kind==='cards'?`<div class="official-copy">${b.title?`<h2>${escape(b.title).replaceAll('\n','<br>')}</h2>`:''}${button&&b.text?`<p>${escape(b.text).replaceAll('\n','<br>')}</p>`:''}</div>`:'';
  return `<section class="official-component official-action" data-provider="${b.provider}"${sectionStyle?` style="${sectionStyle}"`:''}>${copy}<iframe title="${escape(b.provider+' '+b.kind+' · '+b.title)}" sandbox="allow-scripts" style="display:block;border:0;width:100%;${frameSizing}" srcdoc="${escape(styledDoc)}"></iframe></section>`;
}
