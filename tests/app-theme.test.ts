import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

/* 0.3-L5: the app's own screens are light, dark or the Mac's (owner 11/23), set once on the document root before the first paint. */
test('the app document sets no theme of its own, and a same-origin script picks the person\'s before the sheets load',()=>{
  const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(app,/<html\b[^>]*data-theme=/,'no theme written into index.html: with none the tokens follow the Mac');
  const head=app.slice(0,app.indexOf('</head>'));
  const boot=head.indexOf('<script src="/theme.js"></script>'),sheet=head.indexOf('<link rel="stylesheet"');
  assert.ok(boot>0&&boot<sheet,'a classic script in the head, before the sheets (the desktop policy allows no inline script)');
  const gallery=readFileSync(new URL('../ui-gallery.html',import.meta.url),'utf8');
  assert.doesNotMatch(gallery,/<html\b[^>]*data-theme=/,'the gallery sets its theme from its own picker');
  assert.match(gallery,/data-theme-pick="dark"/);
});

/** public/theme.js run against a stored value, as the browser runs it before anything else. */
const metas:Record<string,string>[]=[];
function boot(stored:Record<string,string>){
  const attrs:Record<string,string>={};
  const localStorage={getItem:(k:string)=>k in stored?stored[k]:null};
  const documentElement={setAttribute:(k:string,v:string)=>{attrs[k]=v;},removeAttribute:(k:string)=>{delete attrs[k];}};
  metas.splice(0,metas.length,{content:'light'},{content:'dark'});
  const querySelectorAll=(s:string)=>s==='meta[name="theme-color"]'?metas.map(m=>({setAttribute:(k:string,v:string)=>{m[k]=v;}})):[];
  runInNewContext(readFileSync(new URL('../public/theme.js',import.meta.url),'utf8'),{localStorage,document:{documentElement,querySelectorAll}});
  return attrs['data-theme']??'system';
}

test('the script before the first paint and the app read every stored value the same way, the old Paper and Midnight too',async()=>{
  const {readTheme,themeKey}=await import('../src/theme.ts');
  const old='aphrodite-paper-theme';
  const cases:[Record<string,string>,string][]=[
    [{},'system'],[{[themeKey]:'system'},'system'],[{[themeKey]:'light'},'light'],[{[themeKey]:'dark'},'dark'],[{[themeKey]:'purple'},'system'],
    [{[old]:'night'},'dark'],[{[old]:'paper'},'light'],[{[old]:'noon'},'system'],[{[themeKey]:'light',[old]:'night'},'light'],[{[themeKey]:'system',[old]:'night'},'system'],
  ];
  for(const [stored,want] of cases){
    const storage={getItem:(k:string)=>k in stored?stored[k]:null};
    assert.equal(readTheme(storage),want,'the app: '+JSON.stringify(stored));
    assert.equal(boot(stored),want,'the first paint: '+JSON.stringify(stored));
  }
  const thrown={getItem:()=>{throw new Error('no storage');}};
  assert.equal(readTheme(thrown),'system','storage that cannot be read follows the Mac');
});

test('an old Paper or Midnight is moved to the new name once, and a choice is kept for the next launch',async()=>{
  const {readTheme,saveTheme,themeKey}=await import('../src/theme.ts');
  const store=new Map<string,string>([['aphrodite-paper-theme','night']]);
  const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);},removeItem:(k:string)=>{store.delete(k);}};
  assert.equal(readTheme(storage),'dark');
  assert.equal(store.get(themeKey),'dark','written under the new name');
  assert.equal(store.has('aphrodite-paper-theme'),false,'the old name is gone');
  saveTheme(storage,'light');
  assert.equal(readTheme(storage),'light','read back as chosen');
  assert.throws(()=>saveTheme(storage,'sepia' as never));
});

test('the theme shown is the choice, or the Mac\'s when the choice is to follow it, and only the root carries it',async()=>{
  const {shownTheme,applyTheme}=await import('../src/theme.ts');
  assert.equal(shownTheme('system',true),'dark');
  assert.equal(shownTheme('system',false),'light');
  assert.equal(shownTheme('light',true),'light');
  assert.equal(shownTheme('dark',false),'dark');
  const attrs:Record<string,string>={};
  const root={setAttribute:(k:string,v:string)=>{attrs[k]=v;},removeAttribute:(k:string)=>{delete attrs[k];}};
  applyTheme(root,'dark');assert.equal(attrs['data-theme'],'dark');
  applyTheme(root,'system');assert.equal('data-theme' in attrs,false,'following the Mac is no attribute: tokens.css answers prefers-color-scheme');
});

