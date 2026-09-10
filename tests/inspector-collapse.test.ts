import {test} from 'node:test';
import assert from 'node:assert/strict';
import {INSPECTOR_COLLAPSED_KEY,readInspectorCollapsed,writeInspectorCollapsed,inspectorToggleHtml} from '../src/editor/inspector-collapse';

function memory():Pick<Storage,'getItem'|'setItem'>&{data:Map<string,string>}{
 const data=new Map<string,string>();
 return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}};
}

test('collapsed preference defaults false and round-trips through storage',()=>{
 const storage=memory();
 assert.equal(readInspectorCollapsed(storage),false);
 writeInspectorCollapsed(storage,true);
 assert.equal(storage.data.get(INSPECTOR_COLLAPSED_KEY),'true');
 assert.equal(readInspectorCollapsed(storage),true);
 writeInspectorCollapsed(storage,false);
 assert.equal(storage.data.get(INSPECTOR_COLLAPSED_KEY),'false');
 assert.equal(readInspectorCollapsed(storage),false);
});

test('read and write tolerate throwing storage',()=>{
 const boom={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');}};
 assert.equal(readInspectorCollapsed(boom),false);
 writeInspectorCollapsed(boom,true);
});

test('toggle html uses labels and aria-expanded for both states',()=>{
 const labels={show:'Show inspector',hide:'Hide inspector'};
 const expanded=inspectorToggleHtml(false,labels);
 assert.match(expanded,/^<button type="button" class="inspector-toggle" data-action="inspector-toggle" aria-expanded="true">Hide inspector<\/button>$/);
 const collapsed=inspectorToggleHtml(true,labels);
 assert.match(collapsed,/^<button type="button" class="inspector-toggle" data-action="inspector-toggle" aria-expanded="false">Show inspector<\/button>$/);
});
