import { type Block, type Project, type Page, safeImage } from './model';
import pageCss from './page.css?raw';
import { componentIdentity } from './components';
import { isPattern } from './patterns';
import { patternHtml, planningHtml, defaultPlanningText } from './pattern-render';
import patternCss from './patterns.css?raw';
import { installPatternRuntime } from './pattern-runtime';
import { libraryHtml } from './library-render';
import { frameStyle, layoutStyle } from './layout';
import moaCss from './moa.css?raw';
import {installMoaRuntime} from './moa-runtime';
import {moaHtml} from './moa-render';
import {esc} from './html';
import {decorationCopy} from './design/decoration-copy';
import {collectionRows} from './design/collection';
import {onColor} from './design/contrast';
import {componentProject} from './design/component-theme';
import {demoAnchor} from './design/demo-anchor';
export {esc} from './html';
export function blockHtml(b: Block, p?: Project, blocks?:Block[]): string {
  if(p&&b.theme){const scoped=componentProject(b,p);return `<div data-theme-mode="${b.theme.mode}" style="${esc(themeVars(scoped))}">${blockHtml({...b,theme:undefined},scoped,blocks)}</div>`;}
  const identity = componentIdentity(b);
  return (b.provider && b.provider!=='own' ? libraryHtml(b,p) : b.kind==='moadetail'?moaHtml(b,blocks?.find(c=>c.kind==='moacard'&&c.title==='온보딩 플로우 설계')??blocks?.find(c=>c.kind==='moacard')):blockContent(b,p?.contentLanguage)).replace(/^(<\w+)/, `$1 data-component-id="${identity.componentId}" data-component-version="${identity.componentVersion}" data-variant="${identity.variant}"`);
}
export function renderTree(blocks:Block[],p:Project,parentId?:string,decorate?:(b:Block,content:string)=>string):string {
  return blocks.filter(b=>b.parentId===parentId).map(b=>{
    let content=b.kind==='frame'?`<section class="layout-frame" data-component-id="aphrodite.frame" data-variant="${esc(b.variant??'default')}" data-app-frame="${esc(b.variant??'default')}" aria-label="${esc(b.title)}" style="${frameStyle(b)}">${b.variant==='app-lane'?`<h3 class="moa-lane-title">${esc(b.title)}</h3>`:''}${renderTree(blocks,p,b.id,decorate)}</section>`:blockHtml(b,p,blocks).replace(/id="(?:collection|contact)"/,`id="block-${esc(b.id)}"`);
    if(b.kind==='moatoolbar')for(const status of ['진행 중','검토 대기','완료'])content=content.replace(`data-moa-count="${status}">—`,`data-moa-count="${status}">${blocks.filter(n=>n.kind==='moacard'&&n.text.split('|')[3]===status).length}`);
    return `<div class="layout-item" data-node-id="${esc(b.id)}" style="${layoutStyle(b,blocks)}">${decorate?decorate(b,content):content}</div>`;
  }).join('');
}
function blockContent(b: Block,language:'en'|'ko'='en'): string {
  if (isPattern(b.kind)) return patternHtml(b);
  const d=decorationCopy[language];
  const t = esc(b.title).replace(/\n/g, '<br>'), p = esc(b.text).replace(/\n/g, '<br>'), l = esc(b.label);
  const image = safeImage(b.image);
  const media = (src: string, alt: string, cls = '') => src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : `<div class="media-placeholder ${cls}" aria-label="${d.imageLabel}"><span>↗</span><small>${d.image}</small></div>`;
  switch (b.kind) {
    case 'frame': return '<section class="layout-frame"></section>';
    case 'navigation': return `<nav class="site-nav"><a class="site-wordmark" href="#top">${t}</a><div class="site-links">${b.text.split('·').map(v => `<a href="#collection">${esc(v.trim())}</a>`).join('')}</div><a class="site-nav-action" href="#collection">${l} <span>↗</span></a></nav>`;
    case 'hero': return `<section class="site-hero"><div class="hero-copy"><span class="eyebrow">${esc(b.eyebrow ?? d.eyebrow)}</span><h1>${t}</h1><p>${p}</p><a class="site-button" href="#collection">${l} <span>↗</span></a>${b.eyebrow === undefined ? `<div class="hero-footnote"><span class="tiny-star">✳</span> ${d.footnote}</div>` : ''}</div><div class="hero-media">${b.options?.media === 'calendar' ? `<div class="kit-hero-preview" data-component-id="aphrodite.calendar" data-component-version="1" data-variant="week"><p>${esc(b.options.placeholder ?? d.calendar)}</p>${planningHtml(b.options.mediaText ?? defaultPlanningText)}</div>` : image ? media(image, b.title) : `<div class="media-placeholder" aria-label="${d.imageLabel}"><span>↗</span><small>${esc(b.options?.placeholder ?? d.image)}</small></div>`}${b.eyebrow === undefined && b.options?.media !== 'calendar' ? `<span class="image-caption">${d.caption} <span>01 — 03</span></span>` : ''}</div></section>`;
    case 'features': return `<section class="site-features"><div class="feature-heading"><span class="eyebrow">${l}</span><h2>${t}</h2></div><div class="feature-columns">${b.text.split('\n').map((v, i) => { const [title, text = ''] = v.split('|'); return `<article><span class="feature-symbol">${['✳', '◇', '↗'][i % 3]}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`; }).join('')}</div></section>`;
    case 'products': return `<section class="site-products" id="collection"><div class="collection-heading"><div><span class="eyebrow">${l}</span><h2>${t}</h2>${b.description?`<p class="collection-description">${esc(b.description).replace(/\n/g,'<br>')}</p>`:''}</div><a href="#contact">${d.viewAll} <span>↗</span></a></div><div class="product-grid">${collectionRows(b).map(({title,text,image,index})=>`<article data-image-slot="${index}">${media(image,title)}<div><h3>${esc(title)}</h3><span>↗</span></div><p>${esc(text)}</p></article>`).join('')}</div></section>`;
    case 'testimonial': return `<section class="site-testimonial"><span class="eyebrow">${l}</span><blockquote>${t}</blockquote><p>${p}</p></section>`;
    case 'cta': return `<section class="site-cta" id="contact"><div><h2>${t}</h2><p>${p}</p></div><a class="site-button" href="#collection">${l} <span>↗</span></a></section>`;
    case 'footer': return `<footer class="site-footer" id="contact"><div><span class="site-wordmark">${t}</span><p>${p}</p></div><small>${l}</small></footer>`;
  }
  return '';
}
export function themeVars(p: Project): string {
  const rgb = p.system.accent.slice(1).match(/../g)!.map(h => { const v = parseInt(h, 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  const onBrand = onColor(p.system.accent);
  return `--brand:${p.system.accent};--on-brand:${onBrand};--paper:${p.system.background};--ink:${p.system.foreground};--radius:${p.system.radius}px;--heading:${p.system.font === 'serif' ? "Georgia, 'Times New Roman', serif" : "Arial, Helvetica, sans-serif"}`;
}
export function pageHtml(p: Project, page: Page): string {
  const content = renderTree(page.blocks,p).replaceAll('id="collection"','id="collection-section"').replaceAll('id="contact"','id="contact-section"')
    .replaceAll('href="#collection"', `href="#${demoAnchor(page.blocks,'collection')}"`)
    .replaceAll('href="#contact"', `href="#${demoAnchor(page.blocks,'contact')}"`);
  return `<!doctype html>\n<html lang="${/[가-힣]/.test(page.blocks.map(b=>b.title+b.text).join('')) ? 'ko' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src about:; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'"><title>${esc(p.name)} — ${esc(page.name)}</title><style>${pageCss}\n${patternCss}\n${moaCss}</style></head><body style="margin:0"><main class="design-page" id="top" style="${esc(themeVars(p))}">${content}</main><script>(${installPatternRuntime.toString()})(document);(${installMoaRuntime.toString()})(document)</script></body></html>`;
}
