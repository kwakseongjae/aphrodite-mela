import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject} from '../src/model';
import {entryFor} from '../src/workspace/library';
import {workspaceHome,projectCards} from '../src/workspace/home';
import {readFileSync} from 'node:fs';
test('preview tokens remain project-owned in both home themes',()=>{
 const p=initialProject();p.system.background='#fffaf0';p.system.foreground='#203040';p.system.accent='#cc8800';p.pages[0].blocks=[];const library={version:1 as const,entries:[entryFor(p)]};const before=JSON.stringify(library);
 for(const theme of ['system','light','dark'] as const){const html=workspaceHome(library,'recent','','',theme);assert.ok(html.includes('--preview-paper:#fffaf0;--preview-ink:#203040;--preview-accent:#cc8800'));assert.doesNotMatch(html,/data-theme=/);}
 assert.equal(JSON.stringify(library),before);const cards=projectCards(library,'recent','');assert.match(cards,/1 page · /);assert.match(cards,/<a href="#" class="folio-open ui-board-card-thumb"/);assert.doesNotMatch(cards,/<button class="folio-open/);
});
/* The midnight home is the dark theme; a board's preview keeps the board's own ink in either, and nothing in the screen sheet paints over it. */
test('preview glyphs use the board ink, whatever the theme',()=>{
 const p=initialProject();p.system.background='#fffaf0';p.system.foreground='#203040';p.pages[0].blocks=[];
 const cards=projectCards({version:1,entries:[entryFor(p)]},'recent','');
 assert.match(cards,/class="folio-open ui-board-card-thumb"[^>]*style="[^"]*background:#fffaf0;color:#203040"/);
 const css=readFileSync('src/ui/screens/home.css','utf8');
 for(const rule of css.match(/\.ui-home-type[^{]*\{[^}]*\}/g)??[])assert.doesNotMatch(rule.split('{')[1],/(?:^|;|\s)color:/,rule);
});
