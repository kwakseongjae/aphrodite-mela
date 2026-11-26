import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readOnboarding,writeOnboarding,welcomeHtml,sampleProject,tourSteps,tourCardHtml} from '../src/workspace/onboarding';
import {personAt} from '../src/agent/dispatch';
import {newBoard,hasSectionPage} from '../src/editor/starter';
import {editorActions,editorCalls,noop} from './support/editor-calls';
import {parseProject} from '../src/model';

test('onboarding state is tolerant of garbage and round-trips',()=>{
  const store=new Map<string,string>();
  const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}};
  assert.deepEqual(readOnboarding(storage),{welcomed:false,toured:false});
  store.set('aphrodite-onboarding-v1','{nope');
  assert.deepEqual(readOnboarding(storage),{welcomed:false,toured:false});
  writeOnboarding(storage,{welcomed:true,toured:false});
  assert.deepEqual(readOnboarding(storage),{welcomed:true,toured:false});
});

test('the welcome sheet offers a language choice, a sample and a blank start',()=>{
  const html=welcomeHtml('ko');
  assert.match(html,/data-action="set-language" data-lang="en"/);
  assert.match(html,/data-action="welcome-sample"/);
  assert.match(html,/data-action="welcome-blank"/);
  assert.match(html,/data-action="welcome-dismiss"/);
  assert.match(html,/샘플 보드로 시작하기/);
  assert.match(welcomeHtml('en'),/Start with a sample board/);
});

test('the sample project parses, has a desktop and a mobile frame, and keeps the content language',()=>{
  const p=parseProject(JSON.stringify(sampleProject('ko')));
  assert.equal(p.pages.length,2);
  assert.equal(p.contentLanguage,'ko');
  const frames=Object.values(p.space!.frames);
  assert.deepEqual(frames.map(f=>f.preset).sort(),['desktop','mobile']);
  assert.ok(p.pages[0].blocks.length>=4&&p.pages[1].blocks.length>=3);
  assert.notEqual(sampleProject('en').id,sampleProject('en').id,'fresh id each time');
});

test('the tour has five anchored steps and the last card says start',()=>{
  const steps=tourSteps('en');
  assert.equal(steps.length,5);
  assert.ok(steps.every(s=>s.target&&s.title&&s.body));
  assert.match(tourCardHtml(steps[0],0,5,'ko'),/data-action="tour-next"/);
  assert.match(tourCardHtml(steps[4],4,5,'ko'),/시작하기/);
  assert.doesNotMatch(tourCardHtml(steps[4],4,5,'en'),/data-action="tour-next"/);
});

test('the first-run tour counts visible targets and names the shortcuts a new board offers',async()=>{
  for(const uiLanguage of ['en','ko'] as const){
    const project=newBoard('First board'),app={dataset:{tour:''}},tourRoot={hidden:true,innerHTML:'',querySelector:()=>({style:{},offsetWidth:320,offsetHeight:140})};
    let searchVisible=true;
    const targets=new Set(['.dock','.panel-search','.dock-modes']);
    const document={querySelectorAll:()=>[],querySelector:(selector:string)=>{
      const visible=targets.has(selector),width=visible?100:0;
      return {classList:{add:noop},checkVisibility:()=>true,closest:()=>selector==='.panel-search'&&!searchVisible?{getBoundingClientRect:()=>({left:0,right:0,top:0,bottom:800})}:null,
        getBoundingClientRect:()=>({left:20,top:30,right:20+width,bottom:30+width,width,height:width})};
    }};
    const screen={...editorActions(project),app,document,uiLanguage,tourRoot,tourSteps,tourCardHtml,hasSectionPage,
      tourIndex:-1,fitAll:noop,hydrateIcons:noop,innerWidth:1000,innerHeight:800};
    editorCalls(['function startTour(','function positionTour(','function tourActive(','async function action('],screen);
    const {startTour,action}=screen as typeof screen & {startTour:Function;action:Function};
    const next=()=>action({dataset:{action:'tour-next'}},personAt({isTrusted:true}),true);
    startTour();assert.equal(app.dataset.tour,'dock');
    assert.doesNotMatch(tourRoot.innerHTML,/\b[ARG] |Get Vibe/);
    assert.match(tourRoot.innerHTML,/1 \/ 3/);
    await next();assert.equal(app.dataset.tour,'search');assert.match(tourRoot.innerHTML,/2 \/ 3/);
    assert.doesNotMatch(tourRoot.innerHTML,/a component|컴포넌트/);
    await next();assert.equal(app.dataset.tour,'agent');assert.match(tourRoot.innerHTML,/3 \/ 3/);
    assert.doesNotMatch(tourRoot.innerHTML,/data-action="tour-next"/);
    searchVisible=false;startTour();assert.match(tourRoot.innerHTML,/1 \/ 2/);
    await next();assert.equal(app.dataset.tour,'agent');
  }
});
