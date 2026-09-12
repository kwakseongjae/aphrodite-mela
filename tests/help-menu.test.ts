import {test} from 'node:test';
import assert from 'node:assert/strict';
import {esc} from '../src/html';
import {helpItems,helpMenuHtml,type HelpItem} from '../src/editor/help-menu';

const entries=helpItems.filter((item):item is HelpItem=>item!=='separator');

test('help items keep Figma-like order with two separators',()=>{
  assert.deepEqual(helpItems.map(item=>item==='separator'?'separator':item.id),[
    'commands','tour-start','agent','separator','brand-kit','release-notes','report-issue','separator','language-settings',
  ]);
  assert.equal(entries.length,7);
  assert.equal(helpItems.filter(item=>item==='separator').length,2);
});

test('helpMenuHtml renders separators, action buttons, blank-target links, and ⌘K once',()=>{
  const html=helpMenuHtml('en');
  assert.match(html,/<div class="help-menu" role="menu">/);
  assert.equal((html.match(/class="help-sep"/g)??[]).length,2);
  for(const item of entries){
    if(item.action)assert.match(html,new RegExp(`<button type="button" role="menuitem" data-action="${item.action}"`));
    if(item.href){
      assert.match(html,new RegExp(`<a role="menuitem" href="${item.href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}" target="_blank" rel="noopener"`));
      assert.match(html,/target="_blank"/);
      assert.match(html,/rel="noopener"/);
    }
    assert.ok(html.includes(esc(item.en)));
  }
  assert.equal((html.match(/⌘K/g)??[]).length,1);
  assert.match(html,/<kbd>⌘K<\/kbd>/);
});

test('Korean labels differ from English',()=>{
  const en=helpMenuHtml('en');
  const ko=helpMenuHtml('ko');
  assert.notEqual(en,ko);
  for(const item of entries){
    assert.notEqual(item.en,item.ko);
    assert.ok(en.includes(esc(item.en)));
    assert.ok(ko.includes(esc(item.ko)));
    assert.ok(!ko.includes(esc(item.en)));
  }
});

test('an injected quote or angle bracket in a label cannot break out',()=>{
  const hostile:HelpItem={id:'x',action:'y',en:'Click "here" <img src=x onerror=alert(1)>',ko:'<b>깨짐</b>',keys:'<"&'};
  const html=helpMenuHtml('en',[hostile]);
  assert.doesNotMatch(html,/<img\b/);
  assert.doesNotMatch(html,/<b>/);
  assert.ok(html.includes(esc(hostile.en)));
  assert.ok(html.includes(esc(hostile.keys!)));
  const ko=helpMenuHtml('ko',[hostile,'separator',{id:'z',href:'https://example.test/"onclick=1',en:'a',ko:'b'}]);
  assert.doesNotMatch(ko,/<b>/);
  assert.ok(ko.includes(esc(hostile.ko)));
  assert.doesNotMatch(ko,/href="[^"]*"onclick=/);
  assert.match(ko,/href="https:\/\/example\.test\/&quot;onclick=1"/);
});
