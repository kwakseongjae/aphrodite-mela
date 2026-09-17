/**
 * A record, not a gate.
 *
 * This reads a handoff ZIP that a person exported through the editor by hand in September and
 * asserts what was in it. It imports nothing from src/, so it would pass unchanged if the export
 * feature were deleted tomorrow — it proves what that build produced on that day, which is worth
 * keeping and is not coverage.
 *
 * Deliberately absent from package.json for that reason. Run it by hand when re-checking an old
 * artifact; do not add it to a release checklist expecting it to catch a regression.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';

// Checks the ZIP downloaded through actual editor UI, not a generated substitute.
const path=process.argv[2]??'lab/artifacts/pointer-editor/actual-ui-handoff.zip';
const files=unzipSync(fs.readFileSync(path));
const read=name=>{assert.ok(files[name],`Missing ${name}`);return strFromU8(files[name]);};
const project=JSON.parse(read('project.aphrodite.json'));
const pageIndex=project.pages.findIndex(p=>p.id===project.activePageId);
const page=project.pages[pageIndex];
assert.equal(page.name,'Pointer lab');
const card=page.blocks.find(b=>b.kind==='cards');
assert.ok(card);
assert.equal(page.blocks.find(b=>b.id===card.parentId)?.title,'Frame A');
assert.deepEqual(card.layout,{widthPx:240,height:220,x:19,y:63});
const scene=JSON.parse(read('SCENE.json'));
const node=scene.pages.find(p=>p.id===page.id).nodes.find(n=>n.instanceId===card.id);
assert.equal(node.parentId,card.parentId);
assert.deepEqual(node.layout,card.layout);
const htmlName=pageIndex===0?'index.html':`page-${pageIndex+1}.html`;
for(const name of [htmlName,`react-source/templates/${htmlName}`]){
  const html=read(name);
  assert.ok(html.includes(`data-node-id="${card.id}"`));
  assert.ok(html.includes('width:240px'));
  assert.ok(html.includes('height:220px'));
  assert.ok(html.includes('left:19px;top:63px'));
}
assert.ok(read('PROMPT.md').includes(htmlName));
console.log(`PASS: ${page.name}, Frame A, 240×220px at (19,63), scene + HTML + source template + prompt`);
