import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,visiblePages} from '../src/editor/starter';
import {dockHtml,nothingToPreview} from '../src/editor/dock';
import {personAt} from '../src/agent/dispatch';
import {editorActions,editorCalls} from './support/editor-calls';

// 0.3-L5 fix 1: a board that shows no page has nothing to preview; Preview must not open the hidden page a new board starts with.
test('the dock turns Preview off on an empty board and says why in one sentence',()=>{
  for(const language of ['en','ko'] as const){
    const off=dockHtml({mode:'design',language,sections:false,empty:true}),on=dockHtml({mode:'design',language,sections:false});
    const button=(html:string)=>/<button[^>]*data-tool="preview"[^>]*>/.exec(html)![0];
    assert.match(button(off),/ disabled/);
    assert.ok(button(off).includes(`title="${nothingToPreview(language==='ko')}"`));
    assert.doesNotMatch(button(on),/disabled/);
    assert.match(nothingToPreview(language==='ko'),/^[^.]+[.]$/,'one sentence');
  }
});

test('Preview on a board with no shown page tells the person why and opens nothing',async()=>{
  for(const uiLanguage of ['en','ko'] as const){
    const project=newBoard('Empty');assert.equal(visiblePages(project).length,0);
    const toasts:string[]=[],opened:string[]=[];
    const screen={...editorActions(project),uiLanguage,visiblePages,nothingToPreview,toast:(m:string)=>toasts.push(m),showModal:(html:string)=>opened.push(html),recordRun:(k:string)=>opened.push(k)};
    editorCalls(['async function action('],screen);
    await (screen as typeof screen & {action:Function}).action({dataset:{action:'preview'}},personAt({isTrusted:true}),true);
    assert.deepEqual(toasts,[nothingToPreview(uiLanguage==='ko')]);
    assert.deepEqual(opened,[]);
  }
});

test('the board actions bar turns its Preview off the same way',async()=>{
  const {readFileSync}=await import('node:fs');
  const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.ok(main.includes('data-action="preview"${shown.length?\'\':` disabled title="${esc(nothingToPreview(uiLanguage===\'ko\'))}"`}>'));
  assert.ok(main.includes('empty:!shown.length'));
});
