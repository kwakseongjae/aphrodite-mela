import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {controlText} from '../src/i18n';
import {commandTable,filterCommands} from '../src/editor/command-palette';

const read=(f:string)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

/* 0.3-L5 fix 1, the owner's two names: the window of a board's kept files is the Board library (보드 자료함), and the button that keeps a board as one .aphrodite.json file is Save a backup file (백업 파일로 저장). */
test('the screen calls a board\'s kept files the Board library and its .aphrodite.json button Save a backup file',()=>{
  assert.equal(controlText('Board library','ko'),'보드 자료함');
  assert.equal(controlText('Save a backup file','ko'),'백업 파일로 저장');
  const main=read('src/main.ts');
  assert.ok(main.includes("button('save-project', 'download', 'Save a backup file', 'secondary-button')"));
  assert.ok(main.includes("button('vault-open','folder','Board library','secondary-button')"));
  assert.ok(main.includes("showModal(ui('Board library','보드 자료함')"));
  // The sentences that still say Save project and 프로젝트 저장 is what an agent is told, word for word as main (0.3-L5 fix 2); a person reads it with the new name.
  let shown=main;for(const told of ['저장하지 못한 작업이 있습니다. 먼저 Save project로 내보내주세요.','프로젝트 저장 실패'])shown=shown.split(told).join('');
  for(const old of ['Save project','Project files','프로젝트 파일','프로젝트 저장'])assert.ok(!shown.includes(old),'src/main.ts still shows '+old);
  assert.ok(!read('src/i18n.ts').includes('프로젝트'));
});

test('the palette offers Save a backup file, and its old name still finds it',()=>{
  const table=commandTable({hasSelection:false,canUndo:false,canRedo:false,approved:false,viewport:'desktop'});
  const save=table.find(c=>c.action==='save-project')!;
  assert.equal(save.en,'Save a backup file (.aphrodite.json)');
  assert.equal(save.ko,'백업 파일로 저장 (.aphrodite.json)');
  for(const [query,language] of [['backup','en'],['백업 파일','ko'],['Save project file','en'],['프로젝트 파일 저장','ko']] as const)
    assert.equal(filterCommands(table,query,language)[0]?.action,'save-project',query);
});
