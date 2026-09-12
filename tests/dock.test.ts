import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dockGroups,dockHtml,dockShortcut,dockTools,editorModes,isEditorMode} from '../src/editor/dock';

test('the dock lists every tool with its data-action and a mode segment with the active mode pressed',()=>{
  const html=dockHtml({mode:'dev',language:'ko',activeTool:'select'});
  for(const g of dockGroups){
    const shown=g.items.find(i=>i.id==='select')??g.items[0];
    assert.match(html,new RegExp(`class="dock-slot" data-group="${g.id}"`));
    assert.match(html,new RegExp(`data-action="${shown.action}"[^>]*data-tool="${shown.id}"`));
  }
  assert.match(html,/data-action="editor-mode" data-mode="dev" aria-pressed="true"/);
  assert.match(html,/data-action="editor-mode" data-mode="design" aria-pressed="false"/);
  assert.match(html,/data-tool="select" aria-pressed="true"/);
  assert.match(html,/개발/);assert.match(html,/에이전트/);
  assert.match(dockHtml({mode:'agent',language:'en',delegated:true}),/data-lucide="bot"/);
});

test('every group renders one slot; the active tool of a group is the one shown; a group with one item has no caret',()=>{
  const html=dockHtml({mode:'design',language:'en',activeTool:'hand'});
  assert.equal((html.match(/class="dock-slot"/g)??[]).length,dockGroups.length);
  assert.match(html,/data-tool="hand" aria-pressed="true"/);
  assert.doesNotMatch(html,/class="dock-tool"[^>]*data-tool="select"/);
  assert.match(html,/data-tool="add" aria-pressed="false"/);
  assert.match(html,/class="dock-caret"[^>]*data-group="pointer"/);
  assert.match(html,/class="dock-caret"[^>]*data-group="insert"/);
  assert.match(html,/class="dock-caret"[^>]*data-group="media"/);
  assert.doesNotMatch(html,/class="dock-caret"[^>]*data-group="run"/);
  const vibe=dockHtml({mode:'design',language:'en',activeTool:'vibe'});
  assert.match(vibe,/data-tool="vibe" aria-pressed="true"/);
  assert.doesNotMatch(vibe,/class="dock-tool"[^>]*data-tool="reference"/);
});

test('openGroup renders exactly one dock-menu with a menuitemradio per item, the active one checked, and a kbd per item',()=>{
  const group=dockGroups.find(g=>g.id==='pointer')!;
  const html=dockHtml({mode:'design',language:'en',activeTool:'select',openGroup:'pointer'});
  assert.equal((html.match(/class="dock-menu"/g)??[]).length,1);
  assert.match(html,/class="dock-menu" role="menu" data-group="pointer"/);
  assert.match(html,/class="dock-caret"[^>]*data-group="pointer"[^>]*aria-expanded="true"/);
  assert.equal((html.match(/role="menuitemradio"/g)??[]).length,group.items.length);
  assert.match(html,/role="menuitemradio" aria-checked="true"[^>]*data-tool="select"/);
  assert.match(html,/role="menuitemradio" aria-checked="false"[^>]*data-tool="hand"/);
  for(const item of group.items)assert.match(html,new RegExp(`<kbd>${item.key}</kbd>`));
  assert.match(html,/data-action="dock-hand"[^>]*data-tool="hand"/);
  const closed=dockHtml({mode:'design',language:'en',activeTool:'select'});
  assert.doesNotMatch(closed,/class="dock-menu"/);
  const insert=dockHtml({mode:'design',language:'ko',activeTool:'add',openGroup:'insert',zoom:85});
  assert.equal((insert.match(/class="dock-menu"/g)??[]).length,1);
  assert.match(insert,/data-group="insert"/);
  assert.match(insert,/data-action="new-frame"/);
  assert.doesNotMatch(insert,/data-group="zoom"[^>]*class="dock-menu"|class="dock-menu"[^>]*data-group="zoom"/);
});

test('the zoom caret and zoom menu appear',()=>{
  const html=dockHtml({mode:'design',language:'en',zoom:85,openGroup:'zoom'});
  assert.match(html,/class="dock-slot" data-group="zoom"/);
  assert.match(html,/class="dock-caret"[^>]*data-group="zoom"[^>]*aria-expanded="true"/);
  assert.match(html,/class="dock-menu" role="menu" data-group="zoom"/);
  for(const action of ['zoom-in','zoom-out','zoom-100','zoom-fit','zoom-frame'])assert.match(html,new RegExp(`data-action="${action}"`));
  assert.match(html,/<kbd>⌘\+<\/kbd>/);
  assert.match(html,/<kbd>⌘−<\/kbd>/);
  assert.match(html,/<kbd>⌘0<\/kbd>/);
  assert.match(html,/<kbd>⇧1<\/kbd>/);
  assert.match(html,/<kbd>⇧2<\/kbd>/);
  const closed=dockHtml({mode:'design',language:'en',zoom:85});
  assert.match(closed,/class="dock-caret"[^>]*data-group="zoom"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(closed,/class="dock-menu"/);
});

test('single-letter shortcuts map to tools and digits to modes; unknown keys map to null',()=>{
  assert.equal(dockShortcut('v')?.tool?.id,'select');assert.equal(dockShortcut('H')?.tool?.id,'hand');
  assert.equal(dockShortcut('A')?.tool?.id,'add');assert.equal(dockShortcut('f')?.tool?.id,'frame');
  assert.equal(dockShortcut('r')?.tool?.id,'reference');assert.equal(dockShortcut('g')?.tool?.id,'vibe');
  assert.equal(dockShortcut('p')?.tool?.id,'preview');
  assert.equal(dockShortcut('1')?.mode,'design');assert.equal(dockShortcut('2')?.mode,'dev');assert.equal(dockShortcut('3')?.mode,'agent');
  assert.equal(dockShortcut('z'),null);
  assert.deepEqual([...editorModes],['design','dev','agent']);assert.ok(isEditorMode('agent'));assert.ok(!isEditorMode('edit'));
  assert.deepEqual(dockTools.map(t=>t.id),dockGroups.flatMap(g=>g.items.map(i=>i.id)));
  assert.deepEqual(dockTools.map(t=>t.id),['select','hand','add','frame','reference','vibe','preview']);
});

test('the dock shows the zoom control when a zoom value is given',()=>{assert.match(dockHtml({mode:'design',language:'en',zoom:85}),/data-action="zoom-fit"[^>]*>85%</);assert.doesNotMatch(dockHtml({mode:'design',language:'en'}),/dock-zoom/);});
