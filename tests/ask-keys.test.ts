import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {askKey} from '../src/editor/ask-keys';

/**
 * 0.3-G2b fix 1 (Astra high 1): a key answers the request to edit only from the person's keyboard and only while the
 * focus is inside the request on screen. A sheet over it (a screen that could not be drawn) takes every key, so Enter on
 * its Draw again can never allow an agent the person cannot see asking.
 */
const at=(o:Partial<{sheet:boolean;inAsk:boolean;onButton:string;fresh:boolean}>)=>({sheet:false,inAsk:true,onButton:'',fresh:true,...o});
test('Enter allows and Escape declines only with the focus in the request',()=>{
  assert.equal(askKey('Enter',true,at({onButton:'ask-allow'})),'allow');
  assert.equal(askKey('Escape',true,at({onButton:'ask-allow'})),'decline');
  assert.equal(askKey('Enter',true,at({inAsk:false})),'drop','focus elsewhere: Enter answers nothing and moves nothing');
  assert.equal(askKey('Escape',true,at({inAsk:false})),'drop','and so does Escape');
  assert.equal(askKey('Enter',true,at({onButton:'ask-allow',fresh:false})),'drop','a key held from before is not a press on Allow');
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
  assert.match(main.slice(at,at+600),/^document\.addEventListener\('keydown', e => \{\n(  \/\/[^\n]*\n)+  const fresh=[^\n]*\n(  \/\/[^\n]*\n)*  if\(fatalUp\(\)\)\{fatalKey\(e\);return;\}/,'the first thing the listener does, once the key is noted as held');
});

/* Astra recheck 1: a held Enter, through the window's real key listeners. With a toast's button focused above an open
   request, Enter and its repeats answer nothing and move no focus; with Draw again pressed by Enter, the sheet going
   away while Enter is still down leaves the request unanswered until the key is let go and pressed again. */
test('a held key never answers the request to edit, however the focus or the sheet changes under it',async()=>{
  const {editorCalls}=await import('./support/editor-calls');
  const listeners:Record<string,((e:unknown)=>void)[]>={};
  const on=(type:string,fn:(e:unknown)=>void)=>{(listeners[type]??=[]).push(fn);};
  const el=(action:string,inAsk:boolean)=>({dataset:{action},matches:(s:string)=>s==='button',closest:(s:string)=>s==='.ask-modal'&&inAsk?{}:null});
  const answers:boolean[]=[];let sheet=false;let focused=el('undo',false);
  const screen:Record<string,unknown>={askKey,askOpen:()=>true,fatalUp:()=>sheet,fatalKey:()=>{},answerAsk:(allow:boolean)=>{answers.push(allow);},
    document:{addEventListener:on,get activeElement(){return focused;}},window:{addEventListener:on},Set};
  editorCalls(['const heldKeys','document.addEventListener(\'keyup\',e=>{heldKeys','window.addEventListener(\'blur\'','document.addEventListener(\'keydown\''],screen);
  const send=(type:string,key:string,repeat=false)=>{for(const fn of listeners[type]??[])fn({type,key,code:key,repeat,isTrusted:true,preventDefault(){}});};
  send('keydown','Enter');send('keydown','Enter',true);send('keydown','Enter',true);
  assert.deepEqual(answers,[],'Enter held on a toast\'s button allows nothing');
  focused=el('ask-allow',true);send('keydown','Enter',true);
  assert.deepEqual(answers,[],'not even once the focus is on Allow, while the same press is held');
  send('keyup','Enter');focused=el('undo',false);send('keydown','Escape');send('keyup','Escape');send('keydown','Enter');send('keyup','Enter');
  assert.deepEqual(answers,[],'Escape outside the request moves nothing, so the next Enter outside answers nothing either');
  sheet=true;focused=el('fatal-redraw',false);send('keydown','Enter');
  sheet=false;focused=el('ask-allow',true);send('keydown','Enter',true);send('keydown','Enter');
  assert.deepEqual(answers,[],'Draw again pressed by Enter: the sheet gone, the held Enter still answers nothing');
  send('keyup','Enter');send('keydown','Enter');
  assert.deepEqual(answers,[true],'a fresh press on Allow allows');
  send('keyup','Enter');send('keydown','Enter');send('blur','');send('keydown','Enter');
  assert.deepEqual(answers,[true,true,true],'a key whose release was lost while the window was away is not held for good');
});
