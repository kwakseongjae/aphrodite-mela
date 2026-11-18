/**
 * 0.3-P1-fix2: the desktop app's library file is held to what the Rust side will write, in the unit it
 * counts — UTF-8 bytes — and an agent's batch is measured against it before it lands, from above and
 * without recording anything. A batch that does not grow the design is never refused for it.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject, type Project} from '../src/model.ts';
import {upsertProject, libraryRefusal, rememberSaved, utf8Length, LIBRARY_LIMIT_BYTES, BROWSER_LIBRARY_ESTIMATE, type Library} from '../src/workspace/library.ts';

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

/** How many times JSON.stringify runs while `fn` does. */
function serializations(fn: () => void): number {
  const original = JSON.stringify;
  let calls = 0;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => { calls++; return original(...args); }) as typeof JSON.stringify;
  try { fn(); } finally { JSON.stringify = original; }
  return calls;
}

test('a small change to a library saved small is let through without measuring the library again', () => {
  const p = initialProject(), library = libraryOf(p);
  rememberSaved(library, JSON.stringify(library).length);
  const after = {...p, name: 'Renamed'};
  assert.equal(serializations(() => assert.equal(libraryRefusal(library, p, after, DESKTOP, JSON.stringify(after).length), undefined)), 1, 'only the new design, which the caller already measures');
  assert.equal(libraryRefusal(library, p, after, BROWSER, JSON.stringify(after).length), undefined);
});

/* Codex 3rd review: the remembered size outlived the library it measured. A library read again from disk
   — grown meanwhile by another window — is a different object, so nothing is remembered for it. */
test('a library read again from disk is measured, not taken for the size the last one was saved at', () => {
  const small = initialProject(), saved = libraryOf(small);
  rememberSaved(saved, JSON.stringify(saved).length);
  const other = korean(7);
  const disk = upsertProject(JSON.parse(JSON.stringify(saved)) as Library, other);
  const grown = {...small, pages: [...small.pages, {id: 'free-x', name: 'Grown', blocks: [], kind: 'html' as const, html: 'x'.repeat(200_000)}]};
  assert.equal(libraryRefusal(saved, small, grown, DESKTOP, JSON.stringify(grown).length), undefined, 'against the small library it fits');
  assert.match(libraryRefusal(disk, small, grown, DESKTOP, JSON.stringify(grown).length) ?? '', /bytes/, 'against what is on disk now it does not');
});

test('the browser build holds the library to an estimate of local storage, in characters', () => {
  const big = initialProject();
  big.pages.push({id: 'free-1', name: 'Big', blocks: [], kind: 'html', html: 'x'.repeat(1_000_000)});
  const library = libraryOf(big), bigger = {...big, pages: [big.pages[0], {...big.pages[1], html: 'x'.repeat(1_990_000)}, {id: 'free-2', name: 'More', blocks: [], kind: 'html' as const, html: 'y'.repeat(1_990_000)}]};
  assert.match(libraryRefusal(library, big, bigger, BROWSER) ?? '', /browser/);
});
