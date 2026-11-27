import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandPaletteHtml,commandTable} from '../src/editor/command-palette';
import {editorCalls,noop} from './support/editor-calls';

/* 0.3-L5 fix 2 (#7, #23): a theme picked in another tab moves the open palette's "current" mark too, keeping what was typed. */
test('a theme picked in another tab marks the new theme current in the open palette',()=>{
  let painted='';
  const ctx={hasSelection:false,canUndo:false,canRedo:false,approved:false,viewport:'desktop' as const,theme:'light'};
  const list={replaceWith:(next:{html:string})=>{painted=next.html;}},search={value:'theme'};
  const screen={theme:'light',screen:'editor',uiLanguage:'en',ctx,commandPaletteHtml,commandTable,applyTheme:noop,paintPaper:async()=>{},themeRows:()=>'',hydrateIconsIn:noop,render:noop,
    document:{documentElement:{},querySelectorAll:()=>[]},
    modalRoot:{querySelector:(s:string)=>s==='#command-list'?list:s==='#command-search'?search:null},
    paletteContext:()=>({...ctx,theme:screen.theme}),
    DOMParser:class{parseFromString(html:string){return {querySelector:()=>({html})};}}};
  editorCalls(['function showTheme(','function renderPaletteList('],screen);
  (screen as typeof screen & {showTheme:Function}).showTheme('dark');
  const current=/data-scheme="(\w+)"[^>]*>(?:(?!<\/button>).)*current/.exec(painted);
  assert.equal(current?.[1],'dark');
  assert.match(painted,/value="theme"/);
});
