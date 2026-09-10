import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,parseProject,fingerprint,makeBlock} from '../src/model';
import {pinShelf,preserveShelf,validShelf,shelfPage,SHELF_PAGE_SIZE} from '../src/design/shelf';
test('shelf roundtrips per project without changing approved composition',()=>{
 const a=initialProject(),b=initialProject(),before=fingerprint(a);const c={kind:'button' as const,provider:'mui',variant:'outline'};
 assert.equal(pinShelf(a,c),'added');assert.equal(pinShelf(a,c),'duplicate');assert.equal(a.shelf?.length,1);assert.equal(b.shelf,undefined);
 assert.equal(fingerprint(a),before);assert.deepEqual(parseProject(JSON.stringify(a)).shelf,[c]);assert.equal(parseProject(JSON.stringify(b)).shelf,undefined);
});
test('canvas history preserves current shelf including removals',()=>{
 const p=initialProject(),snapshot=JSON.stringify(p);pinShelf(p,{kind:'button',provider:'shadcn',variant:'solid'});p.pages[0].blocks.push(makeBlock('button'));
 const restored=preserveShelf(parseProject(snapshot),p);assert.deepEqual(restored.shelf,p.shelf);assert.notEqual(restored.shelf,p.shelf);
 p.shelf=[];assert.deepEqual(preserveShelf(restored,p).shelf,[]);assert.throws(()=>preserveShelf(initialProject(),p),/another project/);
});
test('shelf rejects malformed imports, unknown fields, duplicates and overflow',()=>{
 const c={kind:'button',provider:'mui',variant:'solid'},p=initialProject();
 for(const value of [null,{},[null],[{...c,provider:'bad'}],[{...c,theme:{mode:'custom'}}],[c,c],Array(13).fill(c)]){assert.equal(validShelf(value),false);assert.throws(()=>parseProject(JSON.stringify({...p,shelf:value})),/shelf/);}
 for(const provider of ['own','mui','astryx','seed'])for(const variant of ['solid','outline','ghost'])assert.equal(pinShelf(p,{kind:'button',provider,variant}),'added');
 assert.equal(pinShelf(p,{kind:'button',provider:'shadcn',variant:'solid'}),'full');assert.equal(p.shelf?.length,12);
});
test('full shelf bounds live previews and retains exact indices across pages',()=>{
 const p=initialProject();for(const provider of ['own','mui','astryx','seed'])for(const variant of ['solid','outline','ghost'])pinShelf(p,{kind:'button',provider,variant});
 const all=[0,1,2].flatMap(page=>{const slice=shelfPage(p.shelf!,page);assert.equal(slice.items.length,SHELF_PAGE_SIZE);assert.equal(slice.pages,3);return slice.items;});
 assert.deepEqual(all.map(x=>x.choice),p.shelf);assert.deepEqual(all.map(x=>x.index),Array.from({length:12},(_,i)=>i));
 assert.equal(shelfPage(p.shelf!,99).page,2);assert.equal(shelfPage(p.shelf!,-1).page,0);assert.equal(shelfPage([],2).pages,1);assert.equal(shelfPage([],NaN).page,0);
 assert.equal(shelfPage(p.shelf!.slice(0,8),2).page,1);
});
