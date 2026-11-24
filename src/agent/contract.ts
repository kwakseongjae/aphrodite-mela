/**
 * The design contract, as an agent reads it.
 *
 * This is the answer to "what is on this canvas" in the vocabulary of the design — pages, frames,
 * components, tokens — rather than the vocabulary of the screen. Nothing here touches the DOM, so it
 * is the same answer over the loopback bridge, in the browser build, and in a test.
 *
 * Two things it deliberately does not do: it never returns image bytes (an uploaded picture is a data
 * URL that would swamp the reply, so it is described instead), and it never grows without a bound —
 * a big project comes back trimmed with a note saying how to ask for less.
 */
import {catalog, isApproved, type Block, type Page, type Project} from '../model';
import {implementations, catalogGroup} from '../design/component-explorer';
import {patternVariants} from '../patterns';
import {frameWidth} from '../editor/space';
import {fontStack} from '../design/fonts';
import {htmlWindow, isFreePage, pageText, HTML_WINDOW} from '../free-page';
import {clip} from '../text';

export type ContractFormat = 'concise' | 'detailed';
export type ContractOptions = {format?: ContractFormat; pageId?: string; maxPages?: number; maxBlocks?: number};

export const MAX_PAGES = 8;
export const MAX_BLOCKS = 60;
const BRIEF_CHARS = 400;

/** What the channel says when the window is the project list, not a canvas. */
export const HOME_CANVAS_HINT = 'The window is on Home, the list of projects. Nothing here is on screen. Open a project before reading a page or asking for a picture of one.';

/** A last project may still be in memory. It is named, and it is not the canvas. */
export function closedCanvas(project: Project) {
  return {
    ok: true as const,
    screen: 'home' as const,
    visible: false as const,
    hint: HOME_CANVAS_HINT,
    last_project: {project_id: project.id, name: project.name},
  };
}

/** A photograph of a page that is not on screen is the wrong picture. */
export function closedRender() {
  return {
    error: 'the window is on Home, so there is no page on screen to photograph. Open a project first.',
    screen: 'home' as const,
    visible: false as const,
  };
}

/** How an image is named without carrying it. `local:` and bundled paths are already short. */
export function describeImage(value: string): string {
  if (!value) return '';
  if (!value.startsWith('data:')) return value;
  const mime = value.slice(5, value.indexOf(';'));
  const bytes = Math.round((value.length - value.indexOf(',') - 1) * 0.75);
  return `inline:${mime || 'image'}:${bytes}`;
}

function blockJson(block: Block, format: ContractFormat): Record<string, unknown> {
  const out: Record<string, unknown> = {block_id: block.id, kind: block.kind};
  if (block.variant) out.variant = block.variant;
  if (block.provider) out.provider = block.provider;
  if (block.parentId) out.parent_block_id = block.parentId;
  if (block.title) out.title = block.title;
  if (block.label) out.label = block.label;
  if (block.image) out.image = describeImage(block.image);
  if (format === 'detailed') {
    if (block.eyebrow) out.eyebrow = block.eyebrow;
    if (block.text) out.text = block.text;
    if (block.description) out.description = block.description;
    if (block.options) out.options = block.options;
    if (block.theme) out.theme = block.theme;
    if (block.layout) out.layout = block.layout;
    if (block.itemImages?.length) out.item_images = block.itemImages.map(describeImage);
  } else if (block.text) {
    out.text_length = block.text.length;
  }
  return out;
}

