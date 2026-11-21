import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,fingerprint,isApproved,parseProject,importDesignMarkdown,systems,canonicalSystem,type Project,type DesignSystem} from '../src/model';
import {importDesignGraph} from '../src/design/omd';
import {readLibrary,writeLibrary,withoutStaleApprovals,upsertProject,LIBRARY_KEY} from '../src/workspace/library';

/* Opus review 2026-11-22, M3: a design system came in as the file had it, and parseProject keeps a
   narrower shape (carried keys filtered, type roles in a set order). The fingerprint of the board on
   screen then differed from the one saved, so an approval was gone from disk the moment it was given.
   Every place that puts a system on a board takes it through canonicalSystem; this is the matrix. */
const graph={identity:{name:'Brand'},foundations:{tokens:{
  'Brand Blue':{$type:'color',$value:'#1144aa'},'link_hover':{$type:'color',$value:'#2255bb'},primary:{$type:'color',$value:'#223344'}}},
  typography_assets:{roles:[{id:'body',family:'Inter',size:'16',line_height:'1.5'},{id:'display',family:'Inter',size:'48',weight:'700'}]}};
function graphSystem(p:Project):DesignSystem{
  const read=importDesignGraph(graph);
  return {...p.system,id:'imported',name:'Brand',...(read.accent?{accent:read.accent}:{}),...read.tokens,...(read.type?{type:read.type}:{}),...(Object.keys(read.carried).length?{carried:read.carried}:{})} as DesignSystem;
}
const stable=(p:Project)=>fingerprint(p)===fingerprint(parseProject(JSON.stringify(p)));
const sources:Record<string,(p:Project)=>DesignSystem>={
  'a design-system graph (.json)':graphSystem,
  'a DESIGN.md':p=>importDesignMarkdown('# Brand\n\n- accent: #1144aa\n- background: #ffffff\n- foreground: #111111\n',  'brand.md',p.system),
  ...Object.fromEntries(systems.map(s=>[`the built-in ${s.id}`,()=>({...s})])),
};

test('a graph system put on a board as the file has it is not the shape parseProject keeps',()=>{
  const p=initialProject();p.system=graphSystem(p);
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
