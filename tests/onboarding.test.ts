import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readOnboarding,writeOnboarding,welcomeHtml,sampleProject,tourSteps,tourCardHtml} from '../src/workspace/onboarding';
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
  assert.match(html,/샘플 프로젝트로 시작하기/);
  assert.match(welcomeHtml('en'),/Start with a sample project/);
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
