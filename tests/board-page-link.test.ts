import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard} from '../src/editor/starter';
import {frameWidth} from '../src/editor/space';
import {personAt} from '../src/agent/dispatch';
import {editorBoard,editorCalls,noop} from './support/editor-calls';

test('a link from an entered board frame reveals the starter beside it in one change',()=>{
  const project=newBoard('Board'),starter=project.activePageId,board=editorBoard(project);
  const frame={contentWindow:{},dataset:{framePage:'article'},closest:(s:string)=>s.includes('.space-frame.entered')?{}:null,focus:noop,blur:noop};
  const section={querySelector:()=>frame,classList:{add:noop,remove:noop}};
  const events=new Map<string,Function>(),listen=(type:string,fn:Function)=>events.set(type,fn);
  const fits:string[]=[];
  const screen={...board,personAt,who:personAt,boardSection:()=>section,enteredPage:'',frameVisitors:new WeakMap(),leaving:0,
    document:{addEventListener:listen,querySelectorAll:()=>[frame]},addEventListener:listen,fitFrame:(id:string)=>fits.push(id)};
  editorCalls(['function commit(','function enterPage(','function leavePage(',"document.addEventListener('dblclick'","addEventListener('message'"],screen);
  const edit=(screen as typeof screen & {commit:Function}).commit;
  edit(()=>project.pages.push({id:'article',name:'Article',blocks:[],kind:'html',html:`<a href="page:${starter}">Start</a>`}),personAt({isTrusted:true}),'edit.page-add');
  const link=(id:string)=>{
    events.get('dblclick')!({isTrusted:true,target:{closest:()=>({dataset:{boardShield:'article'}})}});
    events.get('message')!({source:frame.contentWindow,data:{aphrodite:'frame',kind:'page',id}});
  };
  link('article');
  assert.equal(board.edits.undo.length,1,'a link to a shown page only moves the view');
  link(starter);
  assert.equal(project.starter,undefined);
  const frames=project.space!.frames;
  assert.ok(frames[starter].x>=frames.article.x+frameWidth(frames.article));
  assert.equal(board.edits.undo.length,2);
  assert.equal(project.ledger?.changes.at(-1)?.source,'editor:change');
  assert.deepEqual(fits,['article',starter]);
});
