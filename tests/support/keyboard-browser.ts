import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';

/** Boot the working editor in a real browser. Everything is served from memory, including the few
 * test-only doors for arranging a sheet, a toast or an agent lease between native key events. */
export async function keyboardBrowser(){
  const main=await readFile('src/main.ts','utf8');
  const fixture=`
    Object.assign(window,{scene:{
      board:()=>{markWelcomed();closeModal();openProject(project);},
      sheet:()=>showFatal('test diagnostic'),
      request:()=>window.aphroditeAgent.run('connect',{},'keyboard-test'),
      palette:()=>commandsModal(),
      toast:()=>notice('The board was changed.'),
      lock:()=>startAgentMode('keyboard-test','Test keyboard ownership'),
      unlock:()=>{endAgentMode('returned');editorMode='design';render();},
      mark:()=>{setAllowed([ANYONE]);refreshBanners();},
      wrote:()=>bumpConnect('claude-code'),
      page:()=>openPageView(project.activePageId),
      approved:()=>isApproved(project),
    }});
  `;
  const output=await build({stdin:{contents:main+fixture,resolveDir:resolve('src'),loader:'ts'},bundle:true,write:false,outfile:'editor.js',format:'iife',
    define:{__APP_VERSION__:'"test"',__BOARD_SCHEME__:'"aphrodite"','process.env.NODE_ENV':'"production"'},
    external:['/assets/*','/fonts/*','/brand/*'],plugins:[{name:'raw-text',setup(build){
      build.onLoad({filter:/.*/},async args=>args.suffix==='?raw'?{contents:await readFile(args.path,'utf8'),loader:'text'}:undefined);
    }}]});
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:process.env.CHROME_BIN?.includes('headless-shell')?['--single-process','--no-zygote','--disable-gpu']:[]});
  try{
    const page=await browser.newPage();
    await page.addInitScript(()=>localStorage.clear());
    await page.route('**/*',route=>{
      const url=new URL(route.request().url()),file=output.outputFiles.find(f=>f.path.endsWith(url.pathname));
      if(file&&url.pathname!=='/')return route.fulfill({body:file.text,contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript'});
      if(url.pathname==='/')return route.fulfill({body:'<meta charset="utf-8"><link rel="stylesheet" href="/editor.css"><div id="app"></div><div id="modal-root"></div><div id="toast"></div><script src="/editor.js"></script>',contentType:'text/html'});
      return route.fulfill({status:404,body:''});
    });
    return {page,browser};
  }catch(error){await browser.close();throw error;}
}
