import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import assert from 'node:assert/strict';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {initialProject,makeBlock,parseProject}=await server.ssrLoadModule('/src/model.ts');
 const {exportBundle}=await server.ssrLoadModule('/src/export.ts');
 const p=initialProject();p.name='Official library verification';p.system.font='sans';
 const frame=makeBlock('frame');frame.title='Library comparison';frame.layout={columns:2,gap:20};
 p.pages[0].blocks=[frame,...['mui','astryx','seed','shadcn'].map(provider=>{const b=makeBlock('button');b.provider=provider;b.title=provider;b.label='시작하기';b.parentId=frame.id;return b;}),...['input','cards'].map(kind=>({...makeBlock(kind),provider:'mui'}))];
 const start=performance.now(),bytes=await exportBundle(p),files=unzipSync(bytes);
 const html=strFromU8(files['index.html']);
 assert.equal((html.match(/sandbox="allow-scripts"/g)||[]).length,6);
 assert.ok(files['react-source/src/vendor/runtime.tsx']);assert.ok(files['LICENSES.json']);
 assert.equal(parseProject(strFromU8(files['project.aphrodite.json'])).pages[0].blocks.length,7);
 assert.match(html,/frame-src about:/);assert.match(html,/RUNTIME_START/);
 const root='lab/artifacts/official-libraries';await mkdir(root,{recursive:true});
 for(const [name,value]of Object.entries(files)){await mkdir(`${root}/${name.substring(0,name.lastIndexOf('/')+1)}`,{recursive:true});await writeFile(`${root}/${name}`,value);}
 await writeFile(`${root}/handoff.zip`,bytes);
 console.log(JSON.stringify({files:Object.keys(files).length,bytes:bytes.length,exportMs:Math.round(performance.now()-start),components:7,officialFrames:6}));
}finally{await server.close();}
