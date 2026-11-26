import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,visiblePages} from '../src/editor/starter';
import {FRAME_GAP,frameWidth} from '../src/editor/space';
import {agentDispatch} from '../src/agent/dispatch';
import {parseBatch} from '../src/agent/ops';
import {runBatch} from '../src/agent/apply';
import {editorBoard,editorCalls} from './support/editor-calls';

test('one agent patch replaces the only shown frame at the origin and places its next frame beside it',()=>{
  const board=editorBoard(newBoard('Board')),d=agentDispatch('test','mcp',{reason:'Replace the article'});
  editorCalls(['function commit('],board);
  const {commit}=board as typeof board & {commit:Function};
  function apply(input:Record<string,unknown>){
    const parsed=parseBatch({reason:d.reason,...input});
    if('error' in parsed)throw new Error(parsed.error);
    commit(()=>{
      const old=board.project,result=runBatch(old,parsed.batch,'');
      if(!result.ok)throw new Error(result.error);
      board.project={...result.project,ledger:old.ledger};
    },d,'edit.apply',{source:'agent:apply'});
  }
  apply({ops:[{op:'html_page',name:'Old article',html:'<h1>Old article</h1>'}]});
  const old=visiblePages(board.project)[0].id;
  apply({patch:[{op:'remove_page',page_id:old},...['brief','details'].map((id,i)=>({op:'insert_page',index:i+1,page:{id,name:id,blocks:[]}}))]});
  const frames=board.project.space!.frames;
  assert.deepEqual([frames.brief.x,frames.brief.y],[0,0]);
  assert.deepEqual([frames.details.x,frames.details.y],[frameWidth(frames.brief)+FRAME_GAP,0]);
  assert.equal(frames[old],undefined);
  assert.equal(board.project.starter,board.project.activePageId);
  assert.equal(board.project.ledger?.seq,2);
  apply({ops:[{op:'html_page',name:'Published',html:'<h1>Published</h1>',width:900,height:600}],patch:[
    {op:'remove_page',page_id:'brief'},{op:'remove_page',page_id:'details'}]});
  const [published]=visiblePages(board.project);
  assert.deepEqual(board.project.space!.frames[published.id],{x:0,y:0,preset:'custom',width:900,height:600});
});

test('a patch that clears space places its first shown frame at the origin in the recorded change',()=>{
  const board=editorBoard(newBoard('Board')),d=agentDispatch('test','mcp',{reason:'Start a fresh layout'});
  editorCalls(['function commit('],board);
  const parsed=parseBatch({reason:d.reason,patch:[
    {op:'set',on:'project',field:'space',unset:true},
    {op:'insert_page',index:1,page:{id:'brief',name:'Brief',blocks:[]}}]});
  if('error' in parsed)throw new Error(parsed.error);
  (board as typeof board & {commit:Function}).commit(()=>{
    const result=runBatch(board.project,parsed.batch,'');
    if(!result.ok)throw new Error(result.error);
    assert.equal(result.project.space,undefined);
    board.project=result.project;
  },d,'edit.apply',{source:'agent:apply'});
  assert.equal(board.project.starter,board.project.activePageId);
  assert.deepEqual(board.project.space!.frames.brief,{x:0,y:0,preset:'desktop'});
  assert.equal(board.project.ledger?.seq,1);
  assert.equal(board.edits.undo.length,1);
});
