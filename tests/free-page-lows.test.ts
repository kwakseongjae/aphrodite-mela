/**
 * 0.3-R ⑦, the brief's §4 (Codex P3 Part B, low).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageText, htmlWindow} from '../src/free-page.ts';

test('a head left open ends where the browser ends it: the body\'s words are read', () => {
  assert.equal(pageText('<head><title>T</title><body><p>Shown</p>'), 'Shown\n');
  assert.equal(pageText('<head><meta charset="utf-8"><p>Also shown</p>'), 'Also shown\n', 'a tag that cannot be in a head closes it');
  assert.equal(pageText('<head><title>Title</title><style>p{}</style></head><body><h1>Body</h1></body>'), '# Body\n', 'a closed head is still left out, title and all');
  assert.equal(pageText('<head><title>A <b> title</title></head><p>x</p>'), 'x\n', 'a title is text up to its own end, whatever it holds');
});

test('a window holds exactly the code units asked for, never borrowing the one before a lone low half', () => {
  const lone = htmlWindow('a\uDC00b', {start: 1, end: 2});
  assert.deepEqual([lone.start, lone.end, [...lone.html].map(c => c.charCodeAt(0))], [1, 2, [0xDC00]]);
  const emoji = 'x\u{1F600}y';
  assert.deepEqual([htmlWindow(emoji, {start: 2, end: 4}).start, htmlWindow(emoji, {start: 0, end: 2}).end], [1, 1], 'a whole pair at either edge is still not cut');
});
