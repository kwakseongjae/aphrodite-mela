/**
 * 0.3-P1: an agent reads an html page two ways — its html exactly as stored, a window at a time, and
 * its words without the markup — and the contract says which pages are html.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject, type Project} from '../src/model.ts';
import {parseAgentCommand} from '../src/agent/bridge.ts';
import {isRead} from '../src/agent/authority.ts';
import {pageHtmlRead, pageTextRead, designContract, renderRefusal, changesForReply, REPLY_OPS} from '../src/agent/contract.ts';
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

test('an html page is photographed, held in its frame (0.3-P2); a media item has no page to draw', () => {
  const p = project();
  assert.equal(renderRefusal(p.pages[1]), undefined);
  assert.equal(renderRefusal(p.pages[0]), undefined);
  assert.match(renderRefusal({id: 'm', name: 'Clip', blocks: [], kind: 'media'} as never) ?? '', /media item/);
});

/* 0.3-P1-fix1: a reply that lists changes keeps their ops to 200,000 characters in all, leaving out the
   biggest first. The ledger itself is not touched; what was left out is read from the page as it is now. */
test('the changes in a reply carry at most 200,000 characters of ops, the biggest left out first', () => {
  const change = (seq: number, chars: number) => ({seq, anchors: {pages: ['free-1'], nodes: []}, size: chars + 300, ops: [{op: 'set', on: 'page', page_id: 'free-1', field: 'html', value: 'x'.repeat(chars)}]});
  const small = [change(1, 1_000), change(2, 2_000)];
  assert.deepEqual(changesForReply(small), {changes: small}, 'a reply under the limit is left as it is');
  const mixed = [change(1, 150_000), change(2, 5_000), change(3, 120_000), change(4, 90_000)];
  const reply = changesForReply(mixed);
  const kept = reply.changes.filter(c => !('ops_omitted' in c));
  assert.ok(JSON.stringify(kept.map(c => (c as {ops: unknown}).ops)).length <= REPLY_OPS);
  assert.deepEqual(reply.changes.map(c => 'ops_omitted' in c ? c.seq : -c.seq), [1, -2, 3, -4], 'the two biggest go, in place, the rest stay');
  const omitted = reply.changes[0] as Record<string, unknown>;
  assert.deepEqual([omitted.ops_omitted, omitted.size, omitted.ops, omitted.anchors], [true, 150_300, undefined, {pages: ['free-1'], nodes: []}]);
  assert.match(reply.note ?? '', /aphrodite_get_page_html/);
  assert.equal(mixed[0].ops.length, 1, 'the changes passed in are not touched');
});
