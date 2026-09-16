import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldCheck,shouldOffer,formatSize,updateNoticeHtml,koParticle,CHECK_INTERVAL,type UpdateInfo,progressLabel} from '../src/update-notice';

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

test('the Korean subject particle follows how the last digit is read aloud',()=>{
  const cases:[string,string][]=[['0.1.0','이'],['0.1.1','이'],['0.1.2','가'],['0.1.3','이'],['0.1.4','가'],['0.1.5','가'],['0.1.6','이'],['0.1.7','이'],['0.1.8','이'],['0.1.9','가'],['1.2.10','이']];
  for(const [version,particle] of cases)assert.equal(koParticle(version),particle,version);
  assert.match(updateNoticeHtml({...offer,latest:'0.1.5'},'offer','ko'),/0\.1\.5가 나왔습니다/);
  assert.match(updateNoticeHtml({...offer,latest:'0.1.6'},'offer','ko'),/0\.1\.6이 나왔습니다/);
});

/* The owner asked for the update everyone else ships: fetch it, put it in place, come back on the
   new version. The card leads with that and keeps the disk image for when the plugin cannot run —
   an older release that published no manifest, or an app that cannot write over itself. */
test('the card leads with installing in place and keeps the disk image behind it',()=>{
  const info={current:'0.1.5',latest:'0.2.0',newer:true,url:'https://example.com/a.dmg',name:'a.dmg',size:24_000_000,notes:'https://example.com/notes'};
  for(const [lang,install,fallback] of [['en','Install and restart','Download the disk image'],['ko','설치하고 재시작','디스크 이미지로 받기']] as const){
    const html=updateNoticeHtml(info,'offer',lang);
    assert.match(html,/data-action="update-install"/);
    assert.ok(html.includes(install),`${lang} offers to install in place`);
    assert.match(html,/data-action="update-download"/);
    assert.ok(html.includes(fallback),`${lang} still offers the disk image`);
  }
  const installing=updateNoticeHtml(info,'installing','ko');
  assert.ok(installing.includes('스스로 다시 열립니다'),'it says the app will come back by itself');
  assert.doesNotMatch(installing,/data-action="update-install"/,'nothing to press while it installs');
});

test('progress is only claimed when the size is known',()=>{
  assert.equal(progressLabel(0,1000,'ko'),'','nothing yet is not 0%');
  assert.equal(progressLabel(500,0,'ko'),'','a download with no declared size never guesses');
  assert.equal(progressLabel(500,undefined,'en'),'');
  assert.equal(progressLabel(1,1000,'ko'),'1%','a first chunk rounds up, never to nothing');
  assert.equal(progressLabel(500,1000,'en'),'50%');
  assert.equal(progressLabel(1200,1000,'en'),'100%','it never promises more than done');
});
