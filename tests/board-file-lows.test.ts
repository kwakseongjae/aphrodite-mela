/**
 * 0.3-R ⑦: Codex's P3 check4 lows that remain.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync, strToU8} from 'fflate';
import {readZip} from '../src/board-file.ts';
import {initialProject} from '../src/model.ts';

/** A board file with an empty 'pages/' folder entry; `mutate` changes that entry's central directory record. */
function withFolder(mutate: (view: DataView, at: number) => void): Uint8Array {
  const zip = zipSync({'board.json': strToU8(JSON.stringify({...initialProject(), aphroditeBoardFile: 1})), 'pages/': new Uint8Array(0)});
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22; while (view.getUint32(end, true) !== 0x06054b50) end--;
  let at = view.getUint32(end + 16, true);
  for (;;) { const n = view.getUint16(at + 28, true); const name = String.fromCharCode(...zip.subarray(at + 46, at + 46 + n)); if (name === 'pages/') break; at += 46 + n + view.getUint16(at + 30, true) + view.getUint16(at + 32, true); }
  mutate(view, at);
  return zip;
}

test('an empty folder entry is held to the checks every entry is: encrypted, packed some other way, a CRC, a header elsewhere', () => {
  assert.doesNotThrow(() => readZip(withFolder(() => {}), 1_000_000), 'an ordinary empty folder is fine');
  for (const [what, mutate] of [
    ['encrypted', (v: DataView, at: number) => v.setUint16(at + 8, v.getUint16(at + 8, true) | 1, true)],
    ['packed with method 99', (v: DataView, at: number) => v.setUint16(at + 10, 99, true)],
    ['a CRC for nothing', (v: DataView, at: number) => v.setUint32(at + 16, 0xdeadbeef, true)],
    ['a local header past the end', (v: DataView, at: number) => v.setUint32(at + 42, 0x7fffffff, true)],
    ['a local header that is another entry\'s', (v: DataView, at: number) => v.setUint32(at + 42, 0, true)],
  ] as const) assert.throws(() => readZip(withFolder(mutate), 1_000_000), Error, what);
});
