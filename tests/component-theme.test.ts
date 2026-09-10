import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,makeBlock,parseProject,fingerprint} from '../src/model';
import {componentAccent,componentProject,validComponentTheme,supportsComponentTheme,primaryEffect} from '../src/design/component-theme';
import {sceneManifest} from '../src/components';
test('variant-aware primary effects expose neutral variants honestly',()=>{
 const b=makeBlock('button');assert.equal(primaryEffect(b),'fill');b.variant='outline';assert.equal(primaryEffect(b),'border');b.provider='shadcn';assert.equal(primaryEffect(b),'neutral');b.provider='mui';assert.equal(primaryEffect(b),'text-border');
});
test('per-button theme survives roundtrip and is independent of project colors',()=>{
 const p=initialProject(),b=makeBlock('button');b.provider='shadcn';p.pages[0].blocks=[b];p.approvedFingerprint=fingerprint(p);
 b.theme={mode:'custom',accent:'#2255cc'};const q=parseProject(JSON.stringify(p));assert.deepEqual(q.pages[0].blocks[0].theme,b.theme);assert.notEqual(fingerprint(p),p.approvedFingerprint);
 const before=JSON.stringify(p);assert.equal(componentProject(b,p).system.accent,'#2255cc');assert.equal(JSON.stringify(p),before);
 assert.equal(sceneManifest(p).componentThemes[0].resolvedAccent,'#2255cc');assert.deepEqual(sceneManifest(p).pages[0].nodes[0].theme,b.theme);
 p.system.accent='#00aa00';assert.equal(componentAccent(b,p.system.accent),'#2255cc');
 b.theme={mode:'source'};assert.equal(componentAccent(b,p.system.accent),'#18181b');
 b.theme={mode:'project'};assert.equal(componentAccent(b,p.system.accent),'#00aa00');
});
test('unsupported provider, malformed mode and injected CSS reject',()=>{
 const p=initialProject(),b=makeBlock('button');p.pages[0].blocks=[b];
 for(const value of [{mode:'custom',accent:'red;display:none'},{mode:'source',accent:'#000000'},{mode:'unknown'},null])assert.equal(validComponentTheme(value,b),false);
 b.provider='seed';assert.equal(supportsComponentTheme(b),false);b.theme={mode:'custom',accent:'#2255cc'};assert.throws(()=>parseProject(JSON.stringify(p)),/theme/);
});
