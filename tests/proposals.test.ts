import test from 'node:test';
import assert from 'node:assert/strict';
import {FRAME_GAP, frameWidth} from '../src/editor/space';
import {makeBlock, initialProject, type Page} from '../src/model';
import {
  PROPOSAL_ROW_OFFSET,
  discardProposals,
  placeProposals,
  proposalBadgeHtml,
  proposalsOf,
  resolveProposal,
} from '../src/agent/proposals';

function extraPage(id:string,name:string,title='Extra'):Page{
  const block=makeBlock('hero',true);
  block.title=title;
  return {id,name,blocks:[block]};
}

test('placeProposals stacks a row below the source with the same preset and spacing',()=>{
  const project=initialProject();
  const sourceId=project.pages[0].id;
  project.space={frames:{
    [sourceId]:{x:80,y:40,preset:'tablet'},
    leftover:{x:9,y:9,preset:'desktop'},
  }};
  project.pages.push({id:'about-page',name:'About',blocks:[]});
  const a=extraPage('prop-a','A','Alpha');
  const b=extraPage('prop-b','B','Beta');
  const ids=placeProposals(project,sourceId,[{page:a,label:'Split'},{page:b,label:'Stacked'}],'reference-direction');
  assert.deepEqual(ids,['prop-a','prop-b']);
  assert.equal(project.pages.length,4);
  const src=project.space!.frames[sourceId];
  const step=frameWidth(src)+FRAME_GAP;
  assert.deepEqual(project.space!.frames['prop-a'],{x:80,y:40+PROPOSAL_ROW_OFFSET,preset:'tablet'});
  assert.deepEqual(project.space!.frames['prop-b'],{x:80+step,y:40+PROPOSAL_ROW_OFFSET,preset:'tablet'});
  assert.equal(PROPOSAL_ROW_OFFSET,1400);
  assert.deepEqual(project.space!.frames[sourceId],{x:80,y:40,preset:'tablet'});
  assert.deepEqual(project.space!.frames.leftover,{x:9,y:9,preset:'desktop'},'must not tidy or drop unrelated frames');
  assert.equal(project.space!.frames['about-page'],undefined,'must not invent frames for other pages');
  const open=proposalsOf(project,sourceId);
  assert.equal(open.length,2);
  assert.deepEqual(open[0].proposal,{fromPageId:sourceId,label:'Split',kind:'reference-direction'});
  assert.deepEqual(open[1].proposal,{fromPageId:sourceId,label:'Stacked',kind:'reference-direction'});
  a.name='mutated';
  assert.equal(project.pages.find(p=>p.id==='prop-a')!.name,'A');
});

test('placeProposals treats a missing source frame as desktop at the origin',()=>{
  const project=initialProject();
  const sourceId=project.pages[0].id;
  const ids=placeProposals(project,sourceId,[{page:extraPage('p1','One'),label:'Vibe A'}],'vibe');
  assert.deepEqual(ids,['p1']);
  assert.deepEqual(project.space!.frames.p1,{x:0,y:PROPOSAL_ROW_OFFSET,preset:'desktop'});
});

test('placeProposals copies custom width and throws at the 30-page cap',()=>{
  const project=initialProject();
  const sourceId=project.pages[0].id;
  project.space={frames:{[sourceId]:{x:10,y:20,preset:'custom',width:800}}};
  placeProposals(project,sourceId,[{page:extraPage('wide','Wide'),label:'Wide'}],'agent');
  assert.deepEqual(project.space!.frames.wide,{x:10,y:20+PROPOSAL_ROW_OFFSET,preset:'custom',width:800});

  const capped=initialProject();
  for(let i=0;i<29;i++)capped.pages.push({id:`fill-${i}`,name:`Fill ${i}`,blocks:[]});
  assert.equal(capped.pages.length,30);
  const before=capped.pages.length;
  assert.throws(()=>placeProposals(capped,capped.pages[0].id,[{page:extraPage('over','Over'),label:'Nope'}],'agent'),{message:'Page limit'});
  assert.equal(capped.pages.length,before);

  const almost=initialProject();
  for(let i=0;i<28;i++)almost.pages.push({id:`n-${i}`,name:`N ${i}`,blocks:[]});
  assert.equal(almost.pages.length,29);
  assert.throws(()=>placeProposals(almost,almost.pages[0].id,[{page:extraPage('a','A'),label:'A'},{page:extraPage('b','B'),label:'B'}],'agent'),{message:'Page limit'});
  placeProposals(almost,almost.pages[0].id,[{page:extraPage('ok','Ok'),label:'Ok'}],'agent');
  assert.equal(almost.pages.length,30);
});

