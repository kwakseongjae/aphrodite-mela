import {test} from 'node:test';
import assert from 'node:assert/strict';
import {menuSelectHtml} from '../src/design/menu-select';

test('the menu mirrors the options, marks the selected one and escapes labels',()=>{
  const html=menuSelectHtml([{value:'desktop',label:'Desktop · 1440',selected:true,disabled:false},{value:'x',label:'<b>bad</b>',selected:false,disabled:true}],{disabled:false,label:'Frame size'});
  assert.match(html,/<summary aria-label="Frame size"><span>Desktop · 1440<\/span>/);
  assert.match(html,/role="menuitemradio" aria-checked="true" data-value="desktop"/);
  assert.match(html,/data-value="x" disabled>&lt;b&gt;bad&lt;\/b&gt;</);
  assert.doesNotMatch(html,/<b>bad/);
  assert.match(menuSelectHtml([],{disabled:true,label:'Empty'}),/aria-disabled="true"/);
});
