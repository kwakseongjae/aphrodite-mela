import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {initialProject} from '../src/model';

const result = await build({
  entryPoints: ['src/editor/dev-panel.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  plugins: [{
    name: 'raw-assets',
    setup(b) {
      b.onResolve({filter: /\?raw$/}, a => ({path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw'}));
      b.onLoad({filter: /.*/, namespace: 'raw'}, async a => ({contents: await readFile(a.path, 'utf8'), loader: 'text'}));
    },
  }],
});
const {devPanelHtml, devPanelCopyPayload} = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64')) as {
  devPanelHtml: (project: ReturnType<typeof initialProject>, block: ReturnType<typeof initialProject>['pages'][0]['blocks'][0] | undefined, language: 'en' | 'ko', options?: {html?: string}) => string;
  devPanelCopyPayload: (root: ParentNode, key: string) => string | null;
};

function heroOf(project: ReturnType<typeof initialProject>) {
  return project.pages[0].blocks.find(b => b.kind === 'hero')!;
}

function decode(value: string) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function rootFrom(html: string): ParentNode {
  return {
    querySelector(sel: string) {
      const key = /textarea\[data-copy="([a-z]+(?:-[a-z]+)*)"\]/.exec(sel)?.[1];
      if (!key) return null;
      const hit = html.match(new RegExp(`<textarea[^>]*data-copy="${key}"[^>]*>([\\s\\S]*?)</textarea>`));
      return hit ? {value: decode(hit[1])} : null;
    },
  } as unknown as ParentNode;
}

test('selected hero inspects identity, tokens, markup and copy payloads', () => {
  const project = initialProject();
  const hero = heroOf(project);
  const html = devPanelHtml(project, hero, 'en');
  assert.match(html, /aphrodite\.hero/);
  assert.match(html, /--brand:/);
  assert.match(html, /#344e41/);
  assert.match(html, /&lt;section/);
  for (const key of ['identity', 'tokens', 'markup', 'design', 'node']) {
    assert.match(html, new RegExp(`data-copy="${key}"`));
    assert.match(html, new RegExp(`data-action="dev-copy" data-copy-target="${key}"`));
  }
  assert.doesNotMatch(html, /<script/);
  const identity = JSON.parse(devPanelCopyPayload(rootFrom(html), 'identity')!);
  assert.equal(identity.componentId, 'aphrodite.hero');
  assert.match(devPanelCopyPayload(rootFrom(html), 'tokens')!, /--brand:\s*#344e41/);
  assert.match(devPanelCopyPayload(rootFrom(html), 'markup')!, /<section/);
  assert.match(devPanelCopyPayload(rootFrom(html), 'design')!, /# Form & Field Design System/);
  assert.equal(devPanelCopyPayload(rootFrom(html), 'missing'), null);
});

test('XSS in the title is escaped and never becomes a script tag', () => {
  const project = initialProject();
  const hero = heroOf(project);
  hero.title = '<script>alert(1)</script>';
  const html = devPanelHtml(project, hero, 'en');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(devPanelCopyPayload(rootFrom(html), 'identity')!, /<script>alert\(1\)<\/script>/);
});

test('no selection shows tokens, page summary and handoff', () => {
  const project = initialProject();
  const html = devPanelHtml(project, undefined, 'en');
  assert.match(html, /--brand:/);
  assert.match(html, /#344e41/);
  assert.match(html, />Home</);
  assert.match(html, />5</);
  assert.match(html, /navigation, hero, features, products, footer/);
  assert.match(html, /PROMPT\.md/);
  assert.match(html, /DESIGN\.md/);
  assert.match(html, /SCENE\.json/);
  assert.match(html, /data-copy="tokens"/);
  assert.match(html, /data-copy="design"/);
  assert.doesNotMatch(html, /data-copy="identity"/);
  assert.doesNotMatch(html, /data-copy="markup"/);
  assert.doesNotMatch(html, /data-copy="node"/);
});

test('Korean labels appear for ko', () => {
  const project = initialProject();
  const selected = devPanelHtml(project, heroOf(project), 'ko');
  assert.match(selected, /식별/);
  assert.match(selected, /토큰/);
  assert.match(selected, /마크업/);
  assert.match(selected, /콘텐츠 계약/);
  assert.match(selected, /핸드오프/);
  assert.match(selected, /JSON 복사/);
  assert.match(selected, /CSS 복사/);
  assert.match(selected, /HTML 복사/);
  assert.match(selected, /DESIGN\.md 복사/);
  assert.match(selected, /내보내기는 이 구성의/);
  assert.match(selected, /노드 JSON 복사/);
  const none = devPanelHtml(project, undefined, 'ko');
  assert.match(none, /페이지/);
  assert.match(none, /종류/);
  assert.match(none, /토큰/);
  assert.match(none, /페이지 HTML 복사/);
  assert.match(none, /SCENE\.json 복사/);
  assert.match(none, /프롬프트 복사/);
  assert.match(none, /tokens\.json 복사/);
  assert.match(none, /코딩 에이전트용 프롬프트/);
});

test('options.html overrides rendered markup', () => {
  const project = initialProject();
  const html = devPanelHtml(project, heroOf(project), 'en', {html: '<div class="given">ok</div>'});
  assert.match(html, /&lt;div class=&quot;given&quot;&gt;/);
  assert.doesNotMatch(html, /&lt;section/);
});

test('no selection offers page HTML, SCENE, prompt and tokens.json copy keys', () => {
  const project = initialProject();
  const html = devPanelHtml(project, undefined, 'en');
  for (const key of ['page-html', 'scene', 'prompt', 'tokens-json']) {
    assert.match(html, new RegExp(`data-copy="${key}"`));
    assert.match(html, new RegExp(`data-action="dev-copy" data-copy-target="${key}"`));
  }
  assert.match(html, /Showing the first 6,000 characters/);
  assert.match(html, /Copy page HTML for the full document/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<style>/);
  assert.match(html, /&lt;style&gt;/);
  const pageSource = devPanelCopyPayload(rootFrom(html), 'page-html')!;
  assert.match(pageSource, /<!doctype html>/i);
  assert.ok(pageSource.length > 6000);
  assert.ok(!html.includes(pageSource));
  const scene = JSON.parse(devPanelCopyPayload(rootFrom(html), 'scene')!);
  const ids = new Set((scene.pages as {nodes: {instanceId: string}[]}[]).flatMap(page => page.nodes.map(node => node.instanceId)));
  for (const block of project.pages[0].blocks) assert.ok(ids.has(block.id), block.id);
  assert.match(devPanelCopyPayload(rootFrom(html), 'prompt')!, /Build Form & Field/);
  const tokens = JSON.parse(devPanelCopyPayload(rootFrom(html), 'tokens-json')!);
  assert.equal(tokens.color.primary.$value, '#344e41');
  assert.equal(tokens.radius.$value, '2px');
});

test('XSS in page HTML display is escaped', () => {
  const project = initialProject();
  project.name = '<script>alert(1)</script>';
  const html = devPanelHtml(project, undefined, 'en');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<style>/);
  assert.match(html, /&amp;lt;script&amp;gt;/);
  assert.match(devPanelCopyPayload(rootFrom(html), 'page-html')!, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('selected block exposes node JSON from the scene manifest', () => {
  const project = initialProject();
  const hero = heroOf(project);
  const html = devPanelHtml(project, hero, 'en');
  const node = JSON.parse(devPanelCopyPayload(rootFrom(html), 'node')!);
  assert.equal(node.instanceId, hero.id);
  assert.equal(node.componentId, 'aphrodite.hero');
  assert.equal(devPanelCopyPayload(rootFrom(html), 'page-html'), null);
});
