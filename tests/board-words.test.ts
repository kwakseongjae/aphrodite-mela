import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardWords} from '../src/workspace/board-words';

const read=(f:string)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

/* 0.3-L5 fix 1 #9, #11: what agents and saved files read stays word for word; a person reads "board" where it is shown. */
test('the sentences agents read still say project, word for word, and a person reads board',()=>{
  const shared:[string,string][]=[
    ['src/workspace/library.ts','the saved projects could come to'],['src/workspace/library.ts','ask the person to export or remove a project.'],
    ['src/workspace/library.ts','프로젝트 메타데이터가 올바르지 않습니다.'],['src/workspace/library.ts','최대 200개 프로젝트를 지원합니다.'],
    ['src/workspace/library.ts','With the files it names listed, this project would be'],['src/model.ts','지원하지 않는 프로젝트 형식입니다.'],
    ['src/model.ts','프로젝트는 20MB 이하여야 합니다.'],['src/model.ts','Invalid project assembly shelf'],['src/model.ts','Official React adapters + project tokens'],
    ['src/design/theme-proposal.ts','Project changed since preview. Create a new preview.'],['src/providers.ts','Project-owned HTML/CSS'],
    ['src-tauri/src/workspace.rs','Workspace exceeds 40MB; export large projects'],['src-tauri/src/vault.rs','Project changed. Reopen the vault after saving.'],
  ];
  for(const [file,sentence] of shared){
    assert.ok(read(file).includes(sentence),file+' still says: '+sentence);
    const person=boardWords(sentence);
    assert.doesNotMatch(person,/[Pp]roject|프로젝트/,'a person reads: '+person);
  }
  assert.equal(boardWords('Saved project.aphrodite.json'),'Saved project.aphrodite.json','a file name stays');
  const main=read('src/main.ts');
  assert.match(main,/function notice\(message:string\)\{toasts=pushToast\(expireToasts\(toasts,Date\.now\(\)\),boardWords\(message\)/,'every notice and toast a person sees');
  assert.match(main,/esc\(boardWords\(providers\[b\.provider\?\?'own'\]\.source\)\)/,'the implementation note');
  assert.match(main,/boardWords\(s\.description\)/,'the design-system picker');
});

/* 0.3-L5 fix 2 (#11, #22): the not-saved strip and Home's warning say board too, and a short desktop error is only said as board when it is the whole message, so a name a person typed is never changed. */
test('the storage warnings say board, and a name holding a shared phrase stays as typed',()=>{
  assert.equal(boardWords('Unknown project'),'Unknown board');
  assert.equal(boardWords('Save a project first'),'Save a board first');
  assert.equal(boardWords('Created the workspace Unknown project.'),'Created the workspace Unknown project.');
  assert.equal(boardWords('Workspace exceeds 40MB; export large projects'),'Workspace exceeds 40MB; export large boards');
  const main=read('src/main.ts');
  // 0.3-G2b: the strip and Home's warning are one dialog now (src/ui/notices.ts), whose details say board the same way.
  assert.match(main,/detail:boardWords\(saveTrouble\)/,'the not-saved dialog');
  assert.match(main,/detail:boardWords\(startupError\)/,"Home's unread-store dialog");
});
