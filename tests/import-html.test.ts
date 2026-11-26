import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newBoard} from '../src/editor/starter';
import {ensureSpace, frameWidth} from '../src/editor/space';
import {agentDispatch, personAt, sourceFor, type Dispatch} from '../src/agent/dispatch';
import {runBatch} from '../src/agent/apply';
import {begin, end, newHistory, stepForScreen} from '../src/ledger/session';
import {designOf} from '../src/ledger/ledger';
import {MAX_PAGE_HTML, mediaNamed} from '../src/free-page';
import {importHtml, type ImportTarget} from '../src/import/html';

const person = personAt({isTrusted: true})!;
const fixture = (name: string) => readFileSync(new URL('./fixtures/import-html/' + name, import.meta.url));
function setup() {
  const project = newBoard('Test');
  ensureSpace(project);
  const history = newHistory(project);
  const target: ImportTarget = {current: () => project, defaultName: n => 'Sheet ' + n,
    commit(change, dispatch, row) {
      const before = begin(project, history);
      change();
      end(project, before, {author: dispatch.author, source: sourceFor(row)}, history);
    }};
  return {project, target, history};
}

test('a pasted document is the same page and frame as html_page, with the person on its ledger', async () => {
  const {project, target} = setup(), html = fixture('self.html').toString();
  const agent = runBatch(project, {ops: [{op: 'html_page', name: 'Ink & paper', html, width: 834}]}, '');
  assert.ok(agent.ok);
  const report = await importHtml({text: html}, person, target);
  assert.deepEqual(report.pages, [{id: project.pages[1].id, name: 'Ink & paper'}]);
  assert.deepEqual({...project.pages[1], id: ''}, {...agent.project.pages[1], id: ''});
  assert.deepEqual(project.space!.frames[project.pages[1].id], agent.project.space!.frames[agent.created[0]]);
  assert.equal(project.ledger!.changes.length, 1);
  assert.deepEqual(project.ledger!.changes[0].author, person.author);
  assert.equal(project.ledger!.changes[0].source, 'board:import-html');
});

test('the byte decoder prefers a BOM, then the real meta charset, and replaces bad UTF-8', async () => {
  for (const [bytes, name] of [
    [Buffer.from('<meta charset=windows-1252><title>Café</title>', 'latin1'), 'Café'],
    [Buffer.from('<title>Café</title>', 'latin1'), 'Caf�'],
    [Buffer.from('\ufeff<meta charset=windows-1252><title>Café</title>', 'utf16le'), 'Café'],
    [Buffer.from('<!-- <meta charset=windows-1252> --><title>Café</title>'), 'Café'],
  ] as const) {
    const {project, target} = setup();
    assert.equal((await importHtml({text: bytes}, person, target)).pages[0].name, name);
    assert.equal(frameWidth(project.space!.frames[project.pages[1].id]), 1440);
  }
});

test('a file or paste at the page limit fits, while large, empty and non-HTML documents return codes', async () => {
  const {project, target} = setup();
  const html = '<p>' + 'x'.repeat(MAX_PAGE_HTML - 3);
  assert.equal((await importHtml({text: html}, person, target)).pages[0].name, 'Sheet 1');
  for (const [name, text, code] of [['a.htm', html + 'x', 'too_large'], ['a.html', '  ', 'empty'],
    ['code.tsx', '<main>Hello</main>', 'not_html'], ['readme.md', '<b>Hello</b>', 'not_html'], ['', '# plain text', 'not_html']]) {
    assert.deepEqual((await importHtml({name, text}, person, target)).documents, [{name, code}]);
  }
  const file = new File(['<main>Hello</main>'], 'Demo.htm');
  assert.equal((await importHtml({text: file}, person, target)).pages[0].name, 'Demo.htm');
  assert.equal(project.ledger!.changes.length, 2);
});

test('the import refuses an agent, a forged person and untrusted input before reading anything', async () => {
  const {project, target} = setup();
  let reads = 0;
  const input = {names: ['a.html'], read: async () => { reads++; return fixture('self.html'); }, media: async () => { throw 'missing'; }};
  for (const d of [agentDispatch('agent', 'mcp'), {...person} as Dispatch, undefined]) {
    await assert.rejects(importHtml(input, d, target), e => e === 'person_only');
  }
  assert.equal(reads, 0);
  assert.equal(project.ledger?.changes.length ?? 0, 0);
});