test('resolveProposal replace copies blocks, drops siblings and their frames, and selects the source',()=>{
  const project=initialProject();
  const source=project.pages[0];
  const sourceId=source.id;
  const originalTitle=source.blocks[0].title;
  project.pages.push({id:'about-page',name:'About',blocks:[]});
  project.space={frames:{[sourceId]:{x:0,y:0,preset:'desktop'}}};
  placeProposals(project,sourceId,[
    {page:extraPage('pick','Pick','Chosen hero'),label:'Direction A'},
    {page:extraPage('skip','Skip','Other hero'),label:'Direction B'},
  ],'reference-direction');
  project.activePageId='skip';
  resolveProposal(project,'pick','replace');
  assert.equal(project.activePageId,sourceId);
  assert.equal(project.pages.find(p=>p.id===sourceId)!.blocks[0].title,'Chosen hero');
  assert.notEqual(originalTitle,'Chosen hero');
  assert.equal(project.pages.some(p=>p.id==='pick'||p.id==='skip'),false);
  assert.equal(project.space!.frames.pick,undefined);
  assert.equal(project.space!.frames.skip,undefined);
  assert.ok(project.space!.frames[sourceId]);
  assert.equal(project.pages.some(p=>p.id==='about-page'),true);
  assert.equal(proposalsOf(project,sourceId).length,0);
});

test('resolveProposal keep promotes the chosen page and repairs activePageId when a sibling was current',()=>{
  const project=initialProject();
  const sourceId=project.pages[0].id;
  const sourceName=project.pages[0].name;
  placeProposals(project,sourceId,[
    {page:extraPage('keep-me','Keep me','Keep'),label:'Quiet'},
    {page:extraPage('drop-me','Drop me','Drop'),label:'Loud'},
  ],'agent');
  project.activePageId='drop-me';
  resolveProposal(project,'keep-me','keep');
  const kept=project.pages.find(p=>p.id==='keep-me')!;
  assert.equal(kept.proposal,undefined);
  assert.equal(kept.name,`${sourceName} · Quiet`);
  assert.equal(project.pages.some(p=>p.id==='drop-me'),false);
  assert.equal(project.space!.frames['drop-me'],undefined);
  assert.ok(project.space!.frames['keep-me']);
  assert.equal(project.activePageId,sourceId);

  const again=initialProject();
  const from=again.pages[0].id;
  placeProposals(again,from,[{page:extraPage('stay','Stay','S'),label:'Mine'}],'vibe');
  again.activePageId='stay';
  resolveProposal(again,'stay','keep');
  assert.equal(again.activePageId,'stay');
  assert.equal(again.pages.find(p=>p.id==='stay')!.name,`${again.pages[0].name} · Mine`);
});

test('discardProposals removes every proposal of a source and repairs activePageId',()=>{
  const project=initialProject();
  const sourceId=project.pages[0].id;
  project.pages.push({id:'about-page',name:'About',blocks:[]});
  placeProposals(project,sourceId,[
    {page:extraPage('d1','D1'),label:'One'},
    {page:extraPage('d2','D2'),label:'Two'},
  ],'agent');
  project.activePageId='d2';
  assert.equal(discardProposals(project,sourceId),2);
  assert.equal(project.pages.some(p=>p.proposal),false);
  assert.equal(project.space!.frames.d1,undefined);
  assert.equal(project.space!.frames.d2,undefined);
  assert.equal(project.activePageId,sourceId);
  assert.equal(project.pages.some(p=>p.id==='about-page'),true);
  assert.equal(discardProposals(project,sourceId),0);
});

test('proposalBadgeHtml is empty for normal pages and escapes proposal labels',()=>{
  const project=initialProject();
  assert.equal(proposalBadgeHtml(project.pages[0],'en'),'');
  assert.equal(proposalBadgeHtml(project.pages[0],'ko'),'');
  const page=extraPage('badge','Badge');
  page.proposal={fromPageId:project.pages[0].id,label:'<script>x</script> & "y"',kind:'agent'};
  const ko=proposalBadgeHtml(page,'ko');
  const en=proposalBadgeHtml(page,'en');
  assert.equal(ko,`<span class="frame-proposal" data-proposal-kind="agent">제안 · &lt;script&gt;x&lt;/script&gt; &amp; &quot;y&quot;</span>`);
  assert.equal(en,`<span class="frame-proposal" data-proposal-kind="agent">Proposal · &lt;script&gt;x&lt;/script&gt; &amp; &quot;y&quot;</span>`);
  assert.doesNotMatch(ko,/<script>/);
  assert.doesNotMatch(en,/<script>/);
});
