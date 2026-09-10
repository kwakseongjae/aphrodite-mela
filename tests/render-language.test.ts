import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {initialProject,makeBlock} from '../src/model';
import {unzipSync,strFromU8} from 'fflate';

const result=await build({entryPoints:['src/render.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{
 name:'raw-assets',setup(b){
  b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));
  b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));
 }
}]});
const {blockHtml,pageHtml}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
test('MUI input and cards receive reviewed surface and heading tokens with no data mutation',()=>{
 const p=initialProject();p.system.background='#faf8f3';p.system.foreground='#292d27';p.system.font='serif';
 for(const kind of ['input','cards'] as const){const b=makeBlock(kind);b.provider='mui';const before=JSON.stringify(b),html=blockHtml(b,p);
 assert.match(html,/&amp;quot;background&amp;quot;:&amp;quot;#faf8f3/);assert.match(html,/Georgia/);
 assert.equal(JSON.stringify(b),before);assert.match(html,/official-component official-action/);
  if(kind==='input')assert.match(html,/height:112px/);else assert.match(html,/<div class="official-copy"><h2>/);
  b.layout={height:800};const sized=blockHtml(b,p);assert.match(sized,/height:800px;box-sizing:border-box/);assert.match(sized,/height:auto;flex:1;min-height:64px/);
 }
});
test('official button authored copy stays in project layout, outside vendor frame',()=>{
 const p=initialProject(),b=makeBlock('button');b.provider='mui';b.title='A better <light>';b.text='Your reviewed description';
 const before=JSON.stringify(b),html=blockHtml(b,p);
 assert.match(html,/<div class="official-copy"><h2>A better &lt;light&gt;<\/h2><p>Your reviewed description<\/p><\/div><iframe/);
 assert.match(html,/height:90px/);assert.equal(JSON.stringify(b),before);
 p.pages[0].blocks=[b];assert.match(pageHtml(p,p.pages[0]),/var\(--heading\)/);
 b.layout={height:240};assert.match(blockHtml(b,p),/height:90px/);assert.match(pageHtml(p,p.pages[0]),/height:240px;overflow:auto/);
});
test('custom button primary reaches own CSS and official iframe without changing project',()=>{
 const p=initialProject(),b=makeBlock('button');b.theme={mode:'custom',accent:'#2255cc'};
 const before=JSON.stringify(p);assert.match(blockHtml(b,p),/--brand:#2255cc/);
 b.provider='mui';const html=blockHtml(b,p);assert.match(html,/&amp;quot;accent&amp;quot;:&amp;quot;#2255cc/);assert.equal(JSON.stringify(p),before);
 b.theme={mode:'source'};assert.match(blockHtml(b,p),/--brand:#1976d2/);
});
test('real renderer localizes only owned decorations, leaving reviewed copy intact',()=>{
 const p=initialProject();p.contentLanguage='ko';const b=makeBlock('hero');b.title='Reviewed English title';b.text='사용자 설명';b.label='My action';
 const before=JSON.stringify(b),html=blockHtml(b,p);
 assert.match(html,/세심하게 만들고/);assert.match(html,/이미지를 추가하세요/);assert.match(html,/Reviewed English title/);assert.equal(JSON.stringify(b),before);
 b.eyebrow='THOUGHTFULLY MADE. INTENTIONALLY YOURS.';assert.match(blockHtml(b,p),/THOUGHTFULLY MADE/);
 p.contentLanguage='en';assert.match(blockHtml(makeBlock('products'),p),/View all/);
 p.contentLanguage='ko';assert.match(blockHtml(makeBlock('products'),p),/전체 보기/);
 p.pages[0].blocks=[b];assert.match(pageHtml(p,p.pages[0]),/<html lang="ko"/);
});
test('export includes shared single-column mobile Feature and readable text rules',()=>{
 const p=initialProject(),html=pageHtml(p,p.pages[0]);
 assert.match(html,/@container\(max-width:500px\)\{\.feature-columns\{grid-template-columns:1fr/);
 assert.match(html,/\.feature-columns p\{font-size:13px/);
});
test('official renderer preserves inert serialized props for CSP-safe native boot',()=>{
 const p=initialProject(),b=makeBlock('button');b.provider='mui';b.label='Save <draft> & review';
 const html=blockHtml(b,p);
 assert.match(html,/data-props=/);assert.match(html,/RUNTIME_START/);
 assert.match(html,/sandbox="allow-scripts"/);
 assert.doesNotMatch(html,/<draft>/);
 assert.match(html,/data-provider="mui"/);
});
test('editorial Collection renders independent images, explicit empty slot and escaped introduction',()=>{
 const p=initialProject(),b=makeBlock('products',true);b.variant='editorial';b.description='<script>not executable</script>';b.itemImages=['/assets/lighting-hero.png','','/assets/living.jpg'];
 const html=blockHtml(b,p);assert.match(html,/data-variant="editorial"/);assert.match(html,/&lt;script&gt;/);assert.match(html,/src="\/assets\/lighting-hero.png"/);assert.match(html,/src="\/assets\/living.jpg"/);assert.equal((html.match(/Image placeholder/g)??[]).length,1);
 assert.doesNotMatch(html,/src="\/assets\/chair.jpg"/);
});
test('real export bundles a lighting image used only in an item slot and preserves editable slots',async()=>{
 const built=await build({entryPoints:['src/export.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'raw-assets',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}}]});
 const {exportBundle}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
 const p=initialProject(),b=makeBlock('products');b.text='Lamp A|$100\nLamp B|$200';b.itemImages=['/assets/lighting-hero.png',''];b.variant='editorial';p.pages[0].blocks=[b];
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async(input)=>{assert.equal(input,'/assets/lighting-hero.png');return new Response(await readFile('public/assets/lighting-hero.png'));};
  const files=unzipSync(await exportBundle(p));assert.ok(files['assets/lighting-hero.png'].length>0);
  assert.match(strFromU8(files['index.html']),/src="assets\/lighting-hero.png"/);
  assert.deepEqual(JSON.parse(strFromU8(files['SCENE.json'])).pages[0].nodes[0].slots.itemImages,b.itemImages);
  assert.match(strFromU8(files['PROMPT.md']),/DRAFT/);
  const capabilities=JSON.parse(strFromU8(files['CAPABILITIES.json']));
  assert.deepEqual(capabilities.pages[0].nodes[0].missingImageSlots,[1]);
  assert.equal(capabilities.referenceConformance.status,'not-assessed');
  assert.match(strFromU8(files['PROMPT.md']),/Read CAPABILITIES.json/);
  assert.match(strFromU8(files['README.md']),/selected page entry/);
  assert.doesNotMatch(strFromU8(files['ASSETS.md']),/No AI-generated/);
 }finally{globalThis.fetch=originalFetch;}
 const themed=initialProject();themed.pages[0].blocks=['project','source','custom'].map((mode,i)=>{const b=makeBlock('button');b.provider=i===2?'shadcn':'mui';b.variant=i===2?'outline':'solid';b.theme=mode==='custom'?{mode:'custom',accent:'#d7b449'}:{mode:mode as 'project'|'source'};return b;});
 const handoff=unzipSync(await exportBundle(themed));
 assert.deepEqual(JSON.parse(strFromU8(handoff['project.aphrodite.json'])),themed);
 assert.deepEqual(JSON.parse(strFromU8(handoff['SCENE.json'])).componentThemes.map((x:any)=>x.resolvedAccent),['#344e41','#1976d2','#d7b449']);
 const html=strFromU8(handoff['index.html']);assert.match(html,/&amp;quot;onAccent&amp;quot;/);
 const rebuilt=html.replace(/\/\*CSS_START\*\/[\s\S]*?\/\*CSS_END\*\//g,'/*CSS_START*/ replacement /*CSS_END*/');
 assert.match(rebuilt,/data-component-style/);assert.match(rebuilt,/#root button\{color:var\(--ink\)/);
});
