/**
 * Sentences the app shares with agents and saved files still say "project": the library's and the board reader's errors, the
 * desktop's, a design system's description. Agents read them word for word, so they stay; a person reads "board", so they are
 * said that way where a person sees them (0.3-L5 fix 1). Only these, whole, so a file name such as project.aphrodite.json is
 * never touched.
 */
const said:readonly [string,string][]=[
  ['프로젝트는 20MB 이하여야 합니다.','보드는 20MB 이하여야 합니다.'],
  ['지원하지 않는 프로젝트 형식입니다.','지원하지 않는 보드 형식입니다.'],
  ['프로젝트 참조가 올바르지 않습니다.','보드 참조가 올바르지 않습니다.'],
  ['프로젝트 메타데이터가 올바르지 않습니다.','보드 메타데이터가 올바르지 않습니다.'],
  ['프로젝트 보관함이 너무 큽니다.','보드 보관함이 너무 큽니다.'],
  ['프로젝트 보관함 형식을 읽지 못했습니다.','보드 보관함 형식을 읽지 못했습니다.'],
  ['프로젝트를 파일로 내보내주세요.','보드를 파일로 내보내주세요.'],
  ['중복 프로젝트 ID가 있습니다.','중복 보드 ID가 있습니다.'],
  ['최대 200개 프로젝트를 지원합니다.','최대 200개 보드를 지원합니다.'],
  ['the saved projects could come to','the saved boards could come to'],
  ['ask the person to export or remove a project.','ask the person to export or remove a board.'],
  ['With the files it names listed, this project would be','With the files it names listed, this board would be'],
  ['; a project holds at most','; a board holds at most'],
  ['Invalid project assembly shelf','Invalid board assembly shelf'],
  ['Project changed since preview. Create a new preview.','Board changed since preview. Create a new preview.'],
  ['Workspace exceeds 40MB; export large projects','Workspace exceeds 40MB; export large boards'],
  ['Save a project first','Save a board first'],
  ['Unknown project','Unknown board'],
  ['Project changed. Reopen the vault after saving.','Board changed. Reopen the vault after saving.'],
  ['Official React adapters + project tokens','Official React adapters + board tokens'],
  ['adapted with project-owned tokens','adapted with board-owned tokens'],
  ['Aphrodite original project preset.','Aphrodite original board preset.'],
  ['Other values retain prior project decisions.','Other values retain prior board decisions.'],
  ['Project-owned HTML/CSS','Board-owned HTML/CSS'],
];
/** A shared sentence as a person reads it. */
export function boardWords(text:string):string{
  for(const [shared,person] of said)text=text.split(shared).join(person);
  return text;
}
