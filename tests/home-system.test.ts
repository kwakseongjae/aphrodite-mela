import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {initialProject} from '../src/model';
import {entryFor} from '../src/workspace/library';
import {workspaceHome,projectCards} from '../src/workspace/home';
import {homeCopy} from '../src/workspace/home-copy';

const library=()=>{const p=initialProject();p.name='Alpha';return {version:1 as const,entries:[entryFor(p)]};};

/* 0.3-L4: home is drawn with the app's design system, src/ui. Its own layout is a screen sheet there, and the old sheet is gone. */
test('home is a system screen: its sheet lives under src/ui and the old one is gone',()=>{
  assert.equal(existsSync(new URL('../src/workspace/home.css',import.meta.url)),false,'src/workspace/home.css is gone');
  assert.ok(existsSync(new URL('../src/ui/screens/home.css',import.meta.url)),'src/ui/screens/home.css holds the layout');
  assert.match(readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),/import '\.\/ui\/screens\/home\.css';/);
});

test('home is built from the parts, and leaves the theme to the document root',()=>{
  const html=workspaceHome(library(),'recent','','','system','ko');
  assert.match(html,/^<div class="folio-home ui-root ui-home" data-sidebar=/);
  for(const theme of ['system','light','dark'] as const)assert.doesNotMatch(workspaceHome(library(),'recent','','',theme,'ko'),/data-theme=/,'0.3-L5: one theme for the app, on the document root');
  assert.doesNotMatch(workspaceHome(library(),'recent','','','dark','ko'),/folio-night/,'night is the dark theme, not a class of its own');
  for(const part of ['ui-side','ui-side-foot','ui-row','ui-heading','ui-heading-title','ui-input','ui-seg','ui-btn-primary','ui-btn-secondary','ui-switch','ui-board-card','ui-board-card-thumb','ui-menu'])
    assert.match(html,new RegExp('class="[^"]*\\b'+part+'\\b'),part);
  assert.match(projectCards({version:1,entries:[]},'recent','','ko'),/class="[^"]*\bui-empty\b/);
});

test('the hero is gone, and its words with it',()=>{
  const html=workspaceHome(library(),'recent','','','system','en');
  assert.doesNotMatch(html,/folio-hero|folio-art|folio-handwritten/);
  for(const key of ['eyebrow','headline','headlineEm','intro','handwritten','artAlt','artCaption','space','credit','footer','collection'])
    for(const language of ['en','ko'] as const)assert.ok(!(key in homeCopy[language]),language+'.'+key+' is gone');
  assert.equal((html.match(/\/brand\/cutouts\//g)||[]).length,1,'one picture from the brand kit, small, in one place');
});
