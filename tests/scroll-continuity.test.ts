import test from 'node:test';
import assert from 'node:assert/strict';
import {rerenderPreservingScroll} from '../src/editor/scroll-continuity';
test('rerender restores scroll in replaced editor surfaces without retaining old elements',()=>{
 const make=(top:number,left=0)=>({scrollTop:top,scrollLeft:left,events:[] as string[],dispatchEvent(e:Event){this.events.push(e.type);return true;}});
 let nodes:Record<string,ReturnType<typeof make>>={'#canvas-scroll':make(870,35),'.inspector':make(520),'.library-content':make(48)};
 const old=nodes;const root={querySelector:(s:string)=>nodes[s]??null} as unknown as Pick<ParentNode,'querySelector'>;
 rerenderPreservingScroll(root,()=>{nodes={'#canvas-scroll':make(0),'.inspector':make(0),'.library-content':make(0)};});
 assert.equal(nodes['#canvas-scroll'].scrollTop,870);assert.equal(nodes['#canvas-scroll'].scrollLeft,35);assert.equal(nodes['.inspector'].scrollTop,520);assert.equal(nodes['.library-content'].scrollTop,48);
 assert.deepEqual(nodes['#canvas-scroll'].events,['scroll']);assert.deepEqual(old['#canvas-scroll'].events,[]);
});
test('removed or missing surfaces are harmless during rerender',()=>{
 const root={querySelector:()=>null} as unknown as Pick<ParentNode,'querySelector'>;let called=0;
 rerenderPreservingScroll(root,()=>called++);assert.equal(called,1);
});
