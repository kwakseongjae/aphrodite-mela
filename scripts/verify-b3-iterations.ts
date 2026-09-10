import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {parseProject,currentPage,type Project} from '../src/model';
const root='lab/artifacts/b3-iteration/';
const names=['00-baseline','01-blue','02-mui','03-below-fold','04-verified'];
const projects=names.map(n=>parseProject(readFileSync(`${root}${n}/project.aphrodite.json`,'utf8')));
const [base,blue,mui,final]=projects;
assert.deepEqual(projects[4].pages,final.pages,'Renderer repair changed project pages');
assert.deepEqual(projects[4].system,final.system);
const verifiedHtml=readFileSync(`${root}04-verified/page-3.html`,'utf8');
assert.ok(verifiedHtml.includes('href="#block-c601029a-7cc0-4e80-97c1-3cf978565a64"'));
assert.deepEqual(base.pages,blue.pages,'Color iteration changed page structure/content');
assert.deepEqual({...base.system,accent:'#2255cc'},blue.system);
const original=currentPage(base).blocks;
for(const p of projects){
 assert.equal(p.id,base.id);assert.equal(p.activePageId,base.activePageId);
 for(const b of original)assert.deepEqual(currentPage(p).blocks.find(x=>x.id===b.id),b,'Original node changed');
 assert.deepEqual(p.pages.filter(x=>x.id!==p.activePageId),base.pages.filter(x=>x.id!==base.activePageId),'Other pages changed');
}
assert.equal(currentPage(mui).blocks.length,6);
const action=currentPage(mui).blocks.find(b=>b.kind==='button')!;
assert.equal(action.provider,'mui');assert.equal(action.title,'A little guidance. A better light.');assert.equal(action.label,'Book a consultation');
assert.deepEqual(currentPage(final).blocks.find(b=>b.id===action.id),action);
assert.deepEqual(currentPage(final).blocks.map(b=>b.kind),['navigation','hero','products','features','cta','button','footer']);
assert.equal(currentPage(final).blocks.find(b=>b.kind==='cta')?.title,'A room changes with the light.');
for(let i=0;i<projects.length;i++){
 const p:Project=projects[i],s=JSON.parse(readFileSync(`${root}${names[i]}/SCENE.json`,'utf8'));
 for(const page of p.pages){const scene=s.pages.find((x:{id:string})=>x.id===page.id);assert.ok(scene);
  assert.deepEqual(scene.nodes.map((x:{instanceId:string;parentId?:string})=>[x.instanceId,x.parentId??null]),page.blocks.map(b=>[b.id,b.parentId??null]));
 }
}
console.log('PASS: 5 actual exports; 5/5 original blocks and other pages unchanged; requested palette + two additions only; every SCENE identity/parent matches; final renderer repair preserves pages/tokens.');
