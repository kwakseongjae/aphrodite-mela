import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,fingerprint} from '../src/model';
import {catalogView} from '../src/design/catalog-view';
test('catalog has exact accessible provider choices without changing the project',()=>{
 const p=initialProject(),before=fingerprint(p),calls:string[]=[];
 const html=catalogView(p,'button','outline','Input',(en)=>en,c=>{calls.push(c.provider);return '<div>preview</div>';});
 assert.deepEqual(calls,['own','mui','astryx','seed','shadcn']);
 for(const provider of calls)for(const action of ['Inspect','Pin','Add'])assert.ok(html.includes(`aria-label="${action} ${provider} button outline"`));
 assert.ok(html.includes('Source palette'));assert.ok(html.includes('Project palette'));
 assert.ok(html.includes('aria-label="Component index"'));assert.ok(html.includes('data-shelf-count'));
 assert.equal(fingerprint(p),before);
});
test('layout catalog does not claim unavailable official layout adapters; user labels escaped',()=>{
 const p=initialProject();p.system.name='<img onerror=alert(1)>';
 const html=catalogView(p,'hero','split','Layout',(_en,ko)=>ko,c=>c.provider);
 assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));
 assert.ok(html.includes('Browse hero'));assert.ok(!html.includes('Browse button'));
 assert.ok(!html.includes('Add mui hero'));assert.ok(html.includes('크게 보기'));
});
