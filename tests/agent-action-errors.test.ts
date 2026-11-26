import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newBoard} from '../src/editor/starter';
import {personAt} from '../src/agent/dispatch';
import {boardWords} from '../src/workspace/board-words';
import {editorActions,editorCalls} from './support/editor-calls';

const read=(f:string)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

/*
 * 0.3-L5 fix 2 (#16): what an action throws reaches an agent word for word through actViaButton, so it says what main (6dfad55)
 * said; a person reads it through the notice, which says board. Each row: the sentence as main throws it, and as a person reads it.
 */
const thrown:[string,string,string][]=[
  ['src/main.ts','프로젝트를 찾지 못했습니다.','보드를 찾지 못했습니다.'],
  ['src/main.ts','There is work that could not be saved. Save the project to a file first.','There is work that could not be saved. Keep it with Save a backup file first.'],
  ['src/main.ts','저장하지 못한 작업이 있습니다. 먼저 Save project로 내보내주세요.','저장하지 못한 작업이 있습니다. 먼저 "백업 파일로 저장"으로 보드를 파일로 남겨 주세요.'],
  ['src/main.ts','Projects kept arriving in this workspace while it was being deleted, so it stays. Try again.','Boards kept arriving in this workspace while it was being deleted, so it stays. Try again.'],
  ['src/main.ts','지우는 동안 이 작업 공간에 프로젝트가 계속 들어와 그대로 둡니다. 다시 해 주세요.','지우는 동안 이 작업 공간에 보드가 계속 들어와 그대로 둡니다. 다시 해 주세요.'],
  ['src/main.ts','Project changed. Select the reference again.','Board changed. Select the reference again.'],
  ['src/main.ts','미리보기 이후 프로젝트가 바뀌었습니다. 다시 Preview하세요.','미리보기 이후 보드가 바뀌었습니다. 다시 Preview하세요.'],
  ['src/main.ts','프로젝트는 20MB 이하여야 합니다.','보드는 20MB 이하여야 합니다.'],
  ['src/main.ts',"'프로젝트 저장 실패'","'보드 저장 실패'"],
  ['src/reference.ts','브라우저에서는 색상·텍스처만 분석합니다. 문구는 프로젝트 설명에서 가져옵니다.','브라우저에서는 색상·텍스처만 분석합니다. 문구는 보드 설명에서 가져옵니다.'],
  ['src/reference.ts','읽을 수 있는 문구가 없습니다. 프로젝트 설명을 사용합니다.','읽을 수 있는 문구가 없습니다. 보드 설명을 사용합니다.'],
];

test('what an action throws says what main said, and a person reads it as board',()=>{
  for(const [file,shared,person] of thrown){
    assert.ok(read(file).includes(shared),file+' says as main did: '+shared);
    assert.equal(boardWords(shared),person);
  }
  // Interpolated: the phrase around the error and the workspace name.
  const main=read('src/main.ts');
  assert.ok(main.includes(' Its projects could not be put back; they are in ')&&main.includes(' 프로젝트를 되돌리지 못했습니다. '));
  assert.equal(boardWords('Disk full. Its projects could not be put back; they are in Studio.'),'Disk full. Its boards could not be put back; they are in Studio.');
  assert.match(main,/esc\(boardWords\(a\.warning\)\)/,'the reference analysis note a person reads');
});

test('an agent pressing Apply after the board changed is told what main told it',async()=>{
  const project=newBoard('Vibe'),screen={...editorActions(project),vibePending:undefined,fingerprint:()=>'x'};
  editorCalls(['async function action('],screen);
  const {action}=screen as typeof screen & {action:Function};
  await assert.rejects(action({dataset:{action:'apply-vibe'}},personAt({isTrusted:true}),false),{message:'미리보기 이후 프로젝트가 바뀌었습니다. 다시 Preview하세요.'});
});