function pageJson(page: Page, project: Project, format: ContractFormat, maxBlocks: number) {
  // Every page is a frame in the Space. A project that has not been opened in the editor yet has no
  // stored layout, so report the default rather than leaving an agent to guess the page is sizeless.
  const frame = project.space?.frames[page.id] ?? {x: 0, y: 0, preset: 'desktop' as const};
  const blocks = page.blocks.slice(0, maxBlocks);
  const out: Record<string, unknown> = {
    page_id: page.id,
    name: page.name,
    active: page.id === project.activePageId,
    block_count: page.blocks.length,
    blocks: blocks.map(b => blockJson(b, format)),
  };
  out.frame = {preset: frame.preset, width: frameWidth(frame), x: frame.x, y: frame.y, ...(frame.height !== undefined ? {height: frame.height} : {})};
  // An html page is named as one, with its size: its document is read with aphrodite_get_page_html.
  if (page.kind) out.kind = page.kind;
  if (isFreePage(page)) out.html_length = page.html.length;
  if (page.media) out.media = page.media;
  if (page.proposal) out.proposal = {label: page.proposal.label, kind: page.proposal.kind, from_page_id: page.proposal.fromPageId};
  if (blocks.length < page.blocks.length) out.blocks_truncated = true;
  return out;
}

/** The whole contract. `selectedId` is what the person has selected — an agent's shared pointer. */
export function designContract(project: Project, selectedId: string, options: ContractOptions = {}) {
  const format: ContractFormat = options.format === 'detailed' ? 'detailed' : 'concise';
  const maxPages = Math.max(1, options.maxPages ?? MAX_PAGES);
  const maxBlocks = Math.max(1, options.maxBlocks ?? MAX_BLOCKS);
  const asked = options.pageId ? project.pages.filter(p => p.id === options.pageId) : project.pages;
  if (options.pageId && !asked.length) {
    return {error: `no page "${options.pageId}". Pages on this project: ${project.pages.map(p => p.id).join(', ')}`};
  }
  const pages = asked.slice(0, maxPages);
  const selected = project.pages.flatMap(p => p.blocks).find(b => b.id === selectedId);
  const brief = format === 'detailed' ? project.brief : clip(project.brief, BRIEF_CHARS);
  const out: Record<string, unknown> = {
    schema: 'aphrodite.contract/1',
    project: {
      project_id: project.id,
      name: project.name,
      brief,
      approved: isApproved(project),
      content_language: project.contentLanguage ?? 'en',
      page_count: project.pages.length,
    },
    system: {
      id: project.system.id,
      name: project.system.name,
      accent: project.system.accent,
      background: project.system.background,
      foreground: project.system.foreground,
      radius: project.system.radius,
      font: project.system.font,
      heading_family: project.system.headingFamily ?? null,
      body_family: project.system.bodyFamily ?? null,
    },
    selection: selected ? {block_id: selected.id, kind: selected.kind, page_id: project.pages.find(p => p.blocks.includes(selected))?.id ?? null} : null,
    pages: pages.map(p => pageJson(p, project, format, maxBlocks)),
  };
  const trimmedPages = pages.length < asked.length;
  const trimmedBlocks = pages.some(p => p.blocks.length > maxBlocks);
  if (trimmedPages || trimmedBlocks) {
    out.truncated = true;
    out.hint = trimmedPages
      ? `${asked.length} pages, ${pages.length} shown. Ask for one with page_id (see project.page_count).`
      : `Some pages have more than ${maxBlocks} components. Ask for one page with page_id to see all of them.`;
  }
  if (project.reference) out.reference = describeImage(project.reference);
  return out;
}

/**
 * The tokens, with the variable names the rendered page actually uses. An agent writing code for this
 * design should reach for `var(--brand)`, not for the hex it happens to hold today. The css comes in
 * from the renderer (`themeVars`) so what is reported is exactly what the page is painted with, while
 * this module stays free of anything a plain test runner cannot load.
 */
