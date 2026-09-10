import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject} from '../src/model';
import {entryFor} from '../src/workspace/library';
import {workspaceHome,projectCards} from '../src/workspace/home';
import {readFileSync} from 'node:fs';
test('preview tokens remain project-owned in both home themes',()=>{
 const p=initialProject();p.system.background='#fffaf0';p.system.foreground='#203040';p.system.accent='#cc8800';p.pages[0].blocks=[];const library={version:1 as const,entries:[entryFor(p)]};const before=JSON.stringify(library);
 for(const night of [false,true]){const html=workspaceHome(library,'recent','','',night);assert.ok(html.includes('--preview-paper:#fffaf0;--preview-ink:#203040;--preview-accent:#cc8800'));assert.equal(html.includes('folio-night'),night);}
 assert.equal(JSON.stringify(library),before);const cards=projectCards(library,'recent','');assert.match(cards,/1 page <b>/);assert.match(cards,/<a href="#" class="folio-open"/);assert.doesNotMatch(cards,/<button class="folio-open"/);
});
test('WebKit preview glyphs use preview ink, independent of button foreground',()=>{
 const css=readFileSync('src/workspace/home.css','utf8');assert.match(css,/-webkit-text-fill-color:var\(--preview-ink\)/);assert.match(css,/appearance:none/);assert.match(css,/\.folio-home \.folio-info h3\{color:var\(--ink\)/);
});
