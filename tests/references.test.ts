import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inReferenceScope,sourceLabel,addedLabel,referencesPanelHtml,posterRef,type Reference} from '../src/design/references';

const entry=(over:Partial<Reference>={}):Reference=>({id:'a1',kind:'link',scope:'shared',url:'https://www.example.com/a',title:'A lamp',addedAt:'2026-09-16T09:00:00Z',addedBy:'claude-code',...over});

test('a chip shows its own scope, and All shows both',()=>{
  const entries=[entry({id:'a',scope:'shared'}),entry({id:'b',scope:'project'}),entry({id:'c',scope:'project'})];
  assert.equal(inReferenceScope(entries,'all').length,3);
  assert.equal(inReferenceScope(entries,'project').length,2);
  assert.equal(inReferenceScope(entries,'shared').length,1);
});

test('the source badge is a host, and a malformed address does not throw',()=>{
  assert.equal(sourceLabel(entry()),'example.com','www is dropped');
  assert.equal(sourceLabel(entry({url:'not a url'})),'');
  assert.equal(sourceLabel(entry({url:undefined})),'');
});

test('the meta line names who kept it and when',()=>{
  assert.equal(addedLabel(entry(),false),'claude-code · 2026-09-16');
  assert.equal(addedLabel(entry({addedBy:''}),false),'2026-09-16','no name, just the day');
});

/**
 * Titles and notes can come off someone else's page or from an agent. They are text to look at, not
 * markup to run, and certainly not instructions.
 */
test('what an entry says cannot become markup',()=>{
  const html=referencesPanelHtml([entry({title:'<img src=x onerror=alert(1)>',note:'"><script>alert(2)</script>'})],'all',false,true);
  // Escaping the angle brackets is the whole job: `onerror=` as plain text opens nothing.
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.doesNotMatch(html,/"><script/,'a quote cannot close an attribute and open a tag');
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html,/&lt;script&gt;/);
});

test('an empty archive says what to do, not nothing',()=>{
  const html=referencesPanelHtml([],'all',true,true);
  assert.match(html,/아직 아무것도 없습니다/);
  assert.doesNotMatch(html,/reference-card/);
});

test('the browser build says where the archive lives instead of showing an empty one',()=>{
  const html=referencesPanelHtml([entry()],'all',false,false);
  assert.match(html,/desktop app only/);
  assert.doesNotMatch(html,/reference-card/);
});

test('a card offers promotion, and only a link offers its source',()=>{
  const linked=referencesPanelHtml([entry()],'all',false,true);
  assert.match(linked,/data-action="reference-promote"/);
  assert.match(linked,/data-action="reference-open"/);
  const noted=referencesPanelHtml([entry({kind:'note',url:undefined,title:'warm and editorial'})],'all',false,true);
  assert.doesNotMatch(noted,/data-action="reference-open"/,'there is nothing to open');
});

test('a dead link keeps its card and says so',()=>{
  const html=referencesPanelHtml([entry({alive:false})],'all',false,true);
  assert.match(html,/reference-gone/);
  assert.match(html,/original gone/);
});

test('a poster is requested through the app, never as a file path',()=>{
  const html=referencesPanelHtml([entry({poster:'ab12cd34ef567890'})],'all',false,true);
  assert.match(html,new RegExp(`src="${posterRef('ab12cd34ef567890')}"`));
  assert.doesNotMatch(html,/file:|\.\.\//);
});

import {parseAgentCommand} from '../src/agent/bridge';
import {isRead,isWrite,gateFor} from '../src/agent/authority';

/**
 * Reading the archive is a read — an agent must be able to see what was kept without the door being
 * opened. Putting something *into* it is a write, because the archive is the person's.
 */
test('looking is a read, keeping is a write',()=>{
  assert.equal(isRead('references'),true);
  assert.equal(isWrite('references'),false);
  assert.equal(isWrite('keep'),true);
  assert.equal(isRead('keep'),false);
  assert.equal(gateFor({kind:'keep'}),'keep');
});

test('keep takes an address, a title or a note, and refuses nothing at all',()=>{
  const bad=parseAgentCommand('keep',{});
  assert.match('error' in bad?bad.error:'',/something to keep/);
  const ok=parseAgentCommand('keep',{url:'https://example.com',tags:['a','b']});
  assert.ok('command' in ok);
  const noted=parseAgentCommand('keep',{note:'the grid breathes'});
  assert.ok('command' in noted,'a note with no address is still worth keeping');
});

test('an address a browser would not open is refused',()=>{
  for(const url of ['javascript:alert(1)','file:///etc/passwd','ftp://x/y']){
    const out=parseAgentCommand('keep',{url});
    assert.ok('error' in out,`${url} should be refused`);
  }
});

test('keep defaults to this project, and tags are cleaned at the edge',()=>{
  const out=parseAgentCommand('keep',{url:'https://example.com',tags:['  a  ','','b','x'.repeat(90),...Array.from({length:30},(_,i)=>`t${i}`)]});
  assert.ok('command' in out);
  const command=out.command as {scope:string;tags:string[]};
  assert.equal(command.scope,'project','an agent keeps things with the project unless it says otherwise');
  assert.equal(command.tags.length,12);
  assert.equal(command.tags[0],'a');
  assert.equal(command.tags[2].length,40);
});
