import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const out='src/generated'; await mkdir(out,{recursive:true});
await build({entryPoints:['src/vendor/runtime.tsx'],bundle:true,minify:true,format:'iife',platform:'browser',target:'es2022',outfile:`${out}/library-runtime.js`,define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
await mkdir('public/assets',{recursive:true});
await writeFile('public/assets/library-runtime.js',await readFile(`${out}/library-runtime.js`));
const colors={primary:'var(--brand)', 'primary-foreground':'var(--on-brand)',background:'var(--paper)',input:'#d4d4d8',ring:'var(--brand)',accent:'#f4f4f5','accent-foreground':'#18181b',secondary:'#f4f4f5','secondary-foreground':'#18181b',destructive:'#dc2626','destructive-foreground':'#fff'};
const tw=await postcss([tailwind({content:['src/vendor/shadcn-button.tsx'],corePlugins:{preflight:false},theme:{extend:{colors,borderRadius:{md:'var(--radius)'}}}})]).process('@tailwind utilities;',{from:undefined});
const css=await Promise.all(['@astryxdesign/core/dist/astryx.css','@astryxdesign/theme-neutral/dist/theme.css','@seed-design/css/base.css','@seed-design/css/recipes/action-button.css'].map(p=>readFile(`node_modules/${p}`,'utf8')));
await writeFile(`${out}/library-runtime.css`,css.join('\n')+'\n'+tw.css+'\nhtml{color-scheme:light}body{margin:0;background:var(--paper);color:var(--ink)}button{cursor:pointer;border-style:solid;border-width:0}');
const licenses={};
for(const p of ['react','react-dom','@mui/material','@emotion/react','@emotion/styled','@astryxdesign/core','@astryxdesign/theme-neutral','@seed-design/react','@seed-design/css','@radix-ui/react-slot','class-variance-authority','clsx','tailwind-merge']) {
 for(const name of ['LICENSE','LICENSE.md','LICENSE.txt']) {try{licenses[p]=await readFile(`node_modules/${p}/${name}`,'utf8');break}catch{}}
}
licenses.shadcn=await readFile('src/vendor/SHADCN-LICENSE.txt','utf8');
licenses['SEED-NOTICE']=await readFile('node_modules/@seed-design/react/NOTICE','utf8');
await writeFile(`${out}/licenses.json`,JSON.stringify(licenses,null,2));
console.log('Official component runtime + CSS + licenses generated.');
