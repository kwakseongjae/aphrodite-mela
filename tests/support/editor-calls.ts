import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import ts from 'typescript';
import {begin,end,newHistory} from '../../src/ledger/session';
import {placeNewFrames,revealStarter} from '../../src/editor/starter';
import {ensureSpace} from '../../src/editor/space';
import {refusal,sourceFor} from '../../src/agent/dispatch';
import type {Project} from '../../src/model';

const main=ts.createSourceFile('main.ts',readFileSync(new URL('../../src/main.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
export const noop=()=>{};

/** Run the editor's actual functions and event registrations with just the screen surfaces the test exercises. */
export function editorCalls(starts:string[],screen:Record<string,unknown>){
  const code=starts.map(start=>{
    const found=main.statements.filter(s=>s.getText(main).startsWith(start));
    if(found.length!==1)throw new Error(`Expected one editor statement starting with ${start}, found ${found.length}`);
    return found[0].getText(main);
  }).join('\n');
  runInNewContext(transformSync(code,{loader:'ts'}).code,screen);
}

export function editorBoard(project:Project){
  ensureSpace(project);
  return {project,edits:newHistory(project),screen:'editor',begin,end,placeNewFrames,ensureSpace,revealStarter,refusal,sourceFor,
    persist:noop,recordRun:noop,changeReceipt:noop,saveTyping:noop,render:noop,app:{},rerenderPreservingScroll:noop,lastSaved:true};
}
