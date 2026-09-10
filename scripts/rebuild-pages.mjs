// Rebuild the same offline preview with edited React adapters; no CDN/network runtime.
import { readFile,writeFile,mkdir,readdir,cp } from 'node:fs/promises';
const js=await readFile('src/generated/library-runtime.js','utf8');
const css=await readFile('src/generated/library-runtime.css','utf8');
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const encode=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await mkdir('dist',{recursive:true});
for(const file of await readdir('templates')) {
 if(!file.endsWith('.html'))continue;
 const html=(await readFile(`templates/${file}`,'utf8')).replace(/srcdoc="([^"]*)"/g,(_,value)=>{
  const doc=decode(value).replace(/\/\*RUNTIME_START\*\/[\s\S]*?\/\*RUNTIME_END\*\//g,()=>`/*RUNTIME_START*/${js.replaceAll('</script','<\\/script')}/*RUNTIME_END*/`).replace(/\/\*CSS_START\*\/[\s\S]*?\/\*CSS_END\*\//g,()=>`/*CSS_START*/${css}/*CSS_END*/`);
  return `srcdoc="${encode(doc)}"`;
 });
 await writeFile(`dist/${file}`,html);
}
try{await cp('assets','dist/assets',{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Rebuilt offline HTML pages in dist/');
