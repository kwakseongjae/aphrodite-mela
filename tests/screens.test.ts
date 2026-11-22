import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actionScreen,editorActions,homeActions} from '../src/editor/screens';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const actionsIn=(text:string)=>[...text.matchAll(/data-action="([a-z0-9-]+)"/g)].map(m=>m[1]);
const main=read('src/main.ts');

/* Codex 2026-11-22 (check 4): a disk- prefix made the editor's save-failure banner Home-only, and its two
   recovery buttons stopped answering. Bands drawn on both screens may only carry actions that run anywhere. */
test('the save-failure banner and the missing-folder notice carry actions that run on either screen',()=>{
  const banner=main.slice(main.indexOf('function diskWarningHtml'),main.indexOf('function attachDiskQueue'));
  const notice=read('src/workspace/breadcrumb.ts');
  const drawn=[...actionsIn(banner),...actionsIn(notice)];
  assert.ok(drawn.includes('disk-backup')&&drawn.includes('disk-reload'),'the banner was found');
  for(const action of drawn)assert.equal(actionScreen(action),'any',action);
});

test('Home draws no editor action, and the table is one name per action with no overlap',()=>{
  for(const path of ['src/workspace/home.ts','src/workspace/workspace-ui.ts','src/workspace/onboarding.ts'])
    for(const action of actionsIn(read(path)))assert.notEqual(actionScreen(action),'editor',`${path}: ${action}`);
  for(const action of homeActions)assert.equal(editorActions.has(action),false,action);
  const handled=new Set([...main.matchAll(/case '([a-z0-9-]+)'/g),...read('src/workspace/archive.ts').matchAll(/case '([a-z0-9-]+)'/g)].map(m=>m[1]));
  for(const action of [...editorActions,...homeActions])assert.ok(handled.has(action),`${action} is an action the app handles`);
  assert.equal(actionScreen('disk-reload'),'any');
  assert.equal(actionScreen('hub-backup'),'any');
  assert.equal(actionScreen('disk-start-fresh'),'any','the missing-folder notice draws it on either screen');
  assert.equal(actionScreen('not-a-real-action'),'any','an action the table does not name runs anywhere');
});
