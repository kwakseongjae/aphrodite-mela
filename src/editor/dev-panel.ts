import type {Block, Project} from '../model';
import {currentPage} from '../model';
import {componentIdentity, componentRegistry, sceneManifest} from '../components';
import {blockHtml, pageHtml} from '../render';
import {buildPrompt, designMarkdown} from '../export';
import {isPattern, patternSpecs} from '../patterns';
import {esc} from '../html';
import {onColor} from '../design/contrast';

export type DevPanelLanguage = 'en' | 'ko';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const PAGE_HTML_DISPLAY_CAP = 6000;
const COPY_KEY = /^[a-z]+(?:-[a-z]+)*$/;

type SceneWalkNode = {
  instanceId: string;
  componentId: string;
  variant?: string;
  provider?: string;
  parentId?: string;
  layout?: Record<string, unknown>;
  children?: SceneWalkNode[];
  slots?: Record<string, unknown>;
};

function ui(language: DevPanelLanguage, en: string, ko: string) {
  return language === 'ko' ? ko : en;
}

function code(value: string | number) {
  return `<code>${esc(String(value))}</code>`;
}

function prettyMarkup(html: string): string {
  const tokens = html.split(/(<[^>]+>)/);
  let depth = 0;
  const lines: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('<')) {
      const closing = token.startsWith('</');
      const name = token.match(/^<\/?([a-zA-Z][\w:-]*)/)?.[1]?.toLowerCase() ?? '';
      const self = token.endsWith('/>') || VOID.has(name) || token.startsWith('<!');
      if (closing) depth = Math.max(0, depth - 1);
      lines.push(`${'  '.repeat(depth)}${token}`);
      if (!closing && !self) depth += 1;
    } else {
      const text = token.trim();
      if (text) lines.push(`${'  '.repeat(depth)}${text}`);
    }
  }
  const out = lines.join('\n');
  return out.length > 4000 ? `${out.slice(0, 4000)}…` : out;
}

function tokensCss(project: Project): string {
  const s = project.system;
  const font = s.font === 'serif' ? "Georgia, 'Times New Roman', serif" : 'Arial, Helvetica, sans-serif';
  return [
    `--brand: ${s.accent};`,
    `--on-brand: ${onColor(s.accent)};`,
    `--paper: ${s.background};`,
    `--ink: ${s.foreground};`,
    `--radius: ${s.radius}px;`,
    `--font: ${font};`,
  ].join('\n');
}

function presentSlots(block: Block): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of componentRegistry[block.kind].slots) {
    const value = block[name as keyof Block];
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    out[name] = value;
  }
  return out;
}

function identityPayload(block: Block) {
  const identity = componentIdentity(block);
  const options = block.options ?? {};
  return {
    componentId: identity.componentId,
    componentVersion: identity.componentVersion,
    provider: identity.provider,
    variant: identity.variant,
    instanceId: block.id,
    options: {
      ...(options.density ? {density: options.density} : {}),
      ...(options.columns !== undefined ? {columns: options.columns} : {}),
      ...(options.state ? {state: options.state} : {}),
    },
    theme: identity.theme ?? {mode: 'project' as const},
    slots: presentSlots(block),
  };
}

function optionsSummary(block: Block): string {
  const o = block.options;
  if (!o) return '—';
  const parts = [o.density, o.columns !== undefined ? String(o.columns) : undefined, o.state].filter((v): v is string => Boolean(v));
  return parts.length ? parts.join(' · ') : '—';
}

function themeSummary(block: Block, language: DevPanelLanguage): string {
  const theme = block.theme;
  if (!theme || theme.mode === 'project') return ui(language, 'Project', '프로젝트');
  if (theme.mode === 'source') return ui(language, 'Source', '소스');
  return `${ui(language, 'Custom', '직접 지정')} · ${theme.accent ?? ''}`;
}

