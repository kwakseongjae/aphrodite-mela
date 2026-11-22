import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject,makeBlock,uid,fingerprint,isApproved,parseProject,type Project} from '../src/model';
import {readLibrary,readDroppedApprovals,writeLibrary,withoutStaleApprovals,upsertProject,moveEntry,cloneProject,LIBRARY_KEY,type Library} from '../src/workspace/library';
import {sampleProject} from '../src/workspace/onboarding';

/* 0.2.5 drops a fingerprint the content does not match, when it reads and when it writes. That is only
   safe if an approval that holds survives every ordinary trip through storage, so each trip is here.
   The same matrix was run against v0.2.4's code on 2026-11-22 and gave the same answers. */
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAf/2Q==';
function memory(){const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};}
const fromText=(text:string)=>readLibrary({getItem:k=>k===LIBRARY_KEY?text:null,setItem:()=>{}});
/** What the app does: settle, write, read, and open the entry. */
function trip(library:Library,store=memory()){writeLibrary(store,withoutStaleApprovals(library));return {store,read:readLibrary(store)};}
const open=(library:Library)=>parseProject(JSON.stringify(library.entries[0].project));
const sortKeys=(v:unknown):unknown=>Array.isArray(v)?v.map(sortKeys):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys((v as Record<string,unknown>)[k])])):v;
function rich():Project{
  const p=initialProject(),page=p.pages[0];
  const button=makeBlock('button');button.provider='shadcn';button.theme={mode:'custom',accent:'#2255cc'};page.blocks.push(button);
  page.blocks.find(b=>b.kind==='hero')!.image=PNG;
  p.reference=JPEG;p.contentLanguage='ko';
  const proposal={id:uid(),name:'Proposal',blocks:[makeBlock('hero')],proposal:{fromPageId:page.id,label:'Bolder',kind:'agent' as const}};
  p.pages.push(proposal);
  p.space={frames:{[page.id]:{x:0,y:0,preset:'desktop'},[proposal.id]:{x:1300,y:0,preset:'mobile'}}};
  return p;
}
function blank():Project{const p=initialProject();p.name='Blank';p.brief='';p.pages[0].blocks=[];return p;}
const projects:Record<string,()=>Project>={'sample (en)':()=>sampleProject('en'),'sample (ko)':()=>sampleProject('ko'),blank,'themes, pictures, reference, language, proposal, mobile frame':rich};
function approved(make:()=>Project){const p=parseProject(JSON.stringify(make()));p.approvedFingerprint=fingerprint(p);assert.equal(isApproved(p),true);return p;}

for(const [name,make] of Object.entries(projects)){
  test(`an approved board stays approved through storage: ${name}`,()=>{
    const p=approved(make);
    const first=trip(upsertProject({version:1,entries:[]},p));
    const previous=first.store.values.get(LIBRARY_KEY)!;
    assert.equal(isApproved(open(first.read)),true,'saved and read back');
    const second=trip(upsertProject(first.read,open(first.read)),first.store);
    assert.equal(isApproved(open(second.read)),true,'saved and read back twice');
    assert.equal(isApproved(open(fromText(previous))),true,'the recovery copy');
    assert.equal(isApproved(open(trip(moveEntry(second.read,p.id,'ws-two')).read)),true,'moved to another workspace');
    assert.equal(isApproved(parseProject(JSON.stringify(p,null,2))),true,'a saved project file imported under its own id');
  });
}

test('the two imports that were drafts in v0.2.4 are drafts still',()=>{
  const p=approved(rich);
  assert.equal(isApproved(cloneProject(parseProject(JSON.stringify(p)))),false,'a file whose id is already here comes in as a copy, and a copy is not approved');
  // Vault snapshots are written by Rust, which sorts the keys; the fingerprint hashes them in order.
  assert.equal(isApproved(parseProject(JSON.stringify(sortKeys(p)))),false,'a board brought back from the Vault opens as a draft');
});

const STALE='Approved, then edited';
test('a library written by v0.2.4 keeps its approvals when 0.2.5 reads and saves it',()=>{
  const text=readFileSync(new URL('./fixtures/library-v0.2.4-approved.json',import.meta.url),'utf8');
  const read=fromText(text);
  assert.equal(read.entries.length,5);
  for(const entry of read.entries)if(entry.project.name!==STALE)assert.equal(isApproved(parseProject(JSON.stringify(entry.project))),true,entry.project.name);
  for(const entry of trip(read).read.entries)if(entry.project.name!==STALE)assert.equal(isApproved(parseProject(JSON.stringify(entry.project))),true,`${entry.project.name}, saved again`);
});

/* Codex 2026-11-22 (check 3): reading drops a stale fingerprint in memory while the store keeps it, and Files compares
   the two and refuses ("Project changed"). The app now writes the library once when reading dropped one. */
test('a v0.2.4 board edited after approval reads as a draft, and the library is written so Files sees the same board',()=>{
  const text=readFileSync(new URL('./fixtures/library-v0.2.4-approved.json',import.meta.url),'utf8');
  const read=fromText(text);
  const stale=read.entries.find(e=>e.project.name===STALE)!.project;
  assert.equal(stale.approvedFingerprint,undefined,'the stale fingerprint is gone in memory');
  const onDisk=(JSON.parse(text).entries as {project:Project}[]).find(e=>e.project.name===STALE)!.project;
  assert.notEqual(onDisk.approvedFingerprint,undefined,'and still in the stored text, which is what Files compared against');
  assert.equal(readDroppedApprovals(text,read),true,'so the read says the store needs writing');
  const store=memory();writeLibrary(store,withoutStaleApprovals(read));
  const written=(JSON.parse(store.values.get(LIBRARY_KEY)!).entries as {project:Project}[]).find(e=>e.project.name===STALE)!.project;
  assert.deepEqual(written,JSON.parse(JSON.stringify(stale)),'what is written is the board Files is sent');
  assert.equal(readDroppedApprovals(store.values.get(LIBRARY_KEY)!,fromText(store.values.get(LIBRARY_KEY)!)),false,'and once written there is nothing left to drop');
});

test('the last step before storage drops a stale fingerprint on its own',()=>{
  const p=approved(rich);p.pages[0].blocks[0].title='Changed after approval';
  const library:Library={version:1,entries:[{project:p,createdAt:'2026-11-22T00:00:00.000Z',updatedAt:'2026-11-22T00:00:00.000Z',pinned:false,archived:false}]};
  withoutStaleApprovals(library);
  assert.equal(library.entries[0].project.approvedFingerprint,undefined);
});

/* Codex 2026-11-22 (check 4): a project absent from the snapshot read was taken for one whose fingerprint was dropped. */
test('a project the read did not include is not a dropped fingerprint',()=>{
  const p=approved(rich);
  const stored=JSON.stringify({version:1,entries:[{project:{...p,approvedFingerprint:'stale:0:0'},createdAt:'2026-11-22T00:00:00.000Z',updatedAt:'2026-11-22T00:00:00.000Z',pinned:false,archived:false}]});
  assert.equal(readDroppedApprovals(stored,{version:1,entries:[]}),false);
});
