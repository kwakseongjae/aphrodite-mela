import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject} from '../src/model';
import {newBoard} from '../src/editor/starter';
import {editorBoard,editorCalls} from './support/editor-calls';
import {personAt} from '../src/agent/dispatch';
import {entryFor,cloneProject,upsertProject} from '../src/workspace/library';
import {workspaceHome,projectCards} from '../src/workspace/home';

function library(){
  const a=initialProject();a.name='Alpha';
  const b=cloneProject(a);b.name='Beta';
  const c=cloneProject(a);c.name='Gamma';
  return {version:1 as const,entries:[entryFor(a),{...entryFor(b),pinned:true},{...entryFor(c),archived:true}]};
}

test('sidebar shows a count for every filter, not only recent',()=>{
  const html=workspaceHome(library(),'recent','','','system','en','grid');
  const count=(f:string)=>html.match(new RegExp(`data-filter="${f}"[^>]*>[\\s\\S]*?<small[^>]*>(\\d+)</small>`))?.[1];
  assert.equal(count('recent'),'2');assert.equal(count('pinned'),'1');assert.equal(count('archived'),'1');
});

test('grid cards use a more-menu and a fillable star instead of an inline tools row',()=>{
  const grid=projectCards(library(),'recent','','en','grid');
  assert.doesNotMatch(grid,/folio-tools/);
  assert.equal((grid.match(/<details class="folio-more">/g)||[]).length,2);
  assert.match(grid,/data-action="hub-rename"/);assert.match(grid,/data-action="hub-duplicate"/);assert.match(grid,/data-action="hub-archive"/);assert.match(grid,/data-action="vault-open"/);
  assert.match(grid,/class="folio-pin[^"]*"[^>]*aria-pressed="true"[^>]*><svg class="folio-star/);
  assert.match(grid,/class="folio-pin[^"]*"[^>]*aria-pressed="false"/);
  // pinned entry sorts first
  assert.ok(grid.indexOf('Beta')<grid.indexOf('Alpha'));
});

test('list view renders rows with the same actions and the toggle reflects the active view',()=>{
  const lib=library();
  const list=projectCards(lib,'recent','','ko','list');
  assert.equal((list.match(/class="folio-row ui-home-row"/g)||[]).length,2);
  assert.doesNotMatch(list,/folio-preview-label/);
  assert.match(list,/ui-row-thumb/);assert.match(list,/data-action="hub-open"/);assert.match(list,/data-action="hub-archive"[^>]*>.*?<span>보관<\/span>/);
  const home=workspaceHome(lib,'recent','','','system','ko','list');
  assert.match(home,/data-view="list" aria-pressed="true"/);assert.match(home,/data-view="grid" aria-pressed="false"/);
  assert.match(home,/class="folio-grid ui-home-grid folio-grid-list" id="project-grid" role="list"/);
  const archived=projectCards(lib,'archived','','ko','list');
  assert.match(archived,/data-action="hub-archive"[^>]*>.*?<span>복원<\/span>/);
});

test('the archived filter and empty states still render',()=>{
  const lib=library();
  assert.match(projectCards(lib,'archived','','en','grid'),/Gamma/);
  assert.match(projectCards(lib,'pinned','zzz','en','grid'),/folio-empty/);
});

test('returning Home counts only shown pages on the card and list in both languages',()=>{
  const project=newBoard('Empty'),board=editorBoard(project),person=personAt({isTrusted:true});
  let library=upsertProject({version:1,entries:[]},project);
  board.persist=()=>{library=upsertProject(library,project);};
  editorCalls(['function commit('],board);
  const {commit}=board as typeof board & {commit:Function};
  function counts(en:string,ko:string){
    for(const view of ['grid','list'] as const)for(const language of ['en','ko'] as const){
      const html=workspaceHome(library,'recent','','','system',language,view);
      assert.ok(html.includes('>'+ (language==='ko'?ko:en)+' · '),language+' '+view);
    }
  }
  counts('No pages yet.','아직 페이지가 없어요.');
  commit(()=>project.pages.push({id:'article',name:'Article',kind:'html',html:'<p>Article</p>',blocks:[]}),person,'edit.page-add');
  counts('1 page','1 페이지');
  commit(()=>board.revealStarter(project,project.activePageId),person,'edit.page-view-edit');
  counts('2 pages','2 페이지');
});
