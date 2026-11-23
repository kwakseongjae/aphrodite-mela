import { patternSpecs, isPattern, patternVariants, validOptions, type PatternKind, type PatternOptions } from './patterns';
import {sanitizeSpace,type Space} from './editor/space';
import {isSampleSrc} from './design/sample-images';
import {isLocalRef} from './design/local-images';
import {sanitizeFamily} from './design/fonts';
import {semanticTokens,tokenSynonyms,isColour,sanitizeTypeScale,type SemanticToken,type TypeScale} from './design/tokens';
import { supportsProvider, type Provider } from './providers';
import {validComponentTheme,type ComponentTheme} from './design/component-theme';
import {validShelf,type ShelfChoice} from './design/shelf';
import { validLayout, validateTree, type Layout } from './layout';
import {ownSystems} from './design/presets';
import {readLedger,type Ledger} from './ledger/types';
import {pageShapeProblem,type PageKind,type PageMedia} from './free-page';
export type BlockKind = 'frame' | 'navigation' | 'hero' | 'features' | 'products' | 'testimonial' | 'cta' | 'footer' | PatternKind;
export type HeroVariant = 'split' | 'image-left' | 'stacked';
export type Block = { id: string; kind: BlockKind; title: string; text: string; label: string; image: string; filled: boolean; variant?: string; eyebrow?: string; description?:string; itemImages?:string[]; options?: PatternOptions; provider?: Provider; theme?:ComponentTheme; parentId?: string; layout?: Layout };
/**
 * The design contract. `accent`/`background`/`foreground`/`radius` are the original four; the
 * semantic tokens and the type scale are optional, and when absent the renderer paints what it
 * always has. `carried` holds token names an imported system defines that nothing here renders yet —
 * kept verbatim so a round trip does not lose someone's design system.
 */
export type DesignSystem = { id: string; name: string; description: string; accent: string; background: string; foreground: string; radius: number; font: 'serif' | 'sans'; headingFamily?: string; bodyFamily?: string; source: string; originalMarkdown?: string } & Partial<Record<SemanticToken, string>> & { type?: TypeScale; carried?: Record<string, string> };
export type ReferenceEvidence = { engine: 'Apple Vision + pixels' | 'Pixels only'; sourceFingerprint: string; textLines: number; palette: string[]; elapsedMs: number; direction: HeroVariant; mediaUsed: boolean };
export type VibeReceipt = {packId:string;changedFields:number;source:'local-authored-demo';imageSource:'user-upload'|'bundled-generated'|'none';modelCalled:false};
export type PageProposal={fromPageId:string;label:string;kind:'reference-direction'|'vibe'|'agent'};
/** A section page has `blocks`. A free page (`kind: 'html'`) and a media item (`kind: 'media'`) keep `blocks: []` and hold their content in `html` or `media` (src/free-page.ts). */
export type Page = { id: string; name: string; blocks: Block[]; referenceEvidence?: ReferenceEvidence; vibeReceipt?:VibeReceipt; proposal?:PageProposal; kind?: PageKind; html?: string; media?: PageMedia };
/**
 * `ledger` is the record of every change (src/ledger). It is not design: fingerprints and diffs leave it out. Nor is
 * `leftOut` (0.3-R ④): the files, by hash or `local:` id, a received board named and did not carry, which no export sends.
 */
