import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pushToast,expireToasts,dismissToast,nextExpiry,toastHtml,TOAST_LIFE,TOAST_MAX,type Toast} from '../src/design/toasts';

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