/* 0.3-L4 ③ and 0.3-L5: before the page has painted, the window and the browser bar show the paper of the theme the Mac is in. */
test('the window and the browser bar start on the paper of the theme the Mac is in',async()=>{
  const {resolve}=await import('../src/ui/tokens.ts');
  const light=resolve('light','bg-app')!.toLowerCase(),dark=resolve('dark','bg-app')!.toLowerCase();
  const tauri=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
  for(const w of tauri.app.windows){
    assert.equal(String(w.backgroundColor).toLowerCase(),light,'tauri.conf.json window backgroundColor');
    assert.equal('theme' in w,false,'the window\'s title bar follows the Mac');
  }
  const look=readFileSync(new URL('../src-tauri/src/look.rs',import.meta.url),'utf8');
  const paper=(name:string)=>{const rgb=new RegExp(name+':\\s*\\(u8, u8, u8\\)\\s*=\\s*\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)').exec(look);assert.ok(rgb,name);return '#'+rgb!.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join('');};
  assert.equal(paper('LIGHT_PAPER'),light,'look.rs light paper');
  assert.equal(paper('DARK_PAPER'),dark,'look.rs dark paper');
  const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.equal(/<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: light\)"/.exec(app)?.[1].toLowerCase(),light,'index.html theme-color, light');
  assert.equal(/<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: dark\)"/.exec(app)?.[1].toLowerCase(),dark,'index.html theme-color, dark');
});

/* 0.3-L5 fix 1 #1, #2, #5: macOS's own theme setter changes every window the app opens, and the background setter the JS API calls
   was sent under a name the window never read. One command of the app's own puts the look on the main window only, and the
   window is put on it before it is shown; the windows that draw the person's design are held light. */
