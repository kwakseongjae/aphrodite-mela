import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {sampleImages,sampleCategories,sampleSrc,isSampleSrc,samplesIn} from '../src/design/sample-images';
import {safeImage} from '../src/model';

test('the sample set is complete, unique and covers every category',()=>{
  assert.equal(sampleImages.length,50);
  assert.equal(new Set(sampleImages.map(s=>s.id)).size,50,'ids are unique');
  for(const c of sampleCategories)assert.ok(samplesIn(c.id).length>0,`${c.id} has photos`);
  assert.equal(samplesIn('all').length,50);
  assert.ok(sampleImages.every(s=>sampleCategories.some(c=>c.id===s.category)),'no orphan category');
  assert.ok(sampleImages.every(s=>/^[a-z0-9-]+$/.test(s.id)),'ids are url safe');
  assert.ok(sampleImages.every(s=>s.en.trim()&&s.ko.trim()),'both languages labelled');
});

test('sample paths are recognised and anything else is refused',()=>{
  const first=sampleImages[0];
  assert.equal(sampleSrc(first.id),`/assets/samples/${first.id}.webp`);
  assert.equal(isSampleSrc(sampleSrc(first.id)),true);
  assert.equal(isSampleSrc('/assets/samples/not-a-real-id.webp'),false);
  assert.equal(isSampleSrc('/assets/samples/../../etc/passwd.webp'),false);
  assert.equal(isSampleSrc('https://example.com/x.webp'),false);
  assert.equal(isSampleSrc(''),false);
});

test('safeImage accepts bundled samples and still rejects foreign urls',()=>{
  const src=sampleSrc(sampleImages[0].id);
  assert.equal(safeImage(src),src);
  assert.equal(safeImage('/assets/interior.jpg'),'/assets/interior.jpg');
  assert.equal(safeImage('/assets/samples/nope.webp'),'');
  assert.equal(safeImage('https://example.com/a.png'),'');
  assert.equal(safeImage('javascript:alert(1)'),'');
});

test('every catalogued sample has a file on disk',()=>{
  const missing=sampleImages.filter(s=>!existsSync(new URL(`../public/assets/samples/${s.id}.webp`,import.meta.url))).map(s=>s.id);
  assert.deepEqual(missing,[],'generate the missing photos before shipping');
});