function contractHelp(kind: Block['kind'], language: DevPanelLanguage): string {
  if (isPattern(kind)) return patternSpecs[kind].help;
  if (kind === 'features') return ui(language, 'One reason per line as `title|body`. Label is the section eyebrow.', '한 줄에 이유 하나, `제목|본문` 형식입니다. 라벨은 섹션 아이브로우입니다.');
  if (kind === 'products') return ui(language, 'One item per line as `title|price`. Optional description and per-row images.', '한 줄에 상품 하나, `제목|가격` 형식입니다. 소개와 행별 이미지는 선택입니다.');
  if (kind === 'navigation') return ui(language, 'Brand in the heading. Links in the body, separated by ·.', '제목은 브랜드명, 본문은 · 로 구분한 링크입니다.');
  if (kind === 'hero') return ui(language, 'Heading, body and action slots. Optional eyebrow. Image or calendar media.', '제목·본문·액션 슬롯입니다. 아이브로우는 선택이며, 미디어는 이미지 또는 캘린더입니다.');
  return ui(language, 'Section kinds use heading, body and action slots. Row-based sections put one `a|b|c` record per line.', '섹션 종류는 제목·본문·액션 슬롯을 씁니다. 행 기반 섹션은 한 줄에 `a|b|c` 형식입니다.');
}

