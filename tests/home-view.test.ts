import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject} from '../src/model';
import {entryFor,cloneProject} from '../src/workspace/library';
import {workspaceHome,projectCards} from '../src/workspace/home';

function library(){
  const a=initialProject();a.name='Alpha';
  const b=cloneProject(a);b.name='Beta';
  const c=cloneProject(a);c.name='Gamma';
  return {version:1 as const,entries:[entryFor(a),{...entryFor(b),pinned:true},{...entryFor(c),archived:true}]};
}

test('sidebar shows a count for every filter, not only recent',()=>{
  const html=workspaceHome(library(),'recent','','',false,'en','grid');
  const count=(f:string)=>html.match(new RegExp(`data-filter="${f}"[^>]*>[\\s\\S]*?<small>(\\d+)</small>`))?.[1];
  assert.equal(count('recent'),'2');assert.equal(count('pinned'),'1');assert.equal(count('archived'),'1');
});

test('grid cards use a more-menu and a fillable star instead of an inline tools row',()=>{
  const grid=projectCards(library(),'recent','','en','grid');
  assert.doesNotMatch(grid,/folio-tools/);
  assert.equal((grid.match(/<details class="folio-more">/g)||[]).length,2);
  assert.match(grid,/data-action="hub-rename"/);assert.match(grid,/data-action="hub-duplicate"/);assert.match(grid,/data-action="hub-archive"/);assert.match(grid,/data-action="vault-open"/);
  assert.match(grid,/class="folio-pin"[^>]*aria-pressed="true"[^>]*><svg class="folio-star"/);
  assert.match(grid,/class="folio-pin"[^>]*aria-pressed="false"/);
  // pinned entry sorts first
  assert.ok(grid.indexOf('Beta')<grid.indexOf('Alpha'));
});

test('list view renders rows with the same actions and the toggle reflects the active view',()=>{
  const lib=library();
  const list=projectCards(lib,'recent','','ko','list');
  assert.equal((list.match(/class="folio-row"/g)||[]).length,2);
  assert.doesNotMatch(list,/folio-preview-label/);
  assert.match(list,/folio-thumb/);assert.match(list,/data-action="hub-open"/);assert.match(list,/data-action="hub-archive"[^>]*>보관</);
  const home=workspaceHome(lib,'recent','','',false,'ko','list');
  assert.match(home,/data-view="list" aria-pressed="true"/);assert.match(home,/data-view="grid" aria-pressed="false"/);
  assert.match(home,/class="folio-grid folio-grid-list" id="project-grid" role="list"/);
  const archived=projectCards(lib,'archived','','ko','list');
  assert.match(archived,/data-action="hub-archive"[^>]*>복원</);
});

test('the archived filter and empty states still render',()=>{
  const lib=library();
  assert.match(projectCards(lib,'archived','','en','grid'),/Gamma/);
  assert.match(projectCards(lib,'pinned','zzz','en','grid'),/folio-empty/);
});
