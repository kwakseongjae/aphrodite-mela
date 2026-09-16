import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOps,opControl,opKinds,MAX_OPS,SELECTION,type Op} from '../src/agent/ops';

const ok=(payload:unknown)=>{const r=parseOps(payload);assert.ok(!('error' in r),`expected ops, got ${JSON.stringify(r)}`);return r as {ops:Op[];pageId?:string};};
const bad=(payload:unknown)=>{const r=parseOps(payload);assert.ok('error' in r,`expected an error, got ${JSON.stringify(r)}`);return (r as {error:string}).error;};

test('a batch of every operation parses into a typed list',()=>{
  const {ops,pageId}=ok({page_id:'page-1',ops:[
    {op:'add',component_kind:'hero',variant:'stacked',content:{title:'빛으로 완성하는 공간'}},
    {op:'update',block_id:SELECTION,fields:{label:'자세히 보기'}},
    {op:'move',block_id:'abc-1',direction:'up'},
    {op:'delete',block_id:'abc-2'},
    {op:'frame',preset:'mobile'},
  ]});
  assert.equal(pageId,'page-1');
  assert.deepEqual(ops.map(o=>o.op),['add','update','move','delete','frame']);
  assert.deepEqual(ops[0],{op:'add',component_kind:'hero',variant:'stacked',content:{title:'빛으로 완성하는 공간'}});
});

test('every op kind names a control a person could use',()=>{
  for(const kind of opKinds)assert.ok(opControl[kind]?.name,`${kind} has no control`);
  assert.equal(Object.keys(opControl).length,opKinds.length,'no mapping for an op that does not exist');
});

test('a missing ops list says what one looks like',()=>{
  assert.match(bad({}),/ops is required.*"op": "add"/s);
  assert.match(bad({ops:[]}),/empty/);
  assert.match(bad({ops:'add a hero'}),/ops is required/);
  assert.match(bad({ops:Array.from({length:MAX_OPS+1},()=>({op:'delete',block_id:'a'}))}),new RegExp(`${MAX_OPS} allowed`));
});

test('an unknown component kind lists the real ones and suggests the nearest',()=>{
  const error=bad({ops:[{op:'add',component_kind:'hero-large'}]});
  assert.match(error,/unknown ops\[0\]\.component_kind "hero-large"/);
  assert.match(error,/Valid values: frame, navigation, hero/);
  assert.match(error,/Closest match: "hero"/);
  assert.match(error,/aphrodite_list_components/);
});

test('a variant is checked against the kind that was asked for',()=>{
  assert.match(bad({ops:[{op:'add',component_kind:'hero',variant:'masonry'}]}),/unknown ops\[0\]\.variant "masonry".*split, image-left, stacked/s);
  ok({ops:[{op:'add',component_kind:'products',variant:'masonry'}]});
});

test('only fields the inspector can edit may be written',()=>{
  assert.match(bad({ops:[{op:'update',block_id:'a',fields:{provider:'mui'}}]}),/unknown ops\[0\]\.fields field "provider"/);
  assert.match(bad({ops:[{op:'update',block_id:'a',fields:{}}]}),/Name at least one of: title, text/);
  assert.match(bad({ops:[{op:'update',block_id:'a',fields:{title:42}}]}),/must be a string/);
  assert.match(bad({ops:[{op:'update',block_id:'a',fields:{title:'x'.repeat(5000)}}]}),/must be a string of at most/);
});

test('a block id is an id or the person\'s selection, never anything else',()=>{
  ok({ops:[{op:'update',block_id:SELECTION,fields:{title:'x'}}]});
  assert.match(bad({ops:[{op:'update',fields:{title:'x'}}]}),/block_id is required/);
  assert.match(bad({ops:[{op:'update',block_id:'../etc/passwd',fields:{title:'x'}}]}),/is not an id/);
  assert.match(bad({ops:[{op:'add',component_kind:'hero',before_block_id:SELECTION}]}),/must be a real block_id/);
});

test('move and frame take the values the UI offers',()=>{
  assert.match(bad({ops:[{op:'move',block_id:'a',direction:'sideways'}]}),/unknown ops\[1?0\]\.direction "sideways".*up, down/s);
  assert.match(bad({ops:[{op:'frame',preset:'watch'}]}),/unknown ops\[0\]\.preset "watch".*desktop, tablet, mobile/s);
  ok({ops:[{op:'frame',preset:'desktop',page_id:'page-1'}]});
});

test('an unknown operation is named with the ones that exist',()=>{
  assert.match(bad({ops:[{op:'duplicate',block_id:'a'}]}),/unknown ops\[0\]\.op "duplicate".*add, update, move, delete, frame/s);
  assert.match(bad({ops:[{op:'approve'}]}),/unknown ops\[0\]\.op "approve"/,'approval is not an operation');
  assert.match(bad({ops:['add a hero']}),/must be an object/);
});

