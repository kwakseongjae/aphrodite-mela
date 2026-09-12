import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localRef,parseLocalRef,isLocalRef,localRefsIn,extensionFor,dataUrl,cacheLocal,cachedLocal,forgetLocal,readableImages,isWide} from '../src/design/local-images';
import {safeImage} from '../src/model';

const id='0123456789abcdef';

test('a local reference round-trips and anything malformed is refused',()=>{
  assert.equal(localRef(id),'local:0123456789abcdef');
  assert.equal(parseLocalRef(localRef(id)),id);
  assert.equal(isLocalRef(localRef(id)),true);
  for(const bad of ['local:','local:XYZ','local:0123','local:0123456789abcdeff','local:../../etc','/assets/x.webp','',' local:0123456789abcdef']){
    assert.equal(isLocalRef(bad),false,bad);
    assert.equal(parseLocalRef(bad),'',bad);
  }
});

test('safeImage accepts a local reference and still refuses a path or url',()=>{
  assert.equal(safeImage(localRef(id)),localRef(id));
  assert.equal(safeImage('local:nope'),'');
  assert.equal(safeImage('file:///etc/passwd'),'');
  assert.equal(safeImage('https://example.com/a.png'),'');
});

test('every local reference a project uses is collected once, in order',()=>{
  const other='fedcba9876543210';
  const project={pages:[{blocks:[{image:localRef(id)},{itemImages:[localRef(id),localRef(other)]},{image:'/assets/samples/phone-desk.webp'}]},{blocks:[{image:localRef(other)}]}],reference:localRef('aaaabbbbccccdddd')};
  assert.deepEqual(localRefsIn(project),[id,other,'aaaabbbbccccdddd']);
  assert.deepEqual(localRefsIn({pages:[{blocks:[]}]}),[]);
});

test('mime helpers and the session cache behave',()=>{
  assert.equal(extensionFor('image/png'),'png');
  assert.equal(extensionFor('image/jpeg'),'jpg');
  assert.equal(extensionFor('image/webp'),'webp');
  assert.equal(dataUrl('image/png','AAA'),'data:image/png;base64,AAA');
  forgetLocal();
  assert.equal(cachedLocal(id),undefined);
  cacheLocal(id,'data:image/png;base64,AAA');
  assert.equal(cachedLocal(id),'data:image/png;base64,AAA');
  forgetLocal(id);
  assert.equal(cachedLocal(id),undefined);
});

test('the library listing drops unreadable entries and reports orientation',()=>{
  const wide={id,name:'a.png',bytes:10,mime:'image/png',width:1600,height:900,modified:2};
  const square={id:'1111111111111111',name:'b.webp',bytes:10,mime:'image/webp',width:800,height:800,modified:1};
  const junk={id:'2222222222222222',name:'c.txt',bytes:10,mime:'text/plain',width:0,height:0,modified:3};
  const empty={id:'3333333333333333',name:'d.png',bytes:0,mime:'image/png',width:10,height:10,modified:4};
  assert.deepEqual(readableImages({dir:'/x',images:[wide,square,junk,empty]}).map(i=>i.name),['a.png','b.webp']);
  assert.equal(readableImages(undefined).length,0);
  assert.equal(isWide(wide),true);
  assert.equal(isWide(square),false);
  assert.equal(isWide({...square,width:0,height:0}),false,'unknown size is not wide');
});
