import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSpace,nextFramePosition,tidyFrames,moveFrame,zoomAt,screenToWorld,fitCamera,unionBox,stepZoom,sanitizeSpace,frameWidth,readCamera,writeCamera,type Space} from '../src/editor/space';

test('ensureSpace gives every page a frame in a row and drops frames of deleted pages',()=>{
  const project:{pages:{id:string}[];space?:Space}={pages:[{id:'a'},{id:'b'}],space:{frames:{zombie:{x:0,y:0,preset:'desktop'}}}};
  assert.equal(ensureSpace(project),true);
  assert.deepEqual(Object.keys(project.space!.frames),['a','b']);
  assert.equal(project.space!.frames.a.x,0);
  assert.equal(project.space!.frames.b.x,1440+160);
  assert.equal(ensureSpace(project),false,'stable on a second pass');
});

test('nextFramePosition lands right of the rightmost frame, on the top row',()=>{
  const space:Space={frames:{a:{x:0,y:200,preset:'mobile'},b:{x:-1000,y:40,preset:'desktop'}}};
  const next=nextFramePosition(space,'custom',900);
  assert.deepEqual(next,{x:440+160,y:40,preset:'custom',width:900});
  assert.equal(frameWidth(next),900);
});

test('tidyFrames lines frames up in page order and keeps unknown frames',()=>{
  const space:Space={frames:{b:{x:99,y:99,preset:'mobile'},a:{x:5,y:5,preset:'desktop'},extra:{x:1,y:1,preset:'tablet'}}};
  const tidy=tidyFrames(space,['a','b']);
  assert.deepEqual(tidy.frames.a,{x:0,y:0,preset:'desktop'});
  assert.deepEqual(tidy.frames.b,{x:1600,y:0,preset:'mobile'});
  assert.deepEqual(tidy.frames.extra,{x:1,y:1,preset:'tablet'});
});

test('moveFrame snaps to the grid and leaves unknown ids alone',()=>{
  const space:Space={frames:{a:{x:0,y:0,preset:'desktop'}}};
  assert.deepEqual(moveFrame(space,'a',13,-21).frames.a,{x:16,y:-24,preset:'desktop'});
  assert.equal(moveFrame(space,'nope',1,1),space);
});

test('zoomAt keeps the world point under the cursor fixed',()=>{
  const camera={x:100,y:50,zoom:1};
  const anchor={x:300,y:200};
  const before=screenToWorld(camera,anchor);
  const after=zoomAt(camera,anchor,2);
  assert.equal(after.zoom,2);
  assert.deepEqual(screenToWorld(after,anchor),before);
  assert.equal(zoomAt(camera,anchor,99).zoom,4,'clamped');
});

test('fitCamera centres the union of frames without enlarging past 100%',()=>{
  const box=unionBox([{x:0,y:0,width:1440,height:900},{x:1600,y:0,width:390,height:700}])!;
  assert.deepEqual(box,{x:0,y:0,width:1990,height:900});
  const cam=fitCamera(box,{width:1000,height:700},50);
  assert.ok(cam.zoom<1&&cam.zoom>0.4);
  const centre=screenToWorld(cam,{x:500,y:350});
  assert.ok(Math.abs(centre.x-995)<2&&Math.abs(centre.y-450)<2);
  assert.equal(fitCamera({x:0,y:0,width:200,height:100},{width:2000,height:2000}).zoom,1);
});

test('stepZoom walks the preset ladder',()=>{
  assert.equal(stepZoom(1,1),1.5);
  assert.equal(stepZoom(1,-1),0.75);
  assert.equal(stepZoom(0.8,1),1);
  assert.equal(stepZoom(4,1),4);
});

test('sanitizeSpace drops broken entries instead of throwing',()=>{
  const s=sanitizeSpace({frames:{ok:{x:10.4,y:2,preset:'tablet'},bad:{x:'a',y:0,preset:'desktop'},huge:{x:1e9,y:0,preset:'desktop'},custom:{x:0,y:0,preset:'custom',width:5000}}});
  assert.deepEqual(s,{frames:{ok:{x:10,y:2,preset:'tablet'}}});
  assert.equal(sanitizeSpace('nope'),undefined);
  assert.equal(sanitizeSpace({frames:[]}),undefined);
});

test('camera persists per project and rejects garbage',()=>{
  const store=new Map<string,string>();
  const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}};
  writeCamera(storage,'p1',{x:1,y:2,zoom:9});
  assert.deepEqual(readCamera(storage,'p1'),{x:1,y:2,zoom:4});
  assert.equal(readCamera(storage,'p2'),undefined);
  store.set('aphrodite-camera-v1:p3','{bad');
  assert.equal(readCamera(storage,'p3'),undefined);
});

test('parseProject keeps a valid space layout and drops a broken one',async()=>{
  const {parseProject,initialProject}=await import('../src/model');
  const p=initialProject() as {pages:{id:string}[];space?:Space};
  p.space={frames:{[p.pages[0].id]:{x:24,y:0,preset:'mobile'}}};
  const parsed=parseProject(JSON.stringify(p));
  assert.deepEqual(parsed.space,{frames:{[p.pages[0].id]:{x:24,y:0,preset:'mobile'}}});
  p.space={frames:{[p.pages[0].id]:{x:Number.NaN,y:0,preset:'mobile'}}};
  assert.deepEqual(parseProject(JSON.stringify(p)).space,{frames:{}});
});
