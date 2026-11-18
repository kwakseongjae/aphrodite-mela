/**
 * 0.3-P1-fix2: the desktop app's library file is held to what the Rust side will write, in the unit it
 * counts — UTF-8 bytes — and an agent's batch is measured against it before it lands, from above and
 * without recording anything. A batch that does not grow the design is never refused for it.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject, type Project} from '../src/model.ts';
import {upsertProject, libraryRefusal, utf8Length, LIBRARY_LIMIT_BYTES, BROWSER_LIBRARY_ESTIMATE, type Library} from '../src/workspace/library.ts';

const DESKTOP = {limit: LIBRARY_LIMIT_BYTES, unit: 'bytes' as const};
const BROWSER = {limit: BROWSER_LIBRARY_ESTIMATE, unit: 'chars' as const};
const korean = (pages: number, last = 1_900_000): Project => {
  const p = initialProject();
  p.pages = Array.from({length: pages}, (_, i) => ({id: `free-${i}`, name: `쪽 ${i}`, blocks: [], kind: 'html' as const, html: '한'.repeat(i === pages - 1 ? last : 1_900_000)}));
  p.activePageId = 'free-0';
  return p;
};
const libraryOf = (p: Project): Library => upsertProject({version: 1, entries: []}, p);

test('the limit is the one the Rust side refuses to write past, and it counts bytes', () => {
  const rust = readFileSync(new URL('../src-tauri/src/workspace.rs', import.meta.url), 'utf8');
  const written = rust.match(/if data\.len\(\) > ([\d_]+)/);
  assert.ok(written, 'workspace.rs still checks data.len() before it writes');
  assert.equal(LIBRARY_LIMIT_BYTES, Number(written![1].replace(/_/g, '')));
  for (const text of ['', 'abc', '한글', '😀', JSON.stringify('\ud800'), 'é'.repeat(1000)]) assert.equal(utf8Length(text), Buffer.byteLength(text, 'utf8'), text);
});

test('Korean html that is well inside the limit in characters but past it in bytes is refused before it lands', () => {
  const before = korean(6), after = korean(7);
  const library = libraryOf(before);
  assert.ok(JSON.stringify(upsertProject(library, after)).length + 3 * 1_300_000 < LIBRARY_LIMIT_BYTES, 'counted in characters it would look as if it fits');
  assert.match(libraryRefusal(library, before, after, DESKTOP) ?? '', /bytes.*smaller|smaller.*bytes/s);
});

test('a batch that does not grow the design is never refused for the library, even past the limit', () => {
  const before = korean(8), library = libraryOf(before);
  assert.ok(libraryRefusal(library, korean(7), before, DESKTOP), 'the library is past the limit');
  assert.equal(libraryRefusal(library, before, korean(8, 1_800_000), DESKTOP), undefined, 'shrinking a page is always taken');
  assert.equal(libraryRefusal(library, before, {...before, name: 'Same length'.slice(0, before.name.length)}, DESKTOP), undefined);
});

test('a small change to a small library is let through without measuring the library again', () => {
  const p = initialProject(), library = libraryOf(p);
  const known = {libraryChars: JSON.stringify(library).length, designChars: JSON.stringify(p).length};
  assert.equal(libraryRefusal(library, p, {...p, name: 'Renamed'}, DESKTOP, known), undefined);
  assert.equal(libraryRefusal(library, p, {...p, name: 'Renamed'}, BROWSER, known), undefined);
});

test('the browser build holds the library to an estimate of local storage, in characters', () => {
  const big = initialProject();
  big.pages.push({id: 'free-1', name: 'Big', blocks: [], kind: 'html', html: 'x'.repeat(1_000_000)});
  const library = libraryOf(big), bigger = {...big, pages: [big.pages[0], {...big.pages[1], html: 'x'.repeat(1_990_000)}, {id: 'free-2', name: 'More', blocks: [], kind: 'html' as const, html: 'y'.repeat(1_990_000)}]};
  assert.match(libraryRefusal(library, big, bigger, BROWSER) ?? '', /browser/);
});
