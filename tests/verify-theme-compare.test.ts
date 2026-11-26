import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameInBothThemes} from '../scripts/lib/theme-compare.mjs';

/* 0.3-L5 fix 2 (#13): what verify:theme reads in each theme is held to one comparison, and the two ways the first gate passed on nothing now fail. */
const shot=(n:number)=>Array.from({length:n},(_,i)=>'png'+i);
const read=()=>({design:Array.from({length:24},(_,i)=>'el'+i+' light rgb(0, 0, 0)'),frames:shot(2),preview:'<html>page</html>',code:'<!doctype html><html>'+'x'.repeat(600)+'</html>',catalog:shot(2),paper:'rgb(247, 245, 239)'});
test('the theme comparison passes the same design under two papers',()=>{
  assert.doesNotThrow(()=>sameInBothThemes({light:read(),dark:{...read(),paper:'rgb(27, 26, 22)'}}));
});
test('an export missing in both themes fails, as it passed the first gate',()=>{
  assert.throws(()=>sameInBothThemes({light:{...read(),code:null},dark:{...read(),code:null,paper:'rgb(27, 26, 22)'}}),/exported index\.html was read/);
});
test('a dark list shorter than the light one fails, as it passed the first gate',()=>{
  const light=read(),dark={...read(),paper:'rgb(27, 26, 22)'};
  assert.throws(()=>sameInBothThemes({light,dark:{...dark,design:dark.design.slice(0,20)}}),/section page/);
  assert.throws(()=>sameInBothThemes({light,dark:{...dark,frames:dark.frames.slice(0,1)}}),/free pages/);
  assert.throws(()=>sameInBothThemes({light,dark:{...dark,catalog:dark.catalog.slice(0,1)}}),/catalog/);
});