test('the desktop look is the app\'s own command, on the main window only, before the window is shown',async()=>{
  const {nativeLook}=await import('../src/theme.ts');
  const calls:[string,Record<string,unknown>][]=[];
  await nativeLook(async(c,a)=>{calls.push([c,a]);},'dark');
  assert.deepEqual(calls,[['window_look',{look:'dark'}]]);
  const look=readFileSync(new URL('../src-tauri/src/look.rs',import.meta.url),'utf8');
  assert.match(look,/#\[tauri::command\]\s*pub fn window_look\(app: AppHandle, look: String\)/,'the command reads the argument the app sends');
  assert.match(look,/get_webview_window\("main"\)/,'and puts it on the main window');
  assert.match(look,/msg_send!\[ns_window, setAppearance: chosen\]/,'as that window\'s own appearance');
  assert.doesNotMatch(look,/set_theme/,'never the application\'s');
  const rust=readFileSync(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8');
  assert.match(rust,/look::window_look,/,'registered');
  assert.match(rust,/look::apply\(&window, look::saved\(app\.handle\(\)\)\);\s*let _ = window\.show\(\);/,'the saved look goes on before the window is shown');
  const tauri=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
  for(const w of tauri.app.windows)assert.equal(w.visible,false,'the window opens hidden');
  const caps=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json',import.meta.url),'utf8'));
  assert.deepEqual(caps.permissions.filter((p:string)=>/set-theme|set-background-color/.test(p)),[],'the page is given no window setter of its own');
  const snapshot=readFileSync(new URL('../src-tauri/src/snapshot.rs',import.meta.url),'utf8');
  assert.match(snapshot,/\.build\(\)[\s\S]{0,200}?crate::look::light_only\(&window\);[\s\S]*put_then_load/,'a render window is held light before its page loads');
  const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.doesNotMatch(main,/getCurrentWindow\(\)\.set(Theme|BackgroundColor)|plugin:window\|set_(theme|background_color)/,'the app calls no window setter that reaches other windows');
});

/* 0.3-L5 fix 1 #6: a store that will be read but not written keeps the theme it read; a browser that refuses storage still starts. */
test('an old choice read from a store that refuses the move is still the choice, and a refused storage starts on its defaults',async()=>{
  const {readTheme}=await import('../src/theme.ts');
  const store={getItem:(k:string)=>k==='aphrodite-paper-theme'?'night':null,setItem:()=>{throw new Error('full');},removeItem:()=>{throw new Error('full');}};
  assert.equal(readTheme(store),'dark');
  assert.equal(boot({'aphrodite-paper-theme':'night'}),'dark','the first paint agrees');
  const {pageStorage}=await import('../src/storage.ts');
  const refused=pageStorage(()=>{throw new DOMException('denied','SecurityError');});
  assert.equal(refused.getItem('aphrodite-theme'),null);
  assert.throws(()=>refused.setItem('a','b'),'a write says it was not kept');
  const kept=new Map<string,string>();const real={getItem:(k:string)=>kept.get(k)??null,setItem:(k:string,v:string)=>{kept.set(k,v);},removeItem:(k:string)=>{kept.delete(k);},key:()=>null,clear:()=>kept.clear(),get length(){return kept.size;}} as Storage;
  assert.equal(pageStorage(()=>real),real);
  const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.deepEqual(main.match(/\blocalStorage\b/g),['localStorage'],'main.ts reaches the browser\'s storage once, through pageStorage');
});

/* 0.3-L5 fix 1 #7: two tabs of the app show the same theme; the one that hears of the other's pick keeps nothing. */
test('a pick kept by another tab is shown, and not written again',()=>{
  const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  const listener=/window\.addEventListener\('storage',e=>\{([^\n]*)\}\);/.exec(main);
  assert.ok(listener,'main.ts listens for the other tabs');
  assert.match(listener![1],/e\.key!==themeKey&&e\.key!==null/,'for the theme, and for a cleared storage');
  assert.match(listener![1],/showTheme\(next\)/);
  assert.doesNotMatch(listener![1],/saveTheme|setTheme/,'and writes nothing back');
});

/* 0.3-L5: the one switch is offered in three places with one action: home's theme menu, the editor's help menu and the command palette. */
test('home, the help menu and the palette offer the same three looks, with the one in use marked',async()=>{
  const {workspaceHome}=await import('../src/workspace/home.ts');
  const {helpMenuHtml}=await import('../src/editor/help-menu.ts');
  const {commandTable}=await import('../src/editor/command-palette.ts');
  const rows=(html:string)=>[...html.matchAll(/<button[^>]*role="menuitemradio" aria-checked="(true|false)" data-action="hub-theme" data-scheme="(\w+)"/g)].map(m=>m[2]+':'+m[1]);
  const home=workspaceHome({version:1,entries:[]},'recent','','','dark','ko');
  assert.deepEqual(rows(home),['system:false','light:false','dark:true'],'home');
  assert.match(home,/<details class="folio-theme"><summary class="ui-icon-btn" aria-label="테마" title="테마 · 어둡게">/);
  assert.deepEqual(rows(helpMenuHtml('en',undefined,undefined,'system')),['system:true','light:false','dark:false'],'the help menu');
  assert.deepEqual(rows(helpMenuHtml('en')),[],'a menu given no theme has none');
  const looks=commandTable({hasSelection:false,canUndo:false,canRedo:false,approved:false,viewport:'desktop',theme:'light'}).filter(c=>c.action==='hub-theme');
  assert.deepEqual(looks.map(c=>c.data?.scheme+':'+(c.hint?.en??'')),['system:','light:current','dark:'],'the palette');
  assert.ok(!/data-theme=/.test(home+helpMenuHtml('ko',undefined,undefined,'dark')),'no control carries data-theme, which would paint itself in that theme');
});

/* 0.3-L5: what is not the app's own look keeps its ground in both themes: the page white, the catalog's and the wordmark's paper, and the cutouts meet the dark theme without being multiplied into it. */
test('the page and the paper are the same in both themes, and the cutouts are multiplied only into the light one',async()=>{
  const {resolve,themes}=await import('../src/ui/tokens.ts');
  for(const role of ['bg-page','bg-paper','bg-media'])assert.equal(resolve('dark',role),resolve('light',role),role);
  assert.equal(themes.light['art-blend'],'multiply');
  assert.equal(themes.dark['art-blend'],'normal');
  for(const sheet of ['src/ui/screens/surfaces.css','src/design/studio.css'])assert.doesNotMatch(readFileSync(new URL('../'+sheet,import.meta.url),'utf8'),/mix-blend-mode:\s*multiply/,sheet+' blends through the token');
});

/* 0.3-L5 fix 1 #5: the browser bar is on the picked paper from the first script, not after the app has started. */
test('the first script puts both browser-bar colours on the picked paper, and leaves them to the Mac otherwise',async()=>{
  const {resolve}=await import('../src/ui/tokens.ts');
  boot({'aphrodite-theme':'dark'});
  assert.deepEqual(metas.map(m=>m.content.toLowerCase()),[resolve('dark','bg-app')!.toLowerCase(),resolve('dark','bg-app')!.toLowerCase()]);
  boot({'aphrodite-theme':'light'});
  assert.deepEqual(metas.map(m=>m.content.toLowerCase()),[resolve('light','bg-app')!.toLowerCase(),resolve('light','bg-app')!.toLowerCase()]);
  boot({});
  assert.deepEqual(metas.map(m=>m.content),['light','dark'],'following the Mac touches neither');
});

/* 0.3-L5 fix 1 #2, #3, #4: the person's design is drawn light whatever the app's theme or the Mac's: the page, every frame and the
   desktop's preview host; the app's field colours stop at the design; a picture, video or poster sits on the same ground in both. */
test('the design is light in every place it is drawn, its fields keep its own colours, and a picture keeps its ground',()=>{
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/\n\.design-page,iframe\{color-scheme:light\}/,'the section page and every frame');
  const host=readFileSync(new URL('../src/design/native-preview.ts',import.meta.url),'utf8');
  assert.match(host,/:host\{[^}]*color-scheme:light/,'the desktop\'s preview host');
  const fieldRules=[...css.matchAll(/(^|\n)([^{}\n]*\b(?:input|textarea|select)\b[^{}\n]*)\{([^}]*)\}/g)].filter(m=>/(^|;)\s*(color|background(-color)?|border(-color)?)\s*:[^;]*(var\(|#)/.test(m[3])&&m[2].split(',').some(p=>/^\s*(input|textarea|select)\b/.test(p)));
  for(const m of fieldRules)for(const part of m[2].split(',').filter(p=>/^\s*(input|textarea|select)\b/.test(p)))assert.match(part.trim(),/:not\(:where\(\.design-page \*\)\)/,'an app field rule that colours bare fields leaves the design\'s alone: '+part);
  assert.ok(fieldRules.length>=1,'the app still colours its own fields');
  assert.match(css,/\.board-media\{background:var\(--ui-bg-media\)\}/);
  assert.match(css,/\.page-view-media\{[^}]*background:var\(--ui-bg-media\)/);
  assert.match(css,/\.reference-poster img\{[^}]*background:var\(--ui-bg-paper\)/);
  // 0.3-L5 fix 2 (#4, #18): the same reference opened, in the sidebar, at full size and in its analysis, sits on the same paper.
  const refCss=readFileSync(new URL('../src/reference.css',import.meta.url),'utf8');
  assert.match(css,/\.reference-upload>img\{[^}]*background:var\(--ui-bg-paper\)/);
  assert.match(css,/\.reference-large\{[^}]*background:var\(--ui-bg-paper\)/);
  assert.match(refCss,/\.reference-evidence-image>img\{[^}]*background:var\(--ui-bg-paper\)/);
});

test('CI runs the theme check with the other browser checks',()=>{
  const ci=readFileSync(new URL('../.github/workflows/checks.yml',import.meta.url),'utf8');
  assert.match(ci,/run: npm run verify:theme\n/);
});

test('the UI system names, among its known limits, that a design is always drawn light and that its dark look waits for a switch',()=>{
  const doc=readFileSync(new URL('../docs/UI-SYSTEM.md',import.meta.url),'utf8');
  const limits=doc.slice(doc.indexOf('## 알려진 한계'),doc.indexOf('### 기준에 못 미치는 조합'));
  assert.match(limits,/디자인은 늘 밝은 쪽/);
  assert.match(limits,/어두운 모습을 보는 스위치/);
  // 0.3-L5 fix 2 (#14, #15, #13): an exported file is the page's own, older WebKit is a known gap, and the check compares the preview as text.
  assert.match(limits,/앱 안에서는 늘 밝은 쪽으로 보이고, 내보낸 파일은 받는 사람의 화면 설정을 따를 수 있어요/);
  assert.match(limits,/macOS 15 미만/);
  assert.match(limits,/srcdoc/);
  assert.doesNotMatch(readFileSync(new URL('../docs/COMPUTER-USE.md',import.meta.url),'utf8'),/rendered or exported is always drawn light/);
});