test('the whole batch is refused when one op is wrong, so nothing half-applies',()=>{
  const error=bad({ops:[{op:'add',component_kind:'hero'},{op:'add',component_kind:'nope'}]});
  assert.match(error,/ops\[1\]/,'the error points at which one');
});

/* A model asked to restyle a component had to add a replacement and delete the original, because
   update only took copy. That throws away the block id and puts the person's words through a round
   trip for what is a change of layout. Found in evaluation run 4. */
test('update changes the layout as well as the words',()=>{
  const one=(op:Record<string,unknown>)=>parseOps({ops:[op]});
  const restyle=one({op:'update',block_id:'selection',variant:'editorial-wide'});
  assert.ok(!('error' in restyle),JSON.stringify(restyle));
  assert.deepEqual((restyle as {ops:unknown[]}).ops[0],{op:'update',block_id:'selection',fields:{},variant:'editorial-wide'});

  const both=one({op:'update',block_id:'selection',variant:'stacked',fields:{title:'빛으로 완성하는 공간'}});
  assert.deepEqual((both as {ops:unknown[]}).ops[0],{op:'update',block_id:'selection',fields:{title:'빛으로 완성하는 공간'},variant:'stacked'});

  // An update that would do nothing is a mistake worth naming rather than a silent no-op.
  const empty=one({op:'update',block_id:'selection'}) as {error:string};
  assert.match(empty.error,/changes nothing/);
  assert.match(empty.error,/variant/,'and it says what the other key is for');

  // The kind decides which names are legal, and only the app knows the kind, so parsing keeps the
  // string and the check happens where the block is.
  const anything=one({op:'update',block_id:'selection',variant:'not-a-real-variant'});
  assert.ok(!('error' in anything),'parsing does not guess the kind');
});

/* Adding a mobile frame took thirty-three turns and left a page called "Pointer lab", because the
   only page-making command an agent could reach was the palette's free-position sample, which it
   then had to empty out. Making a page is a thing the surface should be able to say. */
test('a page can be made and named without borrowing a sample',()=>{
  const one=(op:Record<string,unknown>)=>parseOps({ops:[op]});
  const made=one({op:'page',name:'Mobile',preset:'mobile'}) as {ops:unknown[]};
  assert.deepEqual(made.ops[0],{op:'page',name:'Mobile',preset:'mobile'});

  const plain=one({op:'page',name:'Assembly 2'}) as {ops:unknown[]};
  assert.deepEqual(plain.ops[0],{op:'page',name:'Assembly 2'},'a preset is optional');

  const id='11111111-1111-4111-8111-111111111111';
  const renamed=one({op:'page',page_id:id,name:'모바일'});
  assert.ok(!('error' in renamed),JSON.stringify(renamed));
  assert.deepEqual((renamed as {ops:unknown[]}).ops[0],{op:'page',name:'모바일',page_id:id});

  assert.match((one({op:'page',preset:'mobile'}) as {error:string}).error,/name is required/);
  assert.match((one({op:'page',name:'X',preset:'phone'}) as {error:string}).error,/unknown|preset/i);
  // Parsing only checks that an id is shaped like one; whether that page exists is the app's to
  // know, and it answers "no page <id>" rather than guessing here.
  assert.match((one({op:'page',name:'X',page_id:'has spaces'}) as {error:string}).error,/not an id/);
});

test('every op a batch can carry has a control a person could use',async()=>{
  const {opKinds,opControl}=await import('../src/agent/ops');
  for(const kind of opKinds){
    assert.ok(opControl[kind],`${kind} has no control`);
    assert.ok(opControl[kind].name.length,`${kind}'s control has no name`);
  }
});

/* "Make a mobile page and put a hero on it" put the hero back on the page it started from, because
   the batch fixed its target before running. A person who makes a frame lands inside it. */
test('a batch that makes a page carries on inside it',()=>{
  const parsed=parseOps({ops:[
    {op:'page',name:'Mobile',preset:'mobile'},
    {op:'add',component_kind:'hero',variant:'stacked'},
  ]});
  assert.ok(!('error' in parsed),JSON.stringify(parsed));
  const ops=(parsed as {ops:{op:string}[]}).ops;
  assert.deepEqual(ops.map(o=>o.op),['page','add'],'both survive parsing in order');
  // The move itself is the app's: runOp makes the page and applyOps retargets. What parsing must
  // guarantee is that the two arrive together in one batch, so one undo takes both back.
  assert.equal(ops.length,2);
});
