import test from 'node:test';
import assert from 'node:assert/strict';
import {implementations,explorerBlock,parseCatalogChoice,catalogGroup} from '../src/design/component-explorer';
import {nativeLibraryDocument} from '../src/design/native-library';
test('catalog drag payload validates exact supported implementation and strips unrelated fields',()=>{
 const c={kind:'button',provider:'seed',variant:'outline'};
 assert.deepEqual(parseCatalogChoice(JSON.stringify({...c,parentId:'injected'})),c);
 for(const raw of ['null','{}','broken',JSON.stringify({...c,provider:'unknown'}),JSON.stringify({...c,kind:'hero'}),JSON.stringify({...c,variant:'bad'})])assert.equal(parseCatalogChoice(raw),null);
 const b=explorerBlock('button',c.provider,c.variant);assert.equal(b.provider,'seed');assert.equal(b.variant,'outline');
 assert.equal(catalogGroup('frame'),'Layout');assert.equal(catalogGroup('hero'),'Layout');assert.equal(catalogGroup('button'),'Input');
});
test('native runtime replaces only marked executable script, retaining props and CSS',()=>{
 const doc='<style>x</style><div data-props="{}"></div><script>/*RUNTIME_START*/run();/*RUNTIME_END*/</script>';
 assert.equal(nativeLibraryDocument(doc,'tauri://localhost/assets/library-runtime.js'),'<style>x</style><div data-props="{}"></div><script src="tauri://localhost/assets/library-runtime.js"></script>');
});
test('kind-first inventory exposes only actual provider support',()=>{
 assert.deepEqual(implementations('button').map(x=>x.provider),['own','mui','astryx','seed','shadcn']);
 assert.deepEqual(implementations('input').map(x=>x.provider),['own','mui']);
 assert.deepEqual(implementations('hero').map(x=>x.provider),['own']);
 assert.equal(implementations('button').find(x=>x.provider==='seed')?.theme,'native');
});
test('explicit catalog choice retains provider/variant independent of project DS',()=>{
 const b=explorerBlock('button','shadcn','outline');assert.equal(b.provider,'shadcn');assert.equal(b.variant,'outline');
 assert.throws(()=>explorerBlock('hero','mui','split'),/Unsupported/);
 assert.throws(()=>explorerBlock('button','mui','made-up'),/Unsupported/);
 assert.notEqual(explorerBlock('button','mui','outline').id,explorerBlock('button','mui','outline').id);
});
