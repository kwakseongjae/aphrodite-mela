import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandTable,filterCommands,commandPaletteHtml,stateLine} from '../src/editor/command-palette';

const ctx={hasSelection:true,canUndo:true,canRedo:false,approved:false,viewport:'desktop' as const};

test('the palette lists every addable kind plus navigation/design/review/file commands, never Approve',()=>{
  const cmds=commandTable(ctx);
  assert.ok(cmds.some(c=>c.action==='add'&&c.data?.kind==='hero'));
  assert.ok(cmds.some(c=>c.action==='add'&&c.data?.kind==='button'));
  assert.ok(!cmds.some(c=>c.action==='add'&&c.data?.kind?.startsWith('moa')));
  for(const a of ['autofill','systems','theme-review','component-explorer','export','preview','agent','undo','redo','duplicate','delete'])assert.ok(cmds.some(c=>c.action===a),a);
  assert.ok(!cmds.some(c=>c.action==='approve'));
  const noSel=commandTable({...ctx,hasSelection:false});
  assert.ok(!noSel.some(c=>c.action==='delete'));
});

test('filtering matches English, Korean and action ids',()=>{
  const cmds=commandTable(ctx);
  assert.ok(filterCommands(cmds,'hero','en').every(c=>`${c.en}${c.ko}${c.action}${c.data?.kind}`.toLowerCase().includes('hero')));
  assert.ok(filterCommands(cmds,'디자인 시스템','ko').some(c=>c.action==='systems'));
  assert.ok(filterCommands(cmds,'theme-review','en').some(c=>c.action==='theme-review'));
  assert.equal(filterCommands(cmds,'zzzz-none','en').length,0);
});

test('palette html carries real data-action hooks, grouped, escaped, with shortcuts',()=>{
  const html=commandPaletteHtml(commandTable(ctx),'','ko');
  assert.match(html,/id="command-search"/);assert.match(html,/role="listbox"/);
  assert.match(html,/data-palette data-action="add" data-kind="hero"/);
  assert.match(html,/<kbd>⌘Z<\/kbd>/);assert.match(html,/컴포넌트 추가/);
  const empty=commandPaletteHtml(commandTable(ctx),'<script>','en');
  assert.doesNotMatch(empty,/<script>/);assert.match(empty,/No matching commands/);
});

test('state line summarises page, selection, system, approval, viewport and save state',()=>{
  const en=stateLine({page:'Home',blocks:7,selectedKind:'hero',selectedName:'Editorial hero',system:'Atelier',approved:false,viewport:'mobile',saved:true,language:'en'});
  assert.match(en,/Page Home/);assert.match(en,/7 components/);assert.match(en,/Selected Editorial hero/);assert.match(en,/Draft/);assert.match(en,/Mobile 375px/);assert.match(en,/Saved/);
  const ko=stateLine({page:'홈',blocks:0,system:'Toss inspired',approved:true,viewport:'desktop',saved:false,language:'ko'});
  assert.match(ko,/선택 없음/);assert.match(ko,/승인됨/);assert.match(ko,/저장 안 됨/);
  assert.doesNotMatch(stateLine({page:'<b>',blocks:1,system:'x',approved:false,viewport:'desktop',saved:true,language:'en'}),/<b>/);
});

test('groups are ordered so the long add-component list comes last',()=>{
  const html=commandPaletteHtml(commandTable(ctx),'','en');
  const idx=(label:string)=>html.indexOf(`<span>${label}</span>`);
  assert.ok(idx('Navigate')<idx('Design'));assert.ok(idx('Design')<idx('Review'));assert.ok(idx('Review')<idx('Edit'));assert.ok(idx('File')<idx('Add component'));
});

test('the palette lists other frames as navigate entries and skips the active one',()=>{
  const list=commandTable({hasSelection:false,canUndo:false,canRedo:false,approved:false,viewport:'desktop',pages:[{id:'a',name:'Home',active:true},{id:'b',name:'Checkout',active:false}]});
  const frames=list.filter(c=>c.id.startsWith('frame-'));
  assert.equal(frames.length,1);
  assert.deepEqual(frames[0].data,{id:'b',nav:'fit'});
  assert.match(frames[0].ko,/Checkout/);
  assert.ok(list.some(c=>c.action==='panels-all'));
});