export function designTokens(project: Project, css: string) {
  const tokens: Record<string, string> = {};
  for (const pair of css.split(';')) {
    const at = pair.indexOf(':');
    if (at > 0) tokens[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return {
    schema: 'aphrodite.tokens/1',
    system: {
      id: project.system.id,
      name: project.system.name,
      description: project.system.description,
      source: project.system.source,
    },
    tokens,
    css,
    fonts: {
      heading: fontStack({family: project.system.headingFamily, category: project.system.font}),
      body: fontStack({family: project.system.bodyFamily, category: 'sans'}),
    },
    usage: 'Use the variable names in generated code (var(--brand)), not the literal values: the person can change a token and every page follows.',
  };
}

/** The html page an agent asked to read, or the sentence that says why it cannot be read that way. */
function freePage(project: Project, pageId: string): {page: Page & {html: string}} | {error: string} {
  const page = project.pages.find(p => p.id === pageId);
  if (!page) return {error: `no page "${pageId}". Pages on this project: ${project.pages.map(p => p.id).join(', ')}`};
  if (!isFreePage(page)) return {error: `page ${pageId} is a section page, which has no html of its own. Read it with aphrodite_get_contract.`};
  return {page};
}

/** An html page's html, exactly as stored, a window at a time (src/free-page.ts htmlWindow). */
export function pageHtmlRead(project: Project, ask: {pageId: string; start?: number; end?: number}) {
  const found = freePage(project, ask.pageId);
  if ('error' in found) return found;
  return {ok: true as const, page_id: found.page.id, name: found.page.name, ...htmlWindow(found.page.html, {start: ask.start, end: ask.end})};
}

/** An html page's words, without its markup. A page whose words run past one window says so. */
export function pageTextRead(project: Project, ask: {pageId: string}) {
  const found = freePage(project, ask.pageId);
  if ('error' in found) return found;
  const text = pageText(found.page.html);
  return {ok: true as const, page_id: found.page.id, name: found.page.name, text: clip(text, HTML_WINDOW), ...(text.length > HTML_WINDOW ? {more: true, length: text.length} : {})};
}

/**
 * Why a page cannot be photographed, or undefined when it can. A free page is drawn held in its frame
 * (renderShell in src/free-page.ts); a media item is a picture or a video already, not a page.
 */
export function renderRefusal(page: Page): string | undefined {
  return page.kind === 'media' ? `page ${page.id} is a media item; there is no page to draw.` : undefined;
}

/** How many characters of ops one reply listing changes carries at most. */
export const REPLY_OPS = 200_000;
const OPS_OMITTED_NOTE = 'Some changes are listed without their ops (ops_omitted), to keep this reply small; their who, why, anchors and size are here. To see what they did, read the page as it is now with aphrodite_get_page_html.';

/**
 * The changes a reply lists (aphrodite_get_changes, a stale batch's 409), with their ops kept to
 * REPLY_OPS characters in all: past that the biggest lose their ops first, in place, and say so with
 * `ops_omitted`. Only the reply is trimmed; the ledger keeps what it keeps.
 */
export function changesForReply<T extends {ops: unknown[]}>(changes: T[], limit = REPLY_OPS): {changes: (T | (Omit<T, 'ops'> & {ops_omitted: true}))[]; note?: string} {
  const sizes = changes.map(c => JSON.stringify(c.ops).length);
  let total = sizes.reduce((sum, n) => sum + n, 0);
  if (total <= limit) return {changes};
  const dropped = new Set<number>();
  for (const i of sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a])) {
    if (total <= limit) break;
    dropped.add(i);
    total -= sizes[i];
  }
  return {changes: changes.map((c, i) => {
    if (!dropped.has(i)) return c;
    const {ops: _ops, ...rest} = c;
    return {...rest, ops_omitted: true as const};
  }), note: OPS_OMITTED_NOTE};
}

/** The vocabulary an agent composes with: every component kind, its variants and its providers. */
export function componentVocabulary() {
  return {
    schema: 'aphrodite.components/1',
    components: catalog.map(entry => ({
      component_kind: entry.kind,
      name: entry.name,
      description: entry.description,
      group: catalogGroup(entry.kind),
      variants: [...patternVariants(entry.kind)],
      providers: implementations(entry.kind).map(i => i.provider),
    })),
  };
}

/** Every component kind that may be added, for validation and for error messages that teach. */
export function componentKinds(): string[] {
  return catalog.map(c => String(c.kind));
}
