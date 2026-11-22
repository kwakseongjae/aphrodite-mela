import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,fingerprint,isApproved,parseProject,importDesignMarkdown,systems,canonicalSystem,type Project,type DesignSystem} from '../src/model';
import {importDesignGraph,graphSystem,importSummary} from '../src/design/omd';
import {readLibrary,writeLibrary,withoutStaleApprovals,upsertProject,LIBRARY_KEY} from '../src/workspace/library';

/* Opus review 2026-11-22, M3: a design system came in as the file had it, and parseProject keeps a
   narrower shape (carried keys filtered, type roles in a set order). The fingerprint of the board on
   screen then differed from the one saved, so an approval was gone from disk the moment it was given.
   Every place that puts a system on a board takes it through canonicalSystem; this is the matrix. */
const graph={identity:{name:'Brand'},foundations:{tokens:{
  'Brand Blue':{$type:'color',$value:'#1144aa'},'link_hover':{$type:'color',$value:'#2255bb'},primary:{$type:'color',$value:'#223344'}}},
  typography_assets:{roles:[{id:'body',family:'Inter',size:'16',line_height:'1.5'},{id:'display',family:'Inter',size:'48',weight:'700'}]}};
function rawGraphSystem(p:Project):DesignSystem{
  const read=importDesignGraph(graph);
  return {...p.system,id:'imported',name:'Brand',...(read.accent?{accent:read.accent}:{}),...read.tokens,...(read.type?{type:read.type}:{}),...(Object.keys(read.carried).length?{carried:read.carried}:{})} as DesignSystem;
}
const stable=(p:Project)=>fingerprint(p)===fingerprint(parseProject(JSON.stringify(p)));
const sources:Record<string,(p:Project)=>DesignSystem>={
  'a design-system graph (.json), the way the app puts it on a board':p=>graphSystem(p,importDesignGraph(graph),'Brand','Imported').system,
  'a DESIGN.md':p=>importDesignMarkdown('# Brand\n\n- accent: #1144aa\n- background: #ffffff\n- foreground: #111111\n',  'brand.md',p.system),
  ...Object.fromEntries(systems.map(s=>[`the built-in ${s.id}`,()=>({...s})])),
};

test('a graph system put on a board as the file has it is not the shape parseProject keeps',()=>{
  const p=initialProject();p.system=rawGraphSystem(p);
  assert.equal(stable(p),false,'this is the drift canonicalSystem exists for');
});

for(const [name,source] of Object.entries(sources)){
  test(`a board given ${name} through canonicalSystem keeps its approval through storage`,()=>{
    const p=initialProject();p.system=canonicalSystem(p,source(p));
    assert.equal(stable(p),true,'the fingerprint on screen is the fingerprint saved');
    p.approvedFingerprint=fingerprint(p);
    const store={values:new Map<string,string>(),getItem(k:string){return this.values.get(k)??null;},setItem(k:string,v:string){this.values.set(k,v);}};
    writeLibrary(store,withoutStaleApprovals(upsertProject({version:1,entries:[]},p)));
    assert.equal(isApproved(parseProject(JSON.stringify(readLibrary(store).entries[0].project))),true,'approved, saved and opened again');
    assert.ok(store.values.get(LIBRARY_KEY));
  });
}

/* Codex 2026-11-22 (check 3): the toast counted the tokens the file had, not what the board kept. */
test('the graph import counts what the board kept, and says how many names it could not keep',()=>{
  const p=initialProject();
  const read=importDesignGraph(graph);
  const put=graphSystem(p,read,'Brand','Imported');
  const kept=Object.keys(put.system.carried??{}).filter(k=>k in read.carried).length;
  assert.equal(put.report.carried,kept);
  assert.equal(put.report.dropped,read.report.carried-kept);
  assert.ok(put.report.dropped>0,'Brand Blue and link_hover are names a project cannot store');
  assert.match(importSummary(put.report,false),new RegExp(`${put.report.dropped} had names a project cannot store`));
  assert.equal(stable({...p,system:put.system}),true);
});

/* Codex 2026-11-22 (check 4): colours past the 200 a board carries, and names that read the same, were lost unsaid. */
test('the graph import counts colours past the cap and colliding names among those it could not keep',()=>{
  const tokens:Record<string,unknown>={primary:{$type:'color',$value:'#223344'}};
  for(let i=0;i<201;i++)tokens[`brand-${i}`]={$type:'color',$value:'#'+(0x100000+i).toString(16)};
  tokens['Brand-0']={$type:'color',$value:'#abcdef'};
  const p=initialProject();
  const read=importDesignGraph({foundations:{tokens}});
  const put=graphSystem(p,read,'Big','Imported');
  assert.equal(put.report.read,read.report.read);
  assert.equal(put.report.painted+put.report.carried+put.report.skipped+put.report.dropped,put.report.read,'every token read is accounted for');
  assert.ok(put.report.dropped>=2,'at least the one past the cap and the colliding name');
});
