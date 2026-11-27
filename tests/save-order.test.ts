import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import {MAX_PROJECT} from '../src/model';
import {libraryText} from '../src/workspace/library';
import {editorCalls} from './support/editor-calls';
import {windowWithDisk,deferred} from './support/save-window';

test('each step reports saved only for the acknowledged live edit',async()=>{
  for(const steps of ['A B ok ok','A refuse ok','A refuse B ok fail','A B ok refuse fail','A fail B','A ok B refuse ok','A ok A ok','A B A ok ok ok']){
    const {s,edit,writes}=windowWithDisk();
    let acknowledged=s.saves.generation,index=0;
    const snapshots:{generation:number;name:string}[]=[];
    for(const step of steps.split(' ')){
      if(step==='ok'||step==='fail'){
        const w=writes[index],snapshot=snapshots[index++];assert.ok(w);
        assert.equal(JSON.parse(w.text).entries[0].project.name,snapshot.name);
        if(step==='ok'){acknowledged=snapshot.generation;w.done.resolve(index);}else w.done.reject(new Error('disk full'));
      }else{
        const before=s.saves.generation;
        edit(step==='refuse'?'bad\uD800':step);
        assert.ok(s.saves.generation>before);
        if(step!=='refuse')snapshots.push({name:step,generation:s.saves.generation});
      }
      await tick();
      assert.equal(s.saves.saved,acknowledged===s.saves.generation,steps+' after '+step);
    }
  }
});
test('quit after a refused B and a late acknowledgement of A keeps the window open',async()=>{
  const {s,writes,edit}=windowWithDisk();
  edit('A');await tick();s.project.reference='x'.repeat(MAX_PROJECT);edit('B');
  writes[0].done.resolve(1);await tick();
  let closed=false;await assert.rejects(s.closeWindow(async()=>{closed=true;}));
  assert.equal(closed,false);
});
test('a pending component image that exceeds the board limit invalidates the discard answer and a read in flight',async()=>{
  for(const during of [false,true]){
    const {s,reads,questions,press,edit}=windowWithDisk();
    const image=deferred<string>();await press('block-image');const importing=s.finishImage(image.promise);
    edit('bad\uD800');await s.reloadFromDisk();assert.equal(questions.length,1);
    const confirm={discardGeneration:s.confirmGeneration};assert.ok(confirm.discardGeneration);
    const reading=during?press('disk-reload',confirm):undefined;await tick();
    image.resolve('data:image/png;base64,'+'A'.repeat(MAX_PROJECT));await importing;
    if(during){reads[0].resolve({path:'/old',data:libraryText(s.library),revision:1});await reading;}
    else {const answer=press('disk-reload',confirm);await tick();reads[0]?.resolve({path:'/old',data:libraryText(s.library),revision:1});await answer;}
    assert.equal(questions.length,2,'ask again after the refused import');
    assert.equal(reads.length,during?1:0);
  }
});
test('Start fresh never writes the old board in place of a refused live edit',async()=>{
  const {s,edit,press,writes,said}=windowWithDisk();s.project.reference='x'.repeat(MAX_PROJECT);edit('B');
  const start=press('disk-start-fresh');await tick();writes[0]?.done.resolve(1);await start;
  assert.ok(s.saves.missing);assert.ok(!said.some(m=>m.includes('Started fresh')));assert.equal(writes.length,0);
});
test('a new edit during Start fresh keeps the reminder until a current save succeeds',async()=>{
  const {s,edit,press,writes,said}=windowWithDisk();
  const start=press('disk-start-fresh');await tick();edit('B');writes[0].done.resolve(1);await start;
  assert.ok(s.saves.missing);assert.ok(!said.some(m=>m.includes('Started fresh')));
  await tick();writes[1].done.resolve(2);await tick();const again=press('disk-start-fresh');await tick();
  assert.equal(JSON.parse(writes[2].text).entries[0].project.name,'B');writes[2].done.resolve(3);await again;assert.equal(s.saves.missing,undefined);
});
test('quit after an empty read and failed retry exports the same live boards as Save every board',async()=>{
  const {s,writes,reads,press,edit,files,questions}=windowWithDisk();
  edit('replacement');await tick();writes[0].done.resolve(1);await s.saves.flush();assert.equal(s.saves.replaced,true);
  const reading=s.reloadFromDisk();reads[0].resolve({data:null,path:'/old',revision:0});await reading;
  s.project.name='live';await press('hub-backup');
  const {windowCloser}=await import('../src/workspace/closing');
  Object.assign(s,{windowCloser,StillSaving:class extends Error{}});
  editorCalls(['async function askClose(','async function keepOnClose('],s);
  const ask=s.askClose;
  const dialog=async()=>({message:async(_said:string,o:{buttons:{yes:string}})=>{questions.push(o.buttons.yes);return o.buttons.yes;}});
  s.askClose=(error:unknown)=>ask(error,dialog);editorCalls(['const closer=windowCloser'],s);
  const {runInNewContext}=await import('node:vm');
  let closed=false;s.destroy=async()=>{closed=true;};
  const closing=runInNewContext('closer.request(destroy)',s);await tick();writes[1].done.reject(new Error('disk full'));await closing;
  assert.equal(closed,true);const boards=(file:string)=>JSON.parse(file).entries.map((e:{project:unknown})=>e.project);assert.deepEqual(boards(files[1]),boards(files[0]));assert.match(questions.at(-1)!,/Save every board as a backup file/);
});
test('redrawing the badge after an empty read or refusal never says a write is pending',async()=>{
  const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
  const main=readFileSync('src/main.ts','utf8');
  const expr=main.match(/\$\{(saveBadge\([^\n]*?\))\}<\/div>/)![1];
  for(const empty of [true,false]){
    const {s,reads,edit}=windowWithDisk();Object.assign(s,{saveBadge:(v:string)=>v});
    if(empty){const reading=s.reloadFromDisk();reads[0].resolve({data:null,path:'/old',revision:0});await reading;}else edit('bad\uD800');
    assert.equal(runInNewContext(expr,s),'unsaved');
  }
});
test('the format sentence follows the live backup and an edit during dispatch cannot change the checked bytes',async()=>{
  const {s,edit,files,press}=windowWithDisk();
  const {importedProject}=await import('../src/workspace/library');
  const {troubleDialog}=await import('../src/ui/notices');
  const line={textContent:''};
  Object.assign(s,{TextEncoder,importedProject,pageView:undefined,reimportable:(text:string)=>{try{importedProject(text,s.library);return true;}catch{return false;}},
    troubleKey:()=>'',icon:()=>'',troubleDialog,modalRoot:{querySelector:()=>line},showModal:(_t:string,_sub:string,body:string)=>{line.textContent=body;}});
  editorCalls(['function openTrouble('],s);
  s.library.entries=Array.from({length:200},(_,i)=>({...s.library.entries[0],project:{...s.project,id:i?'board-'+i:s.project.id}}));
  s.openTrouble({kind:'failed',detail:'size',retries:true});
  assert.match(line.textContent,/It is in the format Import board reads/);
  edit('broken\uD800');assert.doesNotMatch(line.textContent,/format Import board reads/);
  edit('good again');assert.match(line.textContent,/format Import board reads/);
  const pressed=press('disk-backup');edit('later\uD800');await pressed;
  assert.doesNotThrow(()=>importedProject(files[0],s.library));assert.equal(JSON.parse(files[0]).name,'good again');
});
test('a library-only write cannot acknowledge an older copy of the refused open board',async()=>{
  const {s,edit,writes}=windowWithDisk();
  s.project.reference='x'.repeat(MAX_PROJECT);edit('too large');
  assert.throws(()=>s.saveLibrary({...s.library,entries:s.library.entries.map((e:{pinned:boolean})=>({...e,pinned:true}))}));
  await tick();assert.equal(writes.length,0);assert.equal(s.saves.saved,false);
});
test('the all-board quit choice keeps its scope when a late write lands while the question is open',async()=>{
  const {s,reads,writes,edit,files}=windowWithDisk();
  const read=s.reloadFromDisk();reads[0].resolve({data:null,revision:0,path:'/old'});await read;
  edit('late');await tick();
  Object.assign(s,{nativeDesktop:false,StillSaving:class extends Error{},confirm:()=>{writes[0].done.resolve(1);return true;}});
  editorCalls(['async function askClose(','async function keepOnClose('],s);
  const choice=await s.askClose(new s.StillSaving());await s.saves.flush();assert.equal(s.saves.noCopy,false);
  await s.keepOnClose(choice);assert.equal(JSON.parse(files[0]).entries?.length,2);
});