export type Project = { version: 1; id: string; name: string; brief: string; system: DesignSystem; pages: Page[]; activePageId: string; reference?: string; approvedFingerprint?: string; contentLanguage?:'en'|'ko'; shelf?:ShelfChoice[]; space?:Space; ledger?:Ledger; leftOut?:string[] };
export const uid = () => crypto.randomUUID();
/** How many pages (and media items) a project holds, and how long a page's name may be. */
export const MAX_PAGES = 30;
export const MAX_PAGE_NAME = 100;
/** How many files a board may be marked as having come without (0.3-R ④). */
export const MAX_LEFT_OUT = 10_000;
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
function hashOf(value: string): string {
  // Local change detector, not a security signature. Two independent 32-bit accumulators
  // avoid duplicating multi-megabyte uploaded images in storage and history snapshots.
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
  return `${value.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
const designFields = (p: Project) => ({ name: p.name, brief: p.brief, system: p.system, pages: p.pages, reference: p.reference, contentLanguage:p.contentLanguage });
/** The design's revision as it has always been read: the JSON as the keys happen to fall. Approvals made before 0.3-R hold this. */
export function fingerprint(p: Project): string { return hashOf(JSON.stringify(designFields(p))); }
/** JSON with every object's keys in order: the same design reads the same, whichever order its keys were made in. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]])) : v);
}
/**
 * What an approval holds (0.3-R): the design, read so that key order does not count. A store that sorts keys, or an undo
 * that puts a field back after the others, gives back the design the person approved, and the approval holds for it.
 */
export function approvalPrint(p: Project): string { return `c1:${hashOf(canonicalJson(designFields(p)))}`; }
/**
 * The revision an agent reads and sends back as base_revision (0.3-R): the board, its design, and every frame's place
 * and size in page order, which is all a batch can change (a patch can replace the whole space). A copy of a board, or
 * a frame resized or moved since it was read, is another revision. Key order does not count. Not what an approval
 * holds: that is `approvalPrint`, of the design alone, and stays as it is.
 */
export function agentRevision(p: Project): string { return `r2:${hashOf(canonicalJson({ board: p.id, design: designFields(p), frames: p.pages.map(page => p.space?.frames[page.id] ?? null) }))}`; }
/** An approval written before 0.3-R (`fingerprint`) still holds; a read gives it back as an `approvalPrint`. */
export function isApproved(p: Project) { const held = p.approvedFingerprint; return held !== undefined && (held === approvalPrint(p) || held === fingerprint(p)); }
/**
 * The invariant (0.3-R): a fingerprint that is kept matches the board it is on. One the content no longer matches is dropped
 * where the board changes, is read or is saved, so content that comes back, by whoever, comes back a draft. True when it dropped one.
 */
export function dropStaleApproval(p: Project): boolean { if (p.approvedFingerprint === undefined || isApproved(p)) return false; delete p.approvedFingerprint; return true; }
export function assemble(brief: string): BlockKind[] {
  if (/shop|store|furniture|commerce|가구|쇼핑|스토어|상품/.test(brief.toLowerCase())) return ['navigation', 'hero', 'products', 'features', 'footer'];
  if (/portfolio|studio|포트폴리오|스튜디오/.test(brief.toLowerCase())) return ['navigation', 'hero', 'products', 'testimonial', 'footer'];
  return ['navigation', 'hero', 'features', 'testimonial', 'cta', 'footer'];
}
export function safeImage(value: string) {
  return /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value) || /^\/assets\/(interior|chair|living)\.jpg$/.test(value) || value==='/assets/lighting-hero.png' || isSampleSrc(value) || isLocalRef(value) ? value : '';
}
/* Layouts that changed name. Kept small and explicit: each line is one rename we shipped, and
   dropping a line would make every project saved before it unopenable. */
const renamedVariants: Record<string, Record<string, string>> = {
  cta: { halves: 'panel' },   // 2026-09-16 · collided with the `split` cta that was already there
  moacard: { cover: 'banner' }, // 2026-09-16 · a task card has no picture; what it does is run the tag to the edge
};
/** What a saved project holds at most, design and history together, in characters of JSON. */
export const MAX_PROJECT = 20_000_000;
export function parseProject(raw: string): Project {
  if (raw.length > MAX_PROJECT) throw new Error('프로젝트는 20MB 이하여야 합니다.');
  const p = JSON.parse(raw) as Project;
  // Judged on the content as it came, before anything below tidies it: what was approved stays approved, in the form key order cannot break.
  const approved = typeof p?.approvedFingerprint === 'string' && isApproved(p);
  const str = (v: unknown, max = 20000) => typeof v === 'string' && v.length <= max;
  const validId = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(v);
  if (!p || p.version !== 1 || !str(p.id, 200) || !str(p.name, 200) || !str(p.brief) || !p.system || !Array.isArray(p.pages) || !p.pages.length || p.pages.length > MAX_PAGES) throw new Error('지원하지 않는 프로젝트 형식입니다.');
  const s = p.system;
  if(p.shelf!==undefined&&!validShelf(p.shelf))throw new Error('Invalid project assembly shelf');
  if(p.contentLanguage!==undefined&&!['en','ko'].includes(p.contentLanguage))throw new Error('Unsupported content language');
  if(p.leftOut!==undefined&&(!Array.isArray(p.leftOut)||p.leftOut.length>MAX_LEFT_OUT||!p.leftOut.every(f=>typeof f==='string'&&/^(?:[0-9a-f]{64}|local:[0-9a-f]{16})$/.test(f))))throw new Error('Invalid list of files the board came without');
  if(p.space!==undefined){const space=sanitizeSpace(p.space);if(space)p.space=space;else delete p.space;}
  if (s.headingFamily !== undefined) { const clean = sanitizeFamily(s.headingFamily); if (clean) s.headingFamily = clean; else delete s.headingFamily; }
  if (s.bodyFamily !== undefined) { const clean = sanitizeFamily(s.bodyFamily); if (clean) s.bodyFamily = clean; else delete s.bodyFamily; }
  // A token we cannot paint is dropped rather than rejecting the whole project: a design system with
  // one bad value is still a design system, and the renderer falls back to what it paints today.
  for (const token of semanticTokens) { if (s[token] !== undefined && !isColour(s[token])) delete s[token]; }
  if (s.type !== undefined) { const scale = sanitizeTypeScale(s.type); if (scale) s.type = scale; else delete s.type; }
  if (s.carried !== undefined) {
    const kept: Record<string, string> = {};
    if (s.carried && typeof s.carried === 'object' && !Array.isArray(s.carried)) {
      for (const [name, value] of Object.entries(s.carried).slice(0, 200)) {
        if (/^[a-z][a-z0-9.-]{0,60}$/.test(name) && typeof value === 'string' && value.length <= 200) kept[name] = value;
      }
    }
    if (Object.keys(kept).length) s.carried = kept; else delete s.carried;
  }
  if (![s.accent, s.background, s.foreground].every(v => /^#[a-fA-F0-9]{6}$/.test(v)) || !Number.isFinite(s.radius) || s.radius < 0 || s.radius > 48 || !['serif', 'sans'].includes(s.font) || ![s.name, s.id, s.description, s.source].every(v => str(v)) || (s.originalMarkdown !== undefined && !str(s.originalMarkdown, 200000))) throw new Error('디자인 토큰 형식이 올바르지 않습니다.');
  const ids = new Set<string>();
  for (const page of p.pages) {
    if (!page || !validId(page.id) || ids.has(page.id) || !str(page.name, MAX_PAGE_NAME) || !Array.isArray(page.blocks) || page.blocks.length > 100) throw new Error('페이지 형식이 올바르지 않습니다.');
    ids.add(page.id);
    const shape = pageShapeProblem(page);
    if (shape) throw new Error(`페이지 형식이 올바르지 않습니다: ${shape}.`);
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
      // Renaming a layout is a migration, not a loosening: a name we retired is rewritten so the
      // saved project still opens, while anything else unknown is still refused below — a button
      // may not carry a calendar's variant, and a variant may not carry an onclick.
      if (typeof b.variant === 'string' && renamedVariants[b.kind]?.[b.variant]) b.variant = renamedVariants[b.kind][b.variant];
      if ((b.variant !== undefined && !patternVariants(b.kind).includes(b.variant)) || (b.eyebrow !== undefined && !str(b.eyebrow, 200)) || (b.options !== undefined && !validOptions(b.options, b.kind))) throw new Error('컴포넌트 변형이 올바르지 않습니다.');
    }
    if (!validateTree(page.blocks)) throw new Error('프레임 중첩이 올바르지 않습니다 (순환/누락/깊이 초과).');
  }
  // A saved ledger that does not hold together is dropped, never a reason to refuse the project.
  const ledger = p.ledger === undefined ? undefined : readLedger(p.ledger);
  if (!p.pages.some(page => page.id === p.activePageId) || (p.reference !== undefined && (!str(p.reference, 4_000_000) || !safeImage(p.reference)))) throw new Error('프로젝트 참조가 올바르지 않습니다.');
  const read: Project = { version: 1, id: p.id, name: p.name, brief: p.brief, system: { ...s }, pages: p.pages, activePageId: p.activePageId, reference: p.reference, approvedFingerprint: undefined as string | undefined, ...(p.contentLanguage?{contentLanguage:p.contentLanguage}:{}), ...(p.shelf?{shelf:p.shelf}:{}) ,...(p.space?{space:p.space}:{}),...(ledger?{ledger}:{}),...(p.leftOut?.length?{leftOut:[...new Set(p.leftOut)]}:{})};
  // A fingerprint written before 0.3-R was checked by the reader after it tidied the design (a type role's keys, say):
  // it is checked against the design as read too, so what an older reader showed as approved stays approved (fix 1 #8).
  const held = typeof p.approvedFingerprint === 'string' ? p.approvedFingerprint : undefined;
  if (approved || (held !== undefined && (held === fingerprint(read) || held === approvalPrint(read)))) read.approvedFingerprint = approvalPrint(read);
  return read;
}
/** A design system in the shape a read keeps (parseProject): a board's approval is over what is saved, not over names a read would drop. */
export function canonicalSystem(system: DesignSystem): DesignSystem {
  return parseProject(JSON.stringify({ version: 1, id: 'system', name: 'system', brief: '', system, pages: [{ id: 'page', name: 'page', blocks: [] }], activePageId: 'page' })).system;
}
export function importDesignMarkdown(markdown: string, name: string, base: DesignSystem): DesignSystem {
  if (markdown.length > 200000) throw new Error('DESIGN.md는 200KB 이하여야 합니다.');
  // Deliberately conservative: import only labeled exact colors, never an arbitrary first hex value.
  const token = (names: string) => markdown.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:${names})\\s*:\\s*["'\x60]?(#[a-fA-F0-9]{6})\\b`, 'i'))?.[1];
  const accent = token('primary|accent');
  const background = token('canvas|background');
  const foreground = token('foreground');
  if (!accent && !background && !foreground) throw new Error('primary: #RRGGBB 같은 명시적인 색상 토큰을 찾지 못했습니다. 원본 형식을 확인해주세요.');
  // The semantic half, and then everything else that was labelled a colour. What this prototype
  // cannot paint is carried rather than dropped: a round trip must not lose someone's design system.
  const semantic: Partial<Record<SemanticToken, string>> = {};
  for (const name of semanticTokens) { const value = tokenSynonyms[name].map(alias => token(alias.replace(/ /g, '[ _-]'))).find(Boolean); if (value) semantic[name] = value; }
  const known = new Set<string>([...semanticTokens.flatMap(name => tokenSynonyms[name].map(alias => alias.replace(/ /g, '-'))), 'primary', 'accent', 'canvas', 'background', 'foreground']);
  const carried: Record<string, string> = {};
  for (const [, label, value] of markdown.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?\**([a-z][a-z0-9 ._-]{0,60}?)\**\s*:\s*["'`]?(#[a-fA-F0-9]{6})\b/gi)) {
    // Real design documents label colours the way people say them — "Link Blue", "Weak Background".
    const key = label.trim().toLowerCase().replace(/[ _]+/g, '-');
    if (!known.has(key) && !(key in carried) && Object.keys(carried).length < 200) carried[key] = value;
  }
  return { ...base, ...semantic, ...(Object.keys(carried).length ? {carried} : {}), id: 'imported', name: name.replace(/\.md$/i, ''), description: 'Imported color tokens · original Markdown preserved', accent: accent ?? base.accent, background: background ?? base.background, foreground: foreground ?? base.foreground, source: `User-imported ${name}. Only explicit primary/accent, canvas/background, foreground fields are parsed. Other values retain prior project decisions.`, originalMarkdown: markdown };
}
