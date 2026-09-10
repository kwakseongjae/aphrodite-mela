import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dockHtml,dockShortcut,dockTools,editorModes,isEditorMode} from '../src/editor/dock';

test('the dock lists every tool with its data-action and a mode segment with the active mode pressed',()=>{
  const html=dockHtml({mode:'dev',language:'ko',activeTool:'select'});
  for(const t of dockTools)assert.match(html,new RegExp(`data-action="${t.action}"[^>]*data-tool="${t.id}"`));
  assert.match(html,/data-kind="frame"/);
  assert.match(html,/data-action="editor-mode" data-mode="dev" aria-pressed="true"/);
  assert.match(html,/data-action="editor-mode" data-mode="design" aria-pressed="false"/);
  assert.match(html,/data-tool="select" aria-pressed="true"/);
  assert.match(html,/개발/);assert.match(html,/에이전트/);
  assert.match(dockHtml({mode:'agent',language:'en',delegated:true}),/data-lucide="bot"/);
});

test('single-letter shortcuts map to tools and digits to modes; unknown keys map to null',()=>{
  assert.equal(dockShortcut('v')?.tool?.id,'select');assert.equal(dockShortcut('A')?.tool?.id,'add');assert.equal(dockShortcut('g')?.tool?.id,'vibe');
  assert.equal(dockShortcut('2')?.mode,'dev');assert.equal(dockShortcut('3')?.mode,'agent');
  assert.equal(dockShortcut('z'),null);
  assert.deepEqual([...editorModes],['design','dev','agent']);assert.ok(isEditorMode('agent'));assert.ok(!isEditorMode('edit'));
});

test('the dock shows the zoom control when a zoom value is given',()=>{assert.match(dockHtml({mode:'design',language:'en',zoom:85}),/data-action="zoom"[^>]*>85%</);assert.doesNotMatch(dockHtml({mode:'design',language:'en'}),/dock-zoom/);});