function rowsTable(text: string): string {
  const rows = text.length ? text.split('\n').map(line => line.split('|')) : [];
  if (!rows.length) return '<p class="dev-panel-note">—</p>';
  const width = Math.max(...rows.map(row => row.length));
  const head = `<tr><th>#</th>${Array.from({length: width}, (_, i) => `<th>${i + 1}</th>`).join('')}</tr>`;
  const body = rows.map((row, i) => `<tr><td>${code(i + 1)}</td>${Array.from({length: width}, (_, c) => `<td>${esc(row[c] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<table class="dev-panel-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function copyButton(key: string, label: string) {
  return `<button type="button" class="dev-panel-copy" data-action="dev-copy" data-copy-target="${esc(key)}">${esc(label)}</button>`;
}

function copyArea(key: string, value: string) {
  return `<textarea hidden readonly data-copy="${esc(key)}" aria-hidden="true">${esc(value)}</textarea>`;
}

function tokensJson(project: Project): string {
  const s = project.system;
  return JSON.stringify({
    color: {
      primary: {$type: 'color', $value: s.accent},
      background: {$type: 'color', $value: s.background},
      foreground: {$type: 'color', $value: s.foreground},
    },
    radius: {$type: 'dimension', $value: `${s.radius}px`},
  }, null, 2);
}

function exportPageHtml(project: Project): string {
  return pageHtml(project, currentPage(project)).replaceAll('src="/assets/', 'src="assets/');
}

function currentScenePage(project: Project) {
  const scene = sceneManifest(project);
  const id = currentPage(project).id;
  return scene.pages.find(entry => entry.id === id) ?? scene.pages[0];
}

function presentSlotNames(slots: Record<string, unknown> | undefined): string {
  if (!slots) return '—';
  const names = Object.entries(slots).filter(([, value]) => {
    if (value === undefined || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }).map(([name]) => name);
  return names.length ? names.join(', ') : '—';
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function walkSceneNodes(nodes: SceneWalkNode[], depth = 0, inheritedParent?: string): {node: SceneWalkNode; depth: number; parent: string}[] {
  const rows: {node: SceneWalkNode; depth: number; parent: string}[] = [];
  for (const node of nodes) {
    const parent = inheritedParent ?? node.parentId ?? '';
    rows.push({node, depth, parent});
    if (node.children?.length) rows.push(...walkSceneNodes(node.children, depth + 1, node.instanceId));
  }
  return rows;
}

function section(kicker: string, button: string, body: string) {
  return `<section class="dev-panel-section"><div class="dev-panel-heading"><span class="dev-panel-kicker">${esc(kicker)}</span>${button}</div>${body}</section>`;
}

function identityHtml(block: Block, language: DevPanelLanguage): string {
  const payload = identityPayload(block);
  const slots = Object.keys(payload.slots);
  const rows: [string, string][] = [
    [ui(language, 'Component', '컴포넌트'), code(payload.componentId)],
    [ui(language, 'Version', '버전'), code(payload.componentVersion)],
    [ui(language, 'Provider', '제공자'), code(payload.provider)],
    [ui(language, 'Variant', '변형'), code(payload.variant)],
    [ui(language, 'Options', '옵션'), esc(optionsSummary(block))],
    [ui(language, 'Theme', '테마 정책'), esc(themeSummary(block, language))],
    [ui(language, 'Instance', '인스턴스'), code(payload.instanceId)],
    [ui(language, 'Slots', '슬롯'), slots.length ? esc(slots.join(', ')) : esc('—')],
  ];
  const dl = `<dl class="dev-panel-dl">${rows.map(([dt, dd]) => `<dt>${esc(dt)}</dt><dd>${dd}</dd>`).join('')}</dl>`;
  return section(ui(language, 'Identity', '식별'), copyButton('identity', ui(language, 'Copy JSON', 'JSON 복사')), `${dl}${copyArea('identity', JSON.stringify(payload, null, 2))}`);
}

function tokensHtml(project: Project, language: DevPanelLanguage): string {
  const css = tokensCss(project);
  return section(ui(language, 'Tokens', '토큰'), copyButton('tokens', ui(language, 'Copy CSS', 'CSS 복사')), `<pre><code>${esc(css)}</code></pre>${copyArea('tokens', css)}`);
}

function markupHtml(project: Project, block: Block, language: DevPanelLanguage, html?: string): string {
  const raw = html !== undefined ? html : blockHtml(block, project);
  const pretty = prettyMarkup(raw);
  return section(ui(language, 'Markup', '마크업'), copyButton('markup', ui(language, 'Copy HTML', 'HTML 복사')), `<pre><code>${esc(pretty)}</code></pre>${copyArea('markup', pretty)}`);
}

function contractHtml(block: Block, language: DevPanelLanguage): string {
  return section(ui(language, 'Content contract', '콘텐츠 계약'), '', `<p class="dev-panel-note">${esc(contractHelp(block.kind, language))}</p>${rowsTable(block.text)}`);
}

function pageHtmlSummary(project: Project, language: DevPanelLanguage): string {
  const page = currentPage(project);
  const kinds = [...new Set(page.blocks.map(b => b.kind))];
  const rows: [string, string][] = [
    [ui(language, 'Page', '페이지'), esc(page.name)],
    [ui(language, 'Blocks', '컴포넌트'), code(page.blocks.length)],
    [ui(language, 'Kinds', '종류'), kinds.length ? esc(kinds.join(', ')) : esc('—')],
  ];
  return section(ui(language, 'Page', '페이지'), '', `<dl class="dev-panel-dl">${rows.map(([dt, dd]) => `<dt>${esc(dt)}</dt><dd>${dd}</dd>`).join('')}</dl>`);
}

function handoffHtml(project: Project, language: DevPanelLanguage): string {
  const note = ui(language, 'Export produces PROMPT.md, DESIGN.md, SCENE.json and HTML for this composition.', '내보내기는 이 구성의 PROMPT.md, DESIGN.md, SCENE.json, HTML을 만듭니다.');
  const markdown = designMarkdown(project);
  return section(ui(language, 'Handoff', '핸드오프'), copyButton('design', ui(language, 'Copy DESIGN.md', 'DESIGN.md 복사')), `<p class="dev-panel-handoff">${esc(note)}</p>${copyArea('design', markdown)}`);
}

function pageMarkupHtml(project: Project, language: DevPanelLanguage): string {
  const raw = exportPageHtml(project);
  const truncated = raw.length > PAGE_HTML_DISPLAY_CAP;
  const display = truncated ? `${raw.slice(0, PAGE_HTML_DISPLAY_CAP)}…` : raw;
  const note = truncated
    ? ui(language, 'Showing the first 6,000 characters. Copy page HTML for the full document.', '처음 6,000자를 표시합니다. 전체 문서는 페이지 HTML을 복사하세요.')
    : '';
  return section(
    ui(language, 'Page HTML', '페이지 HTML'),
    copyButton('page-html', ui(language, 'Copy page HTML', '페이지 HTML 복사')),
    `${note ? `<p class="dev-panel-note">${esc(note)}</p>` : ''}<pre><code>${esc(display)}</code></pre>${copyArea('page-html', raw)}`,
  );
}

function sceneNodesHtml(project: Project, language: DevPanelLanguage): string {
  const scene = sceneManifest(project);
  const rows = walkSceneNodes(currentScenePage(project).nodes as SceneWalkNode[]);
  const head = `<tr><th>${esc(ui(language, 'Instance', '인스턴스'))}</th><th>${esc(ui(language, 'Component', '컴포넌트'))}</th><th>${esc(ui(language, 'Variant', '변형'))}</th><th>${esc(ui(language, 'Provider', '제공자'))}</th><th>${esc(ui(language, 'Parent', '부모'))}</th><th>${esc(ui(language, 'Slots', '슬롯'))}</th></tr>`;
  const body = rows.map(({node, depth, parent}) => `<tr><td class="dev-panel-id" style="--d:${depth}">${code(shortId(node.instanceId))}</td><td>${esc(node.componentId)}</td><td>${esc(node.variant ?? '—')}</td><td>${esc(node.provider ?? 'own')}</td><td>${parent ? code(shortId(parent)) : esc('—')}</td><td>${esc(presentSlotNames(node.slots))}</td></tr>`).join('');
  return section(
    ui(language, 'SCENE nodes', 'SCENE 노드'),
    copyButton('scene', ui(language, 'Copy SCENE.json', 'SCENE.json 복사')),
    `<table class="dev-panel-table dev-panel-tree"><thead>${head}</thead><tbody>${body}</tbody></table>${copyArea('scene', JSON.stringify(scene, null, 2))}`,
  );
}

function promptHtml(project: Project, language: DevPanelLanguage): string {
  const prompt = buildPrompt(project);
  return section(
    ui(language, 'Prompt for a coding agent', '코딩 에이전트용 프롬프트'),
    copyButton('prompt', ui(language, 'Copy prompt', '프롬프트 복사')),
    `<pre><code>${esc(prompt)}</code></pre>${copyArea('prompt', prompt)}`,
  );
}

function tokensJsonHtml(project: Project, language: DevPanelLanguage): string {
  const json = tokensJson(project);
  return section(
    ui(language, 'tokens.json', 'tokens.json'),
    copyButton('tokens-json', ui(language, 'Copy tokens.json', 'tokens.json 복사')),
    `<pre><code>${esc(json)}</code></pre>${copyArea('tokens-json', json)}`,
  );
}

function nodeHtml(project: Project, block: Block, language: DevPanelLanguage): string {
  const page = currentScenePage(project);
  const node = page.nodes.find(entry => entry.instanceId === block.id);
  const nested = node?.children?.length ?? 0;
  const framed = page.nodes.filter(entry => entry.parentId === block.id).length;
  const layout = node?.layout && Object.keys(node.layout).length ? JSON.stringify(node.layout) : '';
  const rows: [string, string][] = [
    [ui(language, 'Parent', '부모'), node?.parentId ? code(node.parentId) : esc('—')],
    [ui(language, 'Children', '자식'), code(nested + framed)],
    [ui(language, 'Layout', '레이아웃'), layout ? `<code class="dev-panel-json">${esc(layout)}</code>` : esc('—')],
  ];
  const payload = node ?? {instanceId: block.id, parentId: block.parentId ?? null, children: [], layout: block.layout ?? {}};
  return section(
    ui(language, 'Node', '노드'),
    copyButton('node', ui(language, 'Copy node JSON', '노드 JSON 복사')),
    `<dl class="dev-panel-dl">${rows.map(([dt, dd]) => `<dt>${esc(dt)}</dt><dd>${dd}</dd>`).join('')}</dl>${copyArea('node', JSON.stringify(payload, null, 2))}`,
  );
}

export function devPanelHtml(project: Project, block: Block | undefined, language: DevPanelLanguage, options?: {html?: string}): string {
  const parts = block
    ? [identityHtml(block, language), tokensHtml(project, language), markupHtml(project, block, language, options?.html), contractHtml(block, language), nodeHtml(project, block, language), handoffHtml(project, language)]
    : [tokensHtml(project, language), pageHtmlSummary(project, language), pageMarkupHtml(project, language), sceneNodesHtml(project, language), promptHtml(project, language), tokensJsonHtml(project, language), handoffHtml(project, language)];
  return `<div class="dev-panel">${parts.join('')}</div>`;
}

export function devPanelCopyPayload(root: ParentNode, key: string): string | null {
  if (!COPY_KEY.test(key)) return null;
  const node = root.querySelector(`textarea[data-copy="${key}"]`) as {value?: string} | null;
  return typeof node?.value === 'string' ? node.value : null;
}
