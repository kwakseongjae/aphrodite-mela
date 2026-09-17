import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitWithin,worthShrinking,base64Of,POSTER_EDGE} from '../src/design/downscale';

test('a picture smaller than the cap is left exactly as it is',()=>{
  assert.deepEqual(fitWithin(800,600),{width:800,height:600});
  assert.deepEqual(fitWithin(POSTER_EDGE,POSTER_EDGE),{width:POSTER_EDGE,height:POSTER_EDGE});
});

test('the long edge is what gets capped, whichever side it is',()=>{
  assert.deepEqual(fitWithin(4000,3000),{width:1600,height:1200});
  assert.deepEqual(fitWithin(3000,4000),{width:1200,height:1600});
});

/* A 4000×3 panorama is still three pixels tall; rounding a side to zero would draw nothing. */
test('no side is ever rounded away to nothing',()=>{
  const out=fitWithin(4000,3);
  assert.equal(out.width,1600);
  assert.ok(out.height>=1,`a side of ${out.height} draws an empty canvas`);
});

test('nonsense dimensions do not become a canvas',()=>{
  assert.deepEqual(fitWithin(0,0),{width:0,height:0});
  assert.deepEqual(fitWithin(NaN,10),{width:0,height:0});
});

test('a small file is passed through rather than re-encoded',()=>{
  assert.equal(worthShrinking(200_000,900,600),false);
  assert.equal(worthShrinking(200_000,2400,600),true,'too wide');
  assert.equal(worthShrinking(4_000_000,900,600),true,'too heavy even though it fits');
});

test('the data url head is stripped, and a bare payload survives',()=>{
  assert.equal(base64Of('data:image/jpeg;base64,AAAA'),'AAAA');
  assert.equal(base64Of('AAAA'),'AAAA');
});
