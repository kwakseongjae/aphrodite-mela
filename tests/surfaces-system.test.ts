import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {states} from './support/surfaces';

/* 0.3-L4 ②: the surfaces drawn outside main.ts are made of the parts, their layout is a screen sheet under src/ui, and the old rules are gone. */
const parts:Record<string,string[]>={
  dock:['ui-toolbar','ui-toolbar-float','ui-icon-btn','ui-seg','ui-seg-item','ui-toolbar-sep'],
  dockPointer:['ui-menu','ui-menu-item','ui-menu-key'],
  helpEn:['ui-menu','ui-menu-item','ui-menu-sep','ui-menu-key'],
  palette:['ui-input','ui-menu-item','ui-menu-label','ui-menu-key','ui-help'],
  toasts:['ui-toast'],
  updateOffer:['ui-card','ui-btn-primary','ui-icon-btn','ui-menu','ui-caps'],
  updateWorking:['ui-progress','ui-progress-bar'],
  welcomeKo:['ui-seg','ui-btn-primary','ui-btn-secondary','ui-btn-quiet','ui-icon'],
  tourFirst:['ui-popover','ui-popover-title','ui-popover-text','ui-popover-step','ui-btn-primary'],
  vault:['ui-btn','ui-mono','ui-help','ui-banner'],
  agentPanel:['ui-caps','ui-mono','ui-btn-primary','ui-help'],
  vanished:['ui-banner','ui-btn'],
  languageEditor:['ui-label','ui-select','ui-btn-primary','ui-help'],
};
test('each surface is made of the parts',()=>{
  const missing=Object.entries(parts).flatMap(([state,want])=>{const html=states[state]();return want.filter(p=>!new RegExp('class="[^"]*\\b'+p+'\\b').test(html)).map(p=>state+': '+p);});
  assert.deepEqual(missing,[]);
});

test('their layout is a screen sheet under src/ui, and the old rules for them are gone',()=>{
  assert.ok(existsSync(new URL('../src/ui/screens/surfaces.css',import.meta.url)));
  const style=readFileSync(new URL('../src/style.css',import.meta.url),'utf8')+readFileSync(new URL('../src/workspace/vault.css',import.meta.url),'utf8');
  const left=[...style.matchAll(/(?:^|[}\n])\s*((?:#toast|\.toast|\.palette(?!-orb)|\.dock|\.agent-panel|\.vault-file|\.vault-path|\.welcome|\.tour-card|\.tour-count|\.tour-actions|\.help-menu|\.help-sep|\.help-fab summary|\.update-)[^{]*)\{/g)].map(m=>m[1].trim());
  assert.deepEqual(left,[]);
  assert.match(readFileSync(new URL('../index.html',import.meta.url),'utf8'),/<div id="toast" class="ui-toast-stack" role="status" aria-live="polite">/,'the toast stack keeps its place and its live region');
});

