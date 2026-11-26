import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pushToast,expireToasts,dismissToast,nextExpiry,toastHtml,toastLife,TOAST_LIFE,TOAST_LIFE_MAX,TOAST_MAX,type Toast} from '../src/design/toasts';

const NOW=1_700_000_000_000;
const build=(...messages:string[])=>messages.reduce((list,m,i)=>pushToast(list,m,NOW+i,i+1),[] as Toast[]);

test('messages stack newest last',()=>{
  const list=build('저장했습니다','삭제했습니다');
  assert.deepEqual(list.map(t=>t.message),['저장했습니다','삭제했습니다']);
  assert.deepEqual(list.map(t=>t.count),[1,1]);
});

test('the same message twice is one line with a count, moved to the end',()=>{
  let list=build('삭제했습니다','저장했습니다');
  list=pushToast(list,'삭제했습니다',NOW+10,3);
  assert.deepEqual(list.map(t=>t.message),['저장했습니다','삭제했습니다']);
  assert.deepEqual(list.map(t=>t.count),[1,2]);
  assert.equal(list[1].at,NOW+10,'and its time starts again');
  assert.equal(list[1].id,1,'it keeps its identity rather than becoming a new toast');
});

test('only the last few are kept',()=>{
  const list=build('하나','둘','셋','넷','다섯');
  assert.equal(list.length,TOAST_MAX);
  assert.deepEqual(list.map(t=>t.message),['셋','넷','다섯']);
});

test('a message leaves after its time, and a bumped one gets more',()=>{
  const list=build('저장했습니다');
  assert.equal(expireToasts(list,NOW+TOAST_LIFE-1).length,1);
  assert.equal(expireToasts(list,NOW+TOAST_LIFE+1).length,0);
  const bumped=pushToast(list,'저장했습니다',NOW+TOAST_LIFE-100,2);
  assert.equal(expireToasts(bumped,NOW+TOAST_LIFE+1).length,1,'it is still on screen');
});

test('a person can dismiss one, and the sweep knows when to run next',()=>{
  const list=build('하나','둘');
  assert.deepEqual(dismissToast(list,list[0].id).map(t=>t.message),['둘']);
  assert.equal(nextExpiry([],NOW),0,'nothing waiting means no timer');
  assert.equal(nextExpiry(list,NOW),TOAST_LIFE,'the oldest decides');
  assert.equal(nextExpiry(list,NOW+TOAST_LIFE+5),0,'never negative');
});

test('an empty message is not a toast',()=>{
  assert.equal(pushToast([],'',NOW,1).length,0);
  assert.equal(pushToast([],'   ',NOW,1).length,0);
});

test('a message is escaped rather than pasted into the page',()=>{
  const list=pushToast([],'<img src=x onerror="alert(1)">',NOW,1);
  const html=toastHtml(list);
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
  assert.match(toastHtml(build('삭제','삭제')),/×2/);
  assert.match(html,/data-toast="1"/);
});

test('a longer line stays longer, so it can be read to the end, and none stays for good',()=>{
  const short='삭제했습니다',long='보드를 디스크에 쓰지 못했습니다. 백업 파일로 저장한 뒤 그 보드를 고치거나 지워 주세요. 이 창은 그대로 둡니다.';
  assert.equal(toastLife(short),TOAST_LIFE,'a short line keeps the time it always had');
  assert.ok(toastLife(long)>TOAST_LIFE);
  assert.ok(toastLife('가'.repeat(2000))<=TOAST_LIFE_MAX);
  const list=pushToast([],long,NOW,1);
  assert.equal(expireToasts(list,NOW+TOAST_LIFE+1).length,1,'it is still there when a short one would have gone');
  assert.equal(nextExpiry(list,NOW),toastLife(long));
});

test('a change that can be undone carries Undo, the same single step as the shortcut, while it is still the last change',()=>{
  const list=pushToast([],'컴포넌트를 삭제했습니다',NOW,1,{undo:'p1:7'});
  assert.equal(list[0].undo,'p1:7');
  const live=toastHtml(list,{undo:'p1:7',ko:true});
  assert.deepEqual([...live.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]),['undo'],'the button is the undo the shortcut runs');
  assert.match(live,/>되돌리기</);
  assert.doesNotMatch(toastHtml(list,{undo:'p1:8',ko:true}),/data-action/,'once another change lands, pressing it would undo that one instead, so it goes');
  assert.doesNotMatch(toastHtml(list),/data-action/);
  assert.doesNotMatch(live,/<button[^>]*data-toast/,'a button is never put inside a button');
  assert.match(live,/data-undo-for="p1:7"/,'and it names its change, so a press that comes after another change does nothing');
  assert.ok(toastLife('컴포넌트를 삭제했습니다',true)>toastLife('컴포넌트를 삭제했습니다'),'and stays a little longer, to be reached');
});
