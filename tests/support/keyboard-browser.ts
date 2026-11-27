import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';

/** Boot the working editor in a real browser. Everything is served from memory, including the few
 * test-only doors for arranging a sheet, a toast or an agent lease between native key events. */
export async function keyboardBrowser(){
  const main=await readFile('src/main.ts','utf8');
  const fixture=`
    Object.assign(window,{scene:{
      board:()=>{markWelcomed();endTour();closeModal();openProject(project);},
      welcome:()=>welcomeModal(),
      sheet:()=>showFatal('test diagnostic'),
      request:()=>window.aphroditeAgent.run('connect',{},'keyboard-test'),
      palette:()=>commandsModal(),
      toast:()=>notice('The board was changed.'),
      lock:()=>startAgentMode('keyboard-test','Test keyboard ownership'),
      unlock:()=>{endAgentMode('returned');editorMode='design';render();},
      mark:()=>{setAllowed([ANYONE]);refreshBanners();},
      connections:()=>agentConnectModal(),
      titleEdit:(title)=>{const block=currentPage(project).blocks[0];return window.aphroditeAgent.run('edit',
        {blockId:block.id,field:'title',text:title??block.title,reason:'Set the block title'},'claude-code');},
      wrote:()=>bumpConnect('claude-code'),
      page:()=>openPageView(project.activePageId),
      disk:()=>{window.__TAURI_INTERNALS__={invoke:async cmd=>{
        if(cmd==='workspace_read')return {revision:0,path:'/old',data:null};
        if(cmd==='workspace_write')return new Promise((yes,no)=>{window.finishWrite=yes;window.failWrite=no;});
        throw Error(cmd);
      }};attachDiskQueue(0);},
      empty:()=>reloadFromDiskNow(),
      edit:()=>{project.name='Queued';persist();},
      refuse:()=>{project.reference='x'.repeat(20_000_000);persist();},
      home:()=>{screen='home';render();},
      saveHome:()=>saveLibrary(library),
      redraw:()=>render(),
      approved:()=>isApproved(project),
    }});
  `;
  const output=await build({stdin:{contents:"import './ui/tokens.css';import './ui/components.css';\n"+main+fixture,resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,outfile:'editor.js',format:'iife',
    define:{__APP_VERSION__:'"test"',__BOARD_SCHEME__:'"aphrodite"','process.env.NODE_ENV':'"production"'},
    external:['/assets/*','/fonts/*','/brand/*'],plugins:[{name:'raw-text',setup(build){
      build.onLoad({filter:/.*/},async args=>args.suffix==='?raw'?{contents:await readFile(args.path,'utf8'),loader:'text'}:undefined);
    }}]});
  const executablePath=process.env.CHROME_BIN;
  const bundled=existsSync(chromium.executablePath());
  const browser=await chromium.launch({executablePath,channel:executablePath||bundled?undefined:'chrome',
    args:bundled||executablePath?.includes('headless-shell')?['--single-process','--no-zygote','--disable-gpu']:[]});
  try{
    const page=await browser.newPage();
    await page.route('**/*',route=>{
      const url=new URL(route.request().url()),file=output.outputFiles.find(f=>f.path.endsWith(url.pathname));
      if(file&&url.pathname!=='/')return route.fulfill({body:file.text,contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript'});
      if(url.pathname==='/')return route.fulfill({body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/editor.css"><div id="app"></div><div id="modal-root"></div><div id="toast" class="ui-toast-stack"></div><script src="/editor.js"></script>',contentType:'text/html'});
      return route.fulfill({status:404,body:''});
    });
    return {page,browser};
  }catch(error){await browser.close();throw error;}
}
