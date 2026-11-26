import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {askKey} from '../src/editor/ask-keys';

/**
 * 0.3-G2b fix 1 (Astra high 1): a key answers the request to edit only from the person's keyboard and only while the
 * focus is inside the request on screen. A sheet over it (a screen that could not be drawn) takes every key, so Enter on
 * its Draw again can never allow an agent the person cannot see asking.
 */
const at=(o:Partial<{sheet:boolean;inAsk:boolean;onButton:string}>)=>({sheet:false,inAsk:true,onButton:'',...o});
test('Enter allows and Escape declines only with the focus in the request',()=>{
  assert.equal(askKey('Enter',true,at({onButton:'ask-allow'})),'allow');
  assert.equal(askKey('Escape',true,at({onButton:'ask-allow'})),'decline');
  assert.equal(askKey('Enter',true,at({inAsk:false})),'to-allow','focus elsewhere: Enter brings the focus to Allow, it answers nothing');
  assert.equal(askKey('Escape',true,at({inAsk:false})),'to-allow','and so does Escape');
  assert.equal(askKey('Enter',true,at({onButton:'ask-decline'})),'button','Enter on Not now is Not now, pressed');
});
test('a sheet over the request takes the keys, and a script\'s keys are dropped',()=>{
  for(const key of ['Enter','Escape'])assert.equal(askKey(key,true,at({sheet:true,onButton:'fatal-redraw',inAsk:false})),'sheet');
  for(const key of ['Enter','Escape'])assert.equal(askKey(key,false,at({onButton:'ask-allow'})),'drop');
  assert.equal(askKey('a',true,at({})),'pass');
});
test('the window\'s keys stand down while the sheet is up, before anything reads them',()=>{
  const main=readFileSync('src/main.ts','utf8');
  const at=main.indexOf("document.addEventListener('keydown', e => {");
  assert.ok(at>0);
  assert.match(main.slice(at,at+400),/^document\.addEventListener\('keydown', e => \{\n  \/\/[^\n]*\n  if\(fatalUp\(\)\)\{fatalKey\(e\);return;\}/,'the first thing the listener does');
});
