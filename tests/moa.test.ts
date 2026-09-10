import test from 'node:test';
import assert from 'node:assert/strict';
import {moaPage} from '../src/moa';
import {initialProject,parseProject} from '../src/model';
import {sceneManifest} from '../src/components';
import {moaHtml} from '../src/moa-render';
test('Moa recipe is 21 editable nodes, five lanes and ten task cards, round-trip safe',()=>{
 const p=initialProject(),page=moaPage();p.pages=[page];p.activePageId=page.id;
 const q=parseProject(JSON.stringify(p));assert.equal(q.pages[0].blocks.length,21);
 assert.equal(page.blocks.filter(b=>b.variant==='app-lane').length,5);
 assert.equal(page.blocks.filter(b=>b.kind==='moacard').length,10);
 assert.equal(sceneManifest(q).pages[0].nodes.length,21);
 for(const card of page.blocks.filter(b=>b.kind==='moacard'))assert.equal(page.blocks.find(b=>b.id===card.parentId)?.variant,'app-lane');
});
test('task metadata is escaped and sample status totals derive from ten cards',()=>{
 const page=moaPage(),cards=page.blocks.filter(b=>b.kind==='moacard');
 assert.deepEqual(['진행 중','검토 대기','완료'].map(s=>cards.filter(c=>c.text.split('|')[3]===s).length),[4,3,3]);
 cards[0].text='\"><script>alert(1)</script>|<img onerror=x>|\" autofocus|완료|보통';
 const html=moaHtml(cards[0]);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;'));
});
