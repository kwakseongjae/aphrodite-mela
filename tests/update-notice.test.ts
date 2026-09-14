import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldCheck,shouldOffer,formatSize,updateNoticeHtml,CHECK_INTERVAL,type UpdateInfo} from '../src/update-notice';

const offer:UpdateInfo={current:'0.1.5',latest:'0.1.6',newer:true,name:'Aphrodite_0.1.6_aarch64.dmg',url:'https://github.com/kwakseongjae/aphrodite-mela/releases/download/v0.1.6/Aphrodite_0.1.6_aarch64.dmg',size:12_600_000,notes:'https://github.com/kwakseongjae/aphrodite-mela/releases/tag/v0.1.6'};

test('the release feed is asked at most once every few hours, and never when turned off',()=>{
  const now=1_700_000_000_000;
  assert.equal(shouldCheck(now,null,null),true,'a first launch checks');
  assert.equal(shouldCheck(now,String(now-CHECK_INTERVAL-1),null),true);
  assert.equal(shouldCheck(now,String(now-1000),null),false,'a relaunch a second later does not');
  assert.equal(shouldCheck(now,'not a number',null),true);
  assert.equal(shouldCheck(now,String(now+CHECK_INTERVAL*5),null),true,'a clock that jumped backwards still recovers');
  assert.equal(shouldCheck(now,null,'1'),false,'turned off means never');
});

test('only a newer version the person has not waved away is offered',()=>{
  assert.equal(shouldOffer(offer,null),true);
  assert.equal(shouldOffer(offer,'0.1.6'),false,'declining 0.1.6 silences 0.1.6');
  assert.equal(shouldOffer(offer,'0.1.5'),true,'declining an older one does not silence this one');
  assert.equal(shouldOffer({current:'0.1.5',latest:'0.1.5',newer:false},null),false);
  assert.equal(shouldOffer({...offer,url:undefined},null),false,'no download, no offer');
  assert.equal(shouldOffer({...offer,name:undefined},null),false);
});

test('sizes read the way a person expects',()=>{
  assert.equal(formatSize(12_600_000),'12.0 MB');
  assert.equal(formatSize(1024*1024),'1.0 MB');
  assert.equal(formatSize(4096),'4 KB');
  assert.equal(formatSize(0),'');
  assert.equal(formatSize(undefined),'');
});

test('the card says what it is about and offers the right action for its state',()=>{
  const waiting=updateNoticeHtml(offer,'offer','ko');
  assert.match(waiting,/0\.1\.6/);
  assert.match(waiting,/현재 0\.1\.5/);
  assert.match(waiting,/data-action="update-download"/);
  assert.match(waiting,/data-action="update-dismiss"/);
  assert.match(waiting,/data-action="update-never"/);
  assert.match(waiting,/data-action="update-notes"/);

  const busy=updateNoticeHtml(offer,'working','en');
  assert.match(busy,/disabled/);
  assert.doesNotMatch(busy,/data-action="update-download"/,'no second download while one is running');

  const done=updateNoticeHtml(offer,'ready','en');
  assert.match(done,/data-action="update-open"/);
  assert.match(done,/data-action="update-reveal"/);
  assert.match(done,/Downloads folder/);

  const broken=updateNoticeHtml(offer,'failed','en','the network went away');
  assert.match(broken,/the network went away/);
  assert.match(broken,/Try again/);
});

test('a failure message is escaped rather than pasted into the page',()=>{
  const html=updateNoticeHtml(offer,'failed','en','<img src=x onerror="alert(1)">');
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
  const named=updateNoticeHtml({...offer,latest:'<b>1</b>'},'offer','en');
  assert.doesNotMatch(named,/<b>/);
});

test('a release with no notes link offers no notes button',()=>{
  assert.doesNotMatch(updateNoticeHtml({...offer,notes:undefined},'offer','en'),/update-notes/);
});
