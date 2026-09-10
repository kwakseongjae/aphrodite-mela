// Static-code iteration control from the exact baseline HTML. No editor/model/renderer imports.
// This reuses a completed page, not an image-to-code benchmark. Sequential exposure biases timing.
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const root='lab/artifacts/b3-iteration/',out=root+'direct-control/';
await mkdir(out,{recursive:true});
const baseline=await readFile(root+'00-baseline/page-3.html','utf8');
const blue=baseline.replace('--brand:#344e41','--brand:#2255cc');
assert.notEqual(blue,baseline);
await cp(root+'00-baseline/assets',out+'assets',{recursive:true});
await writeFile(out+'01-blue.html',blue);
const result=await build({entryPoints:[out+'button.tsx'],bundle:true,write:false,minify:true,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
const runtime=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const doc=`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0;background:#faf8f3}</style></head><body><div id="root"></div><script>${runtime}</script></body></html>`;
const button=`<div class="layout-item" data-control="consultation"><iframe title="Direct MUI consultation" sandbox="allow-scripts" style="display:block;border:0;width:100%;height:190px" srcdoc="${escape(doc)}"></iframe></div>`;
// Exact footer wrapper observed in the baseline; fail instead of silently guessing another section.
const footer='<div class="layout-item" data-node-id="c601029a-7cc0-4e80-97c1-3cf978565a64"';
assert.equal(blue.split(footer).length,2);
const mui=blue.replace(footer,()=>button+footer);await writeFile(out+'02-mui.html',mui);
const cta='<div class="layout-item" data-control="process"><section class="site-cta"><div><h2>A room changes with the light.</h2><p>From the first sketch to the final glow, discover the craft behind every Light Atelier piece.</p></div><a class="site-button" href="#block-0d49438f-9c95-48f3-a46f-473105f58c15">Explore our process <span>↗</span></a></section></div>';
const final=mui.replace(button,()=>cta+button);await writeFile(out+'03-final.html',final);
console.log('Built independent static-code iteration control: same baseline CSS/assets, three explicit requested changes, original footer link preserved.');
