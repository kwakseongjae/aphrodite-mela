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
test('catalog cards expose data-kind and the index is grouped by catalog headings',()=>{
 const p=initialProject();
 const html=catalogView(p,'button','outline','All',en=>en,()=>'<div>preview</div>');
 assert.match(html,/<article class="explorer-card" data-kind="button"/);
 assert.match(html,/data-preview-size="control"/);
 for(const heading of ['Layout','Navigation','Input','Feedback','Content & data','App recipes']){
  assert.ok(html.includes(`<h4 class="catalog-index-group">${heading}</h4>`),heading);
 }
 assert.ok(html.includes('title="Implementations · options (implementations × variations)"'));
 const input=catalogView(p,'button','outline','Input',en=>en,()=>'x');
 assert.ok(input.includes('<h4 class="catalog-index-group">Input</h4>'));
 assert.ok(!input.includes('<h4 class="catalog-index-group">Layout</h4>'));
 const calendar=catalogView(p,'calendar','week','All',en=>en,()=>'x');
 assert.match(calendar,/<article class="explorer-card" data-kind="calendar"/);
 assert.match(calendar,/data-preview-size="data"/);
});
