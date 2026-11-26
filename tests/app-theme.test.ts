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
function boot(stored:Record<string,string>){
  const attrs:Record<string,string>={};
  const localStorage={getItem:(k:string)=>k in stored?stored[k]:null};
  const documentElement={setAttribute:(k:string,v:string)=>{attrs[k]=v;},removeAttribute:(k:string)=>{delete attrs[k];}};
  runInNewContext(readFileSync(new URL('../public/theme.js',import.meta.url),'utf8'),{localStorage,document:{documentElement}});
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
  const rust=readFileSync(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8');
  const rgb=/Theme::Dark[\s\S]{0,200}?Color\((\d+),\s*(\d+),\s*(\d+),\s*255\)/.exec(rust);
  assert.ok(rgb,'main.rs puts a dark Mac\'s window on the dark paper');
  assert.equal('#'+rgb!.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join(''),dark);
  const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.equal(/<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: light\)"/.exec(app)?.[1].toLowerCase(),light,'index.html theme-color, light');
  assert.equal(/<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: dark\)"/.exec(app)?.[1].toLowerCase(),dark,'index.html theme-color, dark');
  const caps=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json',import.meta.url),'utf8'));
  for(const p of ['core:window:allow-set-theme','core:window:allow-set-background-color'])assert.ok(caps.permissions.includes(p),p);
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
