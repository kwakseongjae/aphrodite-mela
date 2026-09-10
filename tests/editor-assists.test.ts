import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestGuide,edgeVelocity} from '../src/editor/assists';
test('snap picks nearest edge or center within six screen pixels',()=>{
 assert.deepEqual(nearestGuide([100,150,200],[204,153]),{delta:3,guide:153});
 assert.deepEqual(nearestGuide([100],[107]),{delta:0});
 assert.deepEqual(nearestGuide([100],[94]),{delta:-6,guide:94});
 assert.deepEqual(nearestGuide([], [100]),{delta:0});
 for(const scale of [.7,.85,1,1.25])assert.equal(nearestGuide([100*scale],[100*scale+5]).delta/scale,5/scale);
});
test('auto scroll is bounded, bidirectional and off outside viewport or in center',()=>{
 assert.equal(edgeVelocity(0,0,300),-420);assert.equal(edgeVelocity(300,0,300),420);
 for(const p of [-1,100,150,301])assert.equal(edgeVelocity(p,0,300),0);
 assert.equal(edgeVelocity(20,0,300),-210);assert.equal(edgeVelocity(280,0,300),210);
 assert.equal(edgeVelocity(0,0,0),0);
});
