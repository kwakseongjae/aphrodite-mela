import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,visiblePages} from '../src/editor/starter';
import {fitCamera,openingCamera,readCamera,unionBox,writeCamera} from '../src/editor/space';
import {personAt} from '../src/agent/dispatch';
import {editorBoard,editorCalls,noop} from './support/editor-calls';

test('a saved camera on a reopened empty board fits the first shown frame exactly once',()=>{
  const project=newBoard('Returning'),other=newBoard('Other'),saved={x:-8000,y:-4000,zoom:0.5},values=new Map<string,string>();
  const localStorage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)};
  const space={clientWidth:800,clientHeight:600,addEventListener:noop},fits:string[]=[];
  const screen={...editorBoard(project),localStorage,openingCamera,readCamera,visiblePages,unionBox,fitCamera,AbortController,
    cameraProjectId:'',cameraFitPending:false,spaceAbort:undefined,spaceHeld:false,camera:saved,spaceEl:()=>space,
    recordRun:(kind:string)=>fits.push(kind),applyCamera:noop,
    document:{querySelectorAll:()=>visiblePages(screen.project).map(p=>({dataset:{pageId:p.id},offsetWidth:1440,offsetHeight:600}))}};
  editorCalls(['function commit(','function mountSpace(','function fitAll(','function frameBoxes('],screen);
  const {commit,mountSpace}=screen as typeof screen & {commit:Function;mountSpace:()=>void};
  mountSpace();
  writeCamera(localStorage,project.id,saved);
  screen.project=other; mountSpace();
  screen.project=project; mountSpace();
  assert.deepEqual(screen.camera,saved);
  const add=(id:string)=>commit(()=>{project.pages.push({id,name:id,blocks:[]});project.activePageId=id;},personAt({isTrusted:true}),'edit.page-add');
  add('first'); mountSpace();
  assert.deepEqual(screen.camera,fitCamera({x:0,y:0,width:1440,height:600},{width:800,height:600},60));
  assert.equal(fits.filter(kind=>kind==='camera:fit').length,1);
  writeCamera(localStorage,project.id,saved);
  screen.project=other; mountSpace();
  screen.project=project; mountSpace();
  add('second'); mountSpace();
  assert.deepEqual(screen.camera,saved,'a populated board keeps its camera on reopen and on the next add');
  assert.equal(fits.filter(kind=>kind==='camera:fit').length,1);
});
