import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldCheck,shouldOffer,formatSize,updateNoticeHtml,koParticle,CHECK_INTERVAL,keepsCard,type UpdateInfo,progressLabel} from '../src/update-notice';

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

test('one card, four states, and never more than one thing to press',()=>{
  const info={current:'0.1.5',latest:'0.1.6',newer:true,url:'https://example.com/a.dmg',name:'a.dmg',size:31_094_147,
              notes:'https://example.com/notes',summary:['Updates that install themselves','Fifty-eight section layouts']};
  const buttons=(html:string)=>[...html.matchAll(/data-action="([a-z-]+)"/g)].map(m=>m[1]);
  const offer=updateNoticeHtml(info,'offer','ko');
  assert.match(offer,/<strong>0\.1\.6<\/strong>/,'the version is the headline, not a sentence');
  assert.ok(offer.includes('새 버전'));
  // Exactly one thing to press, and the rest live behind the dots where they cannot compete.
  const visible=buttons(offer.split('<details class="update-more"')[0]);
  assert.deepEqual(visible,['update-dismiss','update-install'],'close and install, nothing else');
  for(const hidden of ['update-notes','update-download','update-never'])assert.ok(buttons(offer).includes(hidden),`${hidden} is in the menu`);

  const working=updateNoticeHtml(info,'working','ko','42%');
  assert.match(working,/update-bar/,'progress is a bar, not a sentence');
  assert.ok(working.includes('42%'));
  assert.equal(buttons(working).filter(b=>b!=='update-install').length,0,'nothing to press or dismiss mid-download');
  assert.doesNotMatch(working,/update-more/,'the menu is gone while it works');

  const installing=updateNoticeHtml(info,'installing','ko');
  assert.ok(installing.includes('자리에 놓는 중'));
  const restart=updateNoticeHtml(info,'restart','ko');
  assert.ok(restart.includes('지금 다시 시작할까요?'));
  assert.ok(restart.includes('data-action="update-relaunch"'));
  assert.ok(restart.includes('data-action="update-later"'));
  assert.doesNotMatch(restart,/data-action="update-dismiss"/,'later is not a skipped version');
  assert.doesNotMatch(restart,/스스로 다시 열립니다/);
  const failed=updateNoticeHtml(info,'failed','en','Network unreachable');
  assert.ok(failed.includes('Network unreachable')&&failed.includes('Try again'));
});

test('what changed is answered in the card, not in a browser',()=>{
  const summary=['Updates that install themselves','An agent can drive it through MCP','Fifty-eight section layouts'];
  const info={current:'0.1.5',latest:'0.1.6',newer:true,url:'u',name:'n',summary};
  const html=updateNoticeHtml(info,'offer','ko');
  for(const line of summary)assert.ok(html.includes(line),line);
  assert.match(html,/<details class="update-summary"/,'folded away until asked for');
  assert.doesNotMatch(html,/ open>/,'and folded by default');
  assert.doesNotMatch(updateNoticeHtml({...info,summary:undefined},'offer','ko'),/update-summary/,'no notes, no empty section');
  assert.doesNotMatch(updateNoticeHtml(info,'working','ko','9%'),/update-summary/,'not while it downloads');
  const nasty={...info,summary:['<img src=x onerror="alert(1)">']};
  assert.doesNotMatch(updateNoticeHtml(nasty,'offer','en'),/<img/,'a release body is text, not markup');
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

test('a version number takes the particle its last digit calls for',()=>{
  for(const [version,subject,topic] of [['0.1.6','이','은'],['0.1.5','가','는'],['0.2.0','이','은'],['1.0.2','가','는'],['0.1.9','가','는'],['0.1.3','이','은']] as const){
    assert.equal(koParticle(version),subject,`${version}${subject}`);
    assert.equal(koParticle(version,'은는'),topic,`${version}${topic}`);
  }
});

/* The owner asked for the update everyone else ships: fetch it, put it in place, come back on the
   new version. The card leads with that and keeps the disk image for when the plugin cannot run —
   an older release that published no manifest, or an app that cannot write over itself. */
test('the card leads with installing in place and keeps the disk image behind it',()=>{
  const info={current:'0.1.5',latest:'0.2.0',newer:true,url:'https://example.com/a.dmg',name:'a.dmg',size:24_000_000,notes:'https://example.com/notes'};
  for(const [lang,install,fallback] of [['en','Install','Download the disk image'],['ko','설치하기','디스크 이미지로 받기']] as const){
    const html=updateNoticeHtml(info,'offer',lang);
    assert.match(html,/data-action="update-install"/);
    assert.ok(html.includes(install),`${lang} offers to install in place`);
    assert.match(html,/data-action="update-download"/);
    assert.ok(html.includes(fallback),`${lang} still offers the disk image`);
  }
  const installing=updateNoticeHtml(info,'installing','ko');
  assert.ok(installing.includes('자리에 놓는 중'),'installing does not restart on its own');
  assert.doesNotMatch(installing,/data-action="update-install"/,'nothing to press while it installs');
  const restart=updateNoticeHtml(info,'restart','en');
  assert.match(restart,/data-action="update-relaunch"/);
  assert.match(restart,/data-action="update-later"/);
  assert.doesNotMatch(restart,/data-action="update-relaunch"[\s\S]*data-action="update-relaunch"/);
  assert.equal(keepsCard('working','working'),true);
  assert.equal(keepsCard('installing','installing'),true);
  assert.equal(keepsCard('working','installing'),false,'a new state still draws a new card');
  assert.equal(keepsCard('offer','working'),false);
});

test('progress is only claimed when the size is known',()=>{
  assert.equal(progressLabel(0,1000,'ko'),'','nothing yet is not 0%');
  assert.equal(progressLabel(500,0,'ko'),'','a download with no declared size never guesses');
  assert.equal(progressLabel(500,undefined,'en'),'');
  assert.equal(progressLabel(1,1000,'ko'),'1%','a first chunk rounds up, never to nothing');
  assert.equal(progressLabel(500,1000,'en'),'50%');
  assert.equal(progressLabel(1200,1000,'en'),'100%','it never promises more than done');
});
