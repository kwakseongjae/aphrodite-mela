/**
 * 0.3-P1: an agent reads an html page two ways — its html exactly as stored, a window at a time, and
 * its words without the markup — and the contract says which pages are html.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, type Project} from '../src/model.ts';
import {parseAgentCommand} from '../src/agent/bridge.ts';
import {isRead} from '../src/agent/authority.ts';
import {pageHtmlRead, pageTextRead, designContract, renderRefusal} from '../src/agent/contract.ts';
import {commandById} from '../src/agent/commands.mjs';

const HTML = '<!doctype html><html><body><h1>Week 47</h1><p>Shipped the ledger.</p><script>1</script></body></html>';
function project(): Project {
  const p = initialProject();
  p.pages.push({id: 'free-1', name: 'Briefing', blocks: [], kind: 'html', html: HTML});
  return p;
}

test('the bridge reads html and text as reads, with a page id and an optional window', () => {
  const html = parseAgentCommand('html', {page_id: 'free-1', start: '10', end: '40'});
  assert.deepEqual('command' in html && html.command, {kind: 'html', pageId: 'free-1', start: 10, end: 40});
  assert.deepEqual('command' in parseAgentCommand('text', {page_id: 'free-1'}) && parseAgentCommand('text', {page_id: 'free-1'}), {command: {kind: 'text', pageId: 'free-1'}});
  for (const bad of [{}, {page_id: 'bad id'}, {page_id: 'free-1', start: -1}, {page_id: 'free-1', start: 'x'}, {page_id: 'free-1', start: 9, end: 3}]) assert.ok('error' in parseAgentCommand('html', bad), JSON.stringify(bad));
  assert.ok('error' in parseAgentCommand('text', {}));
  assert.ok(isRead('html') && isRead('text'), 'reading a page needs no open door');
  assert.equal(commandById['read.html'].grade, 'read');
  assert.equal(commandById['read.text'].grade, 'read');
});

test('a page\'s html comes back exactly as stored, with its length and where the window is', () => {
  const p = project();
  assert.deepEqual(pageHtmlRead(p, {pageId: 'free-1'}), {ok: true, page_id: 'free-1', name: 'Briefing', start: 0, end: HTML.length, length: HTML.length, more: false, html: HTML});
  const part = pageHtmlRead(p, {pageId: 'free-1', start: 27, end: 42}) as {html: string; more: boolean};
  assert.equal(part.html, HTML.slice(27, 42));
  assert.equal(part.more, true);
  assert.match((pageHtmlRead(p, {pageId: p.pages[0].id}) as {error: string}).error, /section page.*aphrodite_get_contract/);
  assert.match((pageHtmlRead(p, {pageId: 'nope'}) as {error: string}).error, /no page "nope"/);
});

test('the words of a page leave its markup and scripts behind', () => {
  const p = project();
  const read = pageTextRead(p, {pageId: 'free-1'}) as {text: string};
  assert.equal(read.text, '# Week 47\n\nShipped the ledger.\n');
  assert.match((pageTextRead(p, {pageId: p.pages[0].id}) as {error: string}).error, /section page/);
});

test('the contract names an html page as one and says how long it is, without the html', () => {
  const contract = designContract(project(), '') as {pages: Record<string, unknown>[]};
  const free = contract.pages.find(p => p.page_id === 'free-1')!;
  assert.equal(free.kind, 'html');
  assert.equal(free.html_length, HTML.length);
  assert.ok(!JSON.stringify(contract).includes('Shipped the ledger'), 'the contract does not carry the page');
  assert.equal(contract.pages[0].kind, undefined, 'a section page reads as it always has');
});

test('a picture of an html page waits for the frame that holds it (P2), and says how to read the page instead', () => {
  const p = project();
  assert.match(renderRefusal(p.pages[1]) ?? '', /aphrodite_get_page_html/);
  assert.equal(renderRefusal(p.pages[0]), undefined);
});
