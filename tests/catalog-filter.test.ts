import test from 'node:test';
import assert from 'node:assert/strict';
import {filteredKinds,normalizeCatalogFilter} from '../src/design/catalog-filter';
import {catalogView} from '../src/design/catalog-view';
import {initialProject} from '../src/model';
test('catalog filters intersect supported provider, category and bilingual words',()=>{
 const muiKinds=filteredKinds('All',{query:'',provider:'mui'}).map(c=>c.kind);
 assert.ok(muiKinds.includes('button')&&muiKinds.includes('input')&&muiKinds.includes('cards'));
 assert.ok(!muiKinds.includes('hero'));
 assert.deepEqual(filteredKinds('All',{query:'입력',provider:'mui'}).map(c=>c.kind),['input','textarea']);
 assert.deepEqual(filteredKinds('Layout',{query:'',provider:'mui'}),[]);
 assert.deepEqual(filteredKinds('All',{query:'button mui',provider:'mui'}).map(c=>c.kind),['button']);
 assert.equal(normalizeCatalogFilter('x'.repeat(110),'bad').query.length,100);
 assert.equal(normalizeCatalogFilter('','bad').provider,'all');
});
test('empty and filtered catalog do not construct unavailable previews or mutate project',()=>{
 const p=initialProject(),before=JSON.stringify(p),seen:string[]=[];
 const view=(group:string,query:string,provider:string)=>catalogView(p,'button','solid',group,en=>en,c=>{seen.push(c.provider);return 'preview';},{query,provider});
 assert.match(view('Layout','','mui'),/No matching components/);assert.equal(seen.length,0);
 view('All','','mui');assert.deepEqual(seen,['mui']);assert.equal(JSON.stringify(p),before);
 assert.match(view('All','<img>','all'),/value="&lt;img&gt;"/);
});
