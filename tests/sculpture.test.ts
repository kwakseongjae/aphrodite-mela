import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {sculptureStates,sculptureImage,sculptureHtml,sculptureAssetRoot} from '../src/design/sculpture';

test('every state has a real square RGBA Blender render and atlas coordinates',()=>{
  const manifest=JSON.parse(readFileSync(`public${sculptureAssetRoot}/manifest.json`,'utf8'));
  assert.equal(manifest.version,2);
  assert.deepEqual(manifest.sunglassesStates,['get-vibe','success']);
  assert.match(manifest.generator,/^Blender /);
  assert.equal(manifest.default,'idle');
  assert.equal(sculptureStates.length,8);
  for(const [i,[state]] of sculptureStates.entries()){
    const png=readFileSync(`public${sculptureImage(state)}`);
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
    assert.equal(png[25],6); // RGBA, not a painted checkerboard.
    assert.equal(manifest.states[state].x,(i%4)*512);
    assert.equal(manifest.states[state].y,Math.floor(i/4)*512);
  }
  assert.ok(existsSync(`public${sculptureAssetRoot}/atlas.png`));
});
test('decorative render leaves explicit review text available and escapes labels',()=>{
  const html=sculptureHtml('awaiting-review','승인 대기 <script>');
  assert.match(html,/alt=""/);assert.match(html,/승인 대기 &lt;script&gt;/);
  assert.doesNotMatch(html,/<script>|autoplay|animation:/);
});
test('classic and vibe GLBs are self-contained and sunglasses are opt-in',()=>{
  for(const variant of ['classic','vibe']){
    const bytes=readFileSync(`lab/sculpture/models-v2/aphrodite-${variant}-v2.glb`);
    assert.equal(bytes.subarray(0,4).toString(),'glTF');assert.equal(bytes.readUInt32LE(4),2);
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    const names=gltf.nodes.map((n:{name?:string})=>n.name||'');
    assert.equal(names.some((n:string)=>n.startsWith('Smoke lens')),variant==='vibe');
    for(const resource of [...(gltf.buffers||[]),...(gltf.images||[])]) assert.equal(resource.uri,undefined);
    assert.equal((gltf.animations||[]).length,0);
  }
});
