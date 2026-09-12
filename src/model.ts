import { patternSpecs, isPattern, patternVariants, validOptions, type PatternKind, type PatternOptions } from './patterns';
import {sanitizeSpace,type Space} from './editor/space';
import {isSampleSrc} from './design/sample-images';
import {isLocalRef} from './design/local-images';
import {sanitizeFamily} from './design/fonts';
import { supportsProvider, type Provider } from './providers';
import {validComponentTheme,type ComponentTheme} from './design/component-theme';
import {validShelf,type ShelfChoice} from './design/shelf';
import { validLayout, validateTree, type Layout } from './layout';
import {ownSystems} from './design/presets';
export type BlockKind = 'frame' | 'navigation' | 'hero' | 'features' | 'products' | 'testimonial' | 'cta' | 'footer' | PatternKind;
export type HeroVariant = 'split' | 'image-left' | 'stacked';
export type Block = { id: string; kind: BlockKind; title: string; text: string; label: string; image: string; filled: boolean; variant?: string; eyebrow?: string; description?:string; itemImages?:string[]; options?: PatternOptions; provider?: Provider; theme?:ComponentTheme; parentId?: string; layout?: Layout };
export type DesignSystem = { id: string; name: string; description: string; accent: string; background: string; foreground: string; radius: number; font: 'serif' | 'sans'; headingFamily?: string; bodyFamily?: string; source: string; originalMarkdown?: string };
export type ReferenceEvidence = { engine: 'Apple Vision + pixels' | 'Pixels only'; sourceFingerprint: string; textLines: number; palette: string[]; elapsedMs: number; direction: HeroVariant; mediaUsed: boolean };
export type VibeReceipt = {packId:string;changedFields:number;source:'local-authored-demo';imageSource:'user-upload'|'bundled-generated'|'none';modelCalled:false};
export type PageProposal={fromPageId:string;label:string;kind:'reference-direction'|'vibe'|'agent'};
export type Page = { id: string; name: string; blocks: Block[]; referenceEvidence?: ReferenceEvidence; vibeReceipt?:VibeReceipt; proposal?:PageProposal };
export type Project = { version: 1; id: string; name: string; brief: string; system: DesignSystem; pages: Page[]; activePageId: string; reference?: string; approvedFingerprint?: string; contentLanguage?:'en'|'ko'; shelf?:ShelfChoice[]; space?:Space };
export const uid = () => crypto.randomUUID();
export const systems: DesignSystem[] = [
  ...ownSystems,
  {id:'mui',name:'Material · MUI',description:'Official React adapters + project tokens',accent:'#1976d2',background:'#ffffff',foreground:'#1b1b1f',radius:4,font:'sans',source:'MUI official package adapters for Button, TextField, Card. Remaining compositions are Aphrodite originals.'},
  {id:'shadcn',name:'shadcn · open code',description:'Source-owned UI with neutral foundations',accent:'#18181b',background:'#ffffff',foreground:'#18181b',radius:8,font:'sans',source:'shadcn new-york Button adapted with project-owned tokens; not a complete registry import.'},
  {id:'seed',name:'SEED · official adapter',description:'Karrot SEED ActionButton + own layouts',accent:'#ff6f0f',background:'#ffffff',foreground:'#212124',radius:8,font:'sans',source:'Official @seed-design/react ActionButton. Library default theme preserved; other compositions are Aphrodite originals.'},
  {id:'astryx',name:'Astryx · Neutral',description:'Meta official Button · beta',accent:'#282828',background:'#ffffff',foreground:'#202020',radius:8,font:'sans',source:'Official @astryxdesign/core Button + theme-neutral 0.5.4. Not a full library port.'},
  { id: 'atelier', name: 'Atelier', description: 'Warm, editorial & quietly confident', accent: '#344e41', background: '#faf8f3', foreground: '#292d27', radius: 2, font: 'serif', source: 'Aphrodite original project preset. Not an external brand system.' },
  { id: 'karrot', name: 'Karrot inspired', description: 'Friendly utility. A little more local.', accent: '#ff6f0f', background: '#ffffff', foreground: '#212124', radius: 8, font: 'sans', source: 'oh-my-design/design-md/karrot/DESIGN.md, inspected locally 2026-09-08. SEED product primary, canvas, foreground and radius. Compositions are Aphrodite originals, not official SEED components.' },
  { id: 'toss', name: 'Toss inspired', description: 'Clear hierarchy. Effortless decisions.', accent: '#3182f6', background: '#ffffff', foreground: '#191f28', radius: 12, font: 'sans', source: 'oh-my-design/design-md/toss/DESIGN.md, inspected locally 2026-09-08. TDS product primary, canvas and foreground. Radius and layouts are prototype decisions, not official TDS components.' },
  { id: 'mono', name: 'Mono', description: 'Precise, minimal & made for products', accent: '#282828', background: '#ffffff', foreground: '#191919', radius: 0, font: 'sans', source: 'Aphrodite original project preset. Not an external brand system.' },
];
export const catalog: { kind: BlockKind; name: string; description: string; icon: string; category: string }[] = [
  { kind:'frame',name:'Layout frame',description:'Nest components · grid or free positioning',icon:'frame',category:'Structure' },
  { kind: 'navigation', name: 'Navigation', description: 'Brand, links & a clear next step', icon: 'panel-top', category: 'Structure' },
  { kind: 'hero', name: 'Editorial hero', description: 'A first impression with room to breathe', icon: 'panels-top-left', category: 'Sections' },
  { kind: 'features', name: 'Feature row', description: 'Three reasons to believe', icon: 'columns-3', category: 'Sections' },
  { kind: 'products', name: 'Collection grid', description: 'A curated set of cards', icon: 'layout-grid', category: 'Sections' },
  { kind: 'testimonial', name: 'Testimonial', description: 'A little social proof', icon: 'quote', category: 'Content' },
  { kind: 'cta', name: 'Call to action', description: 'Turn a feeling into a next step', icon: 'mouse-pointer-2', category: 'Content' },
  { kind: 'footer', name: 'Footer', description: 'A considered finishing touch', icon: 'panel-bottom', category: 'Structure' },
  ...Object.entries(patternSpecs).map(([kind, spec]) => ({ kind: kind as PatternKind, name: spec.name, description: spec.help, icon: spec.icon, category: spec.category })),
];
export function makeBlock(kind: BlockKind, filled = false): Block {
  if (isPattern(kind)) { const s = patternSpecs[kind]; return { id: uid(), kind, title: s.title, text: s.text, label: s.label, image: '', filled: true, variant: s.variants[0], options: { density: 'comfortable', columns: 3, state: 'default' } }; }
  const content: Record<Exclude<BlockKind, PatternKind>, [string, string, string, string]> = {
    frame: ['Layout frame','','',''],
    navigation: ['form & field', 'Collection · Our story · Journal', 'Explore collection', ''],
    hero: ['Objects for\na slower life.', 'Thoughtful furniture and everyday objects.\nMade with care. Made to stay.', 'Discover the collection', '/assets/interior.jpg'],
    features: ['Good things take intention.', 'Honest materials|Solid wood, natural fibers. Nothing to hide.\nMade to last|Considered details, for years of everyday living.\nA lighter footprint|Small batches. Thoughtfully sourced.', 'OUR APPROACH', ''],
    products: ['Find your everyday favorite.', 'The reading chair|From $240\nThe quiet corner|From $180\nA place to gather|From $620', 'THE CONSIDERED COLLECTION', '/assets/chair.jpg'],
    testimonial: ['“The kind of pieces that make a house feel a little more like you.”', 'A note from our community', 'FIELD NOTES', ''],
    cta: ['Make room for what matters.', 'A considered collection, delivered to your inbox. No noise, just good things.', 'Explore the collection', ''],
    footer: ['form & field', 'Thoughtfully made. Intentionally yours.', '© 2026 Form & Field', ''],
  };
  const [title, text, label, image] = content[kind];
  return { id: uid(), kind, title: filled ? title : kind === 'navigation' || kind === 'footer' ? 'Your brand' : `Your ${catalog.find(c => c.kind === kind)!.name.toLowerCase()}`, text: filled ? text : 'Your story goes here. Add your own content or try Auto fill.', label: filled ? label : 'Your next step', image: filled ? image : '', filled };
}
export function initialProject(): Project {
  const id = uid();
  return { version: 1, id: uid(), name: 'Form & Field', brief: 'A warm, editorial furniture store. Natural materials, thoughtful objects, and a slower way of living.', system: { ...systems.find(s=>s.id==='atelier')! }, pages: [{ id, name: 'Home', blocks: (['navigation', 'hero', 'features', 'products', 'footer'] as BlockKind[]).map(k => makeBlock(k, true)) }], activePageId: id };
}
export function currentPage(p: Project) { return p.pages.find(x => x.id === p.activePageId)!; }
export function fingerprint(p: Project): string {
  // Local change detector, not a security signature. Two independent 32-bit accumulators
  // avoid duplicating multi-megabyte uploaded images in storage and history snapshots.
  const value = JSON.stringify({ name: p.name, brief: p.brief, system: p.system, pages: p.pages, reference: p.reference, contentLanguage:p.contentLanguage });
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
  return `${value.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
export function isApproved(p: Project) { return p.approvedFingerprint === fingerprint(p); }
export function assemble(brief: string): BlockKind[] {
  if (/shop|store|furniture|commerce|가구|쇼핑|스토어|상품/.test(brief.toLowerCase())) return ['navigation', 'hero', 'products', 'features', 'footer'];
  if (/portfolio|studio|포트폴리오|스튜디오/.test(brief.toLowerCase())) return ['navigation', 'hero', 'products', 'testimonial', 'footer'];
  return ['navigation', 'hero', 'features', 'testimonial', 'cta', 'footer'];
}
export function safeImage(value: string) {
  return /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value) || /^\/assets\/(interior|chair|living)\.jpg$/.test(value) || value==='/assets/lighting-hero.png' || isSampleSrc(value) || isLocalRef(value) ? value : '';
}
export function parseProject(raw: string): Project {
  if (raw.length > 20_000_000) throw new Error('프로젝트는 20MB 이하여야 합니다.');
  const p = JSON.parse(raw) as Project;
  const str = (v: unknown, max = 20000) => typeof v === 'string' && v.length <= max;
  const validId = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(v);
  if (!p || p.version !== 1 || !str(p.id, 200) || !str(p.name, 200) || !str(p.brief) || !p.system || !Array.isArray(p.pages) || !p.pages.length || p.pages.length > 30) throw new Error('지원하지 않는 프로젝트 형식입니다.');
  const s = p.system;
  if(p.shelf!==undefined&&!validShelf(p.shelf))throw new Error('Invalid project assembly shelf');
  if(p.contentLanguage!==undefined&&!['en','ko'].includes(p.contentLanguage))throw new Error('Unsupported content language');
  if(p.space!==undefined){const space=sanitizeSpace(p.space);if(space)p.space=space;else delete p.space;}
  if (s.headingFamily !== undefined) { const clean = sanitizeFamily(s.headingFamily); if (clean) s.headingFamily = clean; else delete s.headingFamily; }
  if (s.bodyFamily !== undefined) { const clean = sanitizeFamily(s.bodyFamily); if (clean) s.bodyFamily = clean; else delete s.bodyFamily; }
  if (![s.accent, s.background, s.foreground].every(v => /^#[a-fA-F0-9]{6}$/.test(v)) || !Number.isFinite(s.radius) || s.radius < 0 || s.radius > 48 || !['serif', 'sans'].includes(s.font) || ![s.name, s.id, s.description, s.source].every(v => str(v)) || (s.originalMarkdown !== undefined && !str(s.originalMarkdown, 200000))) throw new Error('디자인 토큰 형식이 올바르지 않습니다.');
  const ids = new Set<string>();
  for (const page of p.pages) {
    if (!page || !validId(page.id) || ids.has(page.id) || !str(page.name, 100) || !Array.isArray(page.blocks) || page.blocks.length > 100) throw new Error('페이지 형식이 올바르지 않습니다.');
    ids.add(page.id);
    if(page.proposal!==undefined&&(!validId(page.proposal.fromPageId)||!str(page.proposal.label,100)||!['reference-direction','vibe','agent'].includes(page.proposal.kind)))throw new Error('페이지 제안 형식이 올바르지 않습니다.');
    const vibe=page.vibeReceipt;
    if(vibe&&(!str(vibe.packId,100)||!Number.isInteger(vibe.changedFields)||vibe.changedFields<0||vibe.changedFields>400||vibe.source!=='local-authored-demo'||!['user-upload','bundled-generated','none'].includes(vibe.imageSource)||vibe.modelCalled!==false))throw new Error('Get Vibe 기록이 올바르지 않습니다.');
    const evidence = page.referenceEvidence;
    if (evidence && (!['Apple Vision + pixels', 'Pixels only'].includes(evidence.engine) || !str(evidence.sourceFingerprint, 100) || !Number.isInteger(evidence.textLines) || evidence.textLines < 0 || evidence.textLines > 200 || !Number.isFinite(evidence.elapsedMs) || evidence.elapsedMs < 0 || !['split', 'image-left', 'stacked'].includes(evidence.direction) || typeof evidence.mediaUsed !== 'boolean' || !Array.isArray(evidence.palette) || evidence.palette.length > 8 || !evidence.palette.every(c => /^#[a-fA-F0-9]{6}$/.test(c)))) throw new Error('레퍼런스 분석 기록이 올바르지 않습니다.');
    for (const b of page.blocks) {
      if (!b || !validId(b.id) || ids.has(b.id) || !catalog.some(c => c.kind === b.kind) || ![b.title, b.text, b.label].every(v => str(v)) || !str(b.image, 4_000_000) || (b.image !== '' && !safeImage(b.image)) || typeof b.filled !== 'boolean') throw new Error('컴포넌트 형식이 올바르지 않습니다.');
      ids.add(b.id);
      if(b.theme!==undefined&&!validComponentTheme(b.theme,b))throw new Error('Invalid component theme policy');
      if(b.description!==undefined&&(b.kind!=='products'||!str(b.description,2000)))throw new Error('Invalid collection description');
      if(b.itemImages!==undefined&&(b.kind!=='products'||!Array.isArray(b.itemImages)||b.itemImages.length>30||!b.itemImages.every(image=>str(image,4_000_000)&&(image===''||!!safeImage(image)))))throw new Error('Invalid collection images');
      if ((b.provider!==undefined && !supportsProvider(b.provider,b.kind)) || (b.layout!==undefined && !validLayout(b.layout)) || (b.parentId!==undefined && !validId(b.parentId))) throw new Error('라이브러리 또는 레이아웃 설정이 올바르지 않습니다.');
      if ((b.variant !== undefined && !patternVariants(b.kind).includes(b.variant)) || (b.eyebrow !== undefined && !str(b.eyebrow, 200)) || (b.options !== undefined && !validOptions(b.options, b.kind))) throw new Error('컴포넌트 변형이 올바르지 않습니다.');
    }
    if (!validateTree(page.blocks)) throw new Error('프레임 중첩이 올바르지 않습니다 (순환/누락/깊이 초과).');
  }
  if (!p.pages.some(page => page.id === p.activePageId) || (p.reference !== undefined && (!str(p.reference, 4_000_000) || !safeImage(p.reference)))) throw new Error('프로젝트 참조가 올바르지 않습니다.');
  return { version: 1, id: p.id, name: p.name, brief: p.brief, system: { ...s }, pages: p.pages, activePageId: p.activePageId, reference: p.reference, approvedFingerprint: typeof p.approvedFingerprint === 'string' ? p.approvedFingerprint : undefined, ...(p.contentLanguage?{contentLanguage:p.contentLanguage}:{}), ...(p.shelf?{shelf:p.shelf}:{}) ,...(p.space?{space:p.space}:{})};
}
export function importDesignMarkdown(markdown: string, name: string, base: DesignSystem): DesignSystem {
  if (markdown.length > 200000) throw new Error('DESIGN.md는 200KB 이하여야 합니다.');
  // Deliberately conservative: import only labeled exact colors, never an arbitrary first hex value.
  const token = (names: string) => markdown.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:${names})\\s*:\\s*["'\x60]?(#[a-fA-F0-9]{6})\\b`, 'i'))?.[1];
  const accent = token('primary|accent');
  const background = token('canvas|background');
  const foreground = token('foreground');
  if (!accent && !background && !foreground) throw new Error('primary: #RRGGBB 같은 명시적인 색상 토큰을 찾지 못했습니다. 원본 형식을 확인해주세요.');
  return { ...base, id: 'imported', name: name.replace(/\.md$/i, ''), description: 'Imported color tokens · original Markdown preserved', accent: accent ?? base.accent, background: background ?? base.background, foreground: foreground ?? base.foreground, source: `User-imported ${name}. Only explicit primary/accent, canvas/background, foreground fields are parsed. Other values retain prior project decisions.`, originalMarkdown: markdown };
}
