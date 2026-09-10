import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,makeBlock,parseProject,fingerprint} from '../src/model';
import {planVibe,applyVibe,vibePacks} from '../src/design/vibe';
import {koreanVibeCopy,englishWorkspaceCopy} from '../src/design/vibe-ko';
import {vibeLanguageFormHtml,localizedVibePreviewHtml} from '../src/design/vibe-language-form';
test('unchecked media is not presented as zero missing media in either language',()=>{
 const blocks=[makeBlock('products')];
 const unchecked=planVibe(blocks,'lighting',{copy:true,images:false,replace:false});
 assert.equal(unchecked.imagesRequested,false);
 assert.match(localizedVibePreviewHtml(unchecked,'en'),/Images not checked/);
 assert.match(localizedVibePreviewHtml(unchecked,'ko'),/이미지 확인 안 함/);
 assert.doesNotMatch(localizedVibePreviewHtml(unchecked,'en'),/0 unavailable image slots/);
 const checked=planVibe(blocks,'lighting',{copy:true,images:true,replace:false});
 assert.match(localizedVibePreviewHtml(checked,'en'),/3 unavailable image slots/);
 assert.match(localizedVibePreviewHtml(checked,'ko'),/미확보 이미지 슬롯 3개/);
});
test('every shipped sample has EN/KO coverage; image slots survive localization',()=>{
 for(const pack of vibePacks){
  const translated=pack.id==='workspace'?englishWorkspaceCopy:koreanVibeCopy[pack.id];
  assert.deepEqual(Object.keys(translated).sort(),Object.keys(pack.copy).sort());
 }
 const b=makeBlock('hero');b.title='My reviewed heading';
 const plan=planVibe([b],'lighting',{copy:true,images:true,replace:false,language:'ko'});
 applyVibe([b],plan);assert.equal(b.title,'My reviewed heading');assert.match(b.text,/[가-힣]/);assert.equal(b.image,'/assets/lighting-hero.png');
});
test('brand labels use project name and locale persists without changing old documents',()=>{
 const p=initialProject(),old=fingerprint(p);assert.equal(parseProject(JSON.stringify(p)).contentLanguage,undefined);
 p.contentLanguage='ko';assert.notEqual(fingerprint(p),old);assert.equal(parseProject(JSON.stringify(p)).contentLanguage,'ko');
 const b=makeBlock('footer');const plan=planVibe([b],'lighting',{copy:true,images:false,replace:false,language:'ko',brandName:'빛공방'});applyVibe([b],plan);
 assert.equal(b.title,'빛공방');assert.equal(b.label,'© 2026 빛공방 · 데모');
 assert.throws(()=>parseProject(JSON.stringify({...p,contentLanguage:'fr'})),/language/);
 assert.match(vibeLanguageFormHtml(false,'ko'),/value="ko" selected/);
});

test('Get Vibe on an empty page points to brief, reference and catalog instead of a zero-change preview',async()=>{const {emptyPageVibeHtml}=await import('../src/design/vibe-language-form');for(const lang of ['en','ko'] as const){const html=emptyPageVibeHtml(lang);assert.match(html,/data-action="brief"/);assert.match(html,/data-action="reference"/);assert.match(html,/data-action="component-explorer"/);assert.match(html,/data-palette/);assert.match(html,lang==='ko'?/컴포넌트가 없습니다/:/no components yet/);}});
