/* Renders every section variant off the real stylesheet, without the app.
   The live app resets Connected mode whenever a module reloads, so a CSS sweep that drives
   the running window needs a person at the keyboard for every edit. This needs nobody:
   same page.css, same renderer, headless Chrome, both widths.
     node scripts/variant-gate.mjs [kind ...]          → scratchpad/gate-<kind>-<width>.png */
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {statSync} from 'node:fs';
import {rm} from 'node:fs/promises';

const OUT=process.env.GATE_OUT||'/private/tmp/claude-501/-Users-kwakseongjae-Desktop-projects-aphrodite-mela/c5bc87cf-268b-4dec-a461-59e658cf97bd/scratchpad';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KINDS=['navigation','hero','features','products','testimonial','cta','footer'];
const FRAME=Number(process.env.GATE_FRAME||0);
/* Hold the container width in CSS rather than trusting the window: a tall headless window does
   not lay out at the width you asked for, and the phone shot silently came back at ~490px. */
const SHOTS=FRAME?[{container:FRAME,height:12000,loose:true}]:[{container:1440,height:7000},{container:390,height:12000}];

await writeFile('/tmp/gate-entry.ts',`export {pageHtml} from '${resolve('src/render.ts')}';\nexport {initialProject,makeBlock} from '${resolve('src/model.ts')}';\nexport {patternVariants} from '${resolve('src/patterns.ts')}';\n`);
const bundled=await build({entryPoints:['/tmp/gate-entry.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{
  name:'raw-assets',setup(b){
    b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));
    b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));
  }}]});
const {pageHtml,initialProject,makeBlock,patternVariants}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));

await mkdir(OUT,{recursive:true});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* Reads the framed shot back and says whether anything was painted outside the phone container.
   The page hides its own overflow, so a section that is too wide is invisible until you look. */
async function report(kind){
  const png=`${OUT}/gate-${kind}-overflow.png`;
  const {execFileSync}=await import('node:child_process');
  const out=execFileSync('python3',['-c',`
import sys
from PIL import Image
im=Image.open("${png}").convert('RGB');w,h=im.size
bad=[y for y in range(0,h,2) if im.crop((${FRAME}+6,y,w,y+1)).getcolors(maxcolors=200000)[0][1]!=(255,255,255) or len(im.crop((${FRAME}+6,y,w,y+1)).getcolors(maxcolors=200000))>1]
print(len(bad), bad[0] if bad else -1)
`],{encoding:'utf8'}).trim().split(' ');
  console.log(out[0]==='0'?`  nothing escapes ${FRAME}px`:`  ESCAPES ${FRAME}px on ${out[0]} rows, first at y=${out[1]}`);
}
/* Chrome writes --screenshot and then keeps running. Waiting for exit hangs; wait for the file
   to appear and stop growing, then end the process ourselves. */
async function shoot(file,png,width,height){
  const child=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--hide-scrollbars',`--window-size=${width},${height}`,
    `--screenshot=${png}`,`--user-data-dir=/tmp/gate-profile-${width}`,`file://${file}`],{stdio:'ignore'});
  let size=-1;
  try{
    for(let i=0;i<120;i++){
      await sleep(500);
      if(!existsSync(png))continue;
      const now=statSync(png).size;
      if(now>0&&now===size)return;
      size=now;
    }
    throw new Error(`no screenshot for ${png}`);
  }finally{child.kill('SIGKILL');}
}
const wanted=process.argv.slice(2).length?process.argv.slice(2):KINDS;
for(const kind of wanted){
  const project=initialProject();
  const page=project.pages[0];
  page.blocks=patternVariants(kind).map(variant=>{
    const b=makeBlock(kind,true);   // real copy and a real item count, or multi-column variants cannot be judged
    b.variant=variant;
    if('title' in b&&typeof b.title==='string')b.title=`${kind} · ${variant}`;
    return b;
  });
  const file=`${OUT}/gate-${kind}.html`;
  // file:// cannot resolve /assets/…; point them at the real files so proportions are honest
  let html=pageHtml(project,page).replaceAll('"/assets/',`"file://${resolve('public/assets')}/`);
  /* GATE_FRAME=390: hold the container at phone width on a wide canvas with the page's own
     overflow:hidden lifted, so anything that sticks out is visible instead of quietly cropped. */
  await writeFile(file,html);
  for(const {container,height,loose} of SHOTS){
    const png=`${OUT}/gate-${kind}-${loose?'overflow':container}.png`;
    const shot=`${OUT}/shot-${kind}-${container}.html`;
    await writeFile(shot,html.replace('</head>',`<style>main.design-page{width:${container}px${loose?';overflow:visible;outline:2px solid #e11':''}}body{width:${container+(loose?container:30)}px;background:#fff}</style></head>`));
    await rm(png,{force:true});
    await shoot(shot,png,container+(loose?container:30),height);
  }
  if(FRAME)await report(kind);
  console.log(`${kind}: ${page.blocks.length} variants → gate-${kind}-{1440,390}.png`);
}
