import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,makeBlock,parseProject,catalog} from '../src/model';
import {patternVariants} from '../src/patterns';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';

const result=await build({entryPoints:['src/render.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{
 name:'raw-assets',setup(b){
  b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));
  b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));
 }
}]});
const {blockHtml}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64')) as typeof import('../src/render');

const layoutKinds=['navigation','hero','features','products','testimonial','cta','footer'] as const;

test('every layout kind offers at least three variations and each survives a project round trip',()=>{
  for(const kind of layoutKinds){
    const variants=patternVariants(kind);
    assert.ok(variants.length>=3,`${kind} has ${variants.length} variants`);
    assert.equal(variants[0],kind==='hero'?'split':'default');
    for(const variant of variants){
      const p=initialProject();const b=makeBlock(kind);b.variant=variant;p.pages[0].blocks=[b];
      const restored=parseProject(JSON.stringify(p));assert.equal(restored.pages[0].blocks[0].variant,variant);
      const html=blockHtml(restored.pages[0].blocks[0],restored);
      assert.match(html,new RegExp(`data-variant="${variant}"`));
    }
  }
});

test('numbered features count their rows and column footers expose the link row',()=>{
  const p=initialProject();
  const f=makeBlock('features');f.variant='numbered';f.text='One|a\nTwo|b';
  assert.match(blockHtml(f,p),/<span class="feature-symbol">01<\/span>/);
  assert.match(blockHtml(f,p),/<span class="feature-symbol">02<\/span>/);
  const foot=makeBlock('footer');foot.variant='columns';foot.text='Shop · About · Journal';
  assert.match(blockHtml(foot,p),/footer-columns/);assert.match(blockHtml(foot,p),/>Journal</);
  foot.variant='minimal';assert.doesNotMatch(blockHtml(foot,p),/footer-columns/);
  const bad=initialProject();bad.pages[0].blocks=[{...makeBlock('cta'),variant:'nope'}];assert.throws(()=>parseProject(JSON.stringify(bad)));
  assert.equal(catalog.length,35);
});
