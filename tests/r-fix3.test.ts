/**
 * 0.3-R fix 3 (Codex check3 of 0.3-R, 2026-11-24).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialProject, type Project} from '../src/model.ts';
import {outgoing} from '../src/board-file.ts';
import * as bf from '../src/board-file.ts';
import {renderDocument} from '../src/free-page.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const sha = (n: number) => n.toString(16).padStart(64, '0');
const body = (name: string) => { const start = main.indexOf(name); return main.slice(start, main.indexOf('\n}\n', start)); };

/* 7a (high): an agent's render may load the files that render was given and no other. Its policy names each one, not the
   app's whole asset origin, so a page that makes an address at run time for a file the board came without draws nothing. */
test('an agent render\'s policy names the files it was given, not the asset origin', async () => {
  const mine = sha(1), held = sha(2);
  const p = {...initialProject(), leftOut: [held]} as Project;
  const host = {origins: ['http://asset.localhost'], stat: async () => ({mime: 'image/png', bytes: 4}), read: async () => new Uint8Array(4), frameCost: async (s: string) => `http://asset.localhost/board-media/${s}.png`.length, frameMedia: async (s: string) => `http://asset.localhost/board-media/${s}.png`, mediaUrl: async () => 'blob:x'};
  const doc = await renderDocument({html: `<img src="media:${mine}"><img src="media:${held}">`}, outgoing(p, host).host as never);
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(doc)![1];
  assert.match(csp, new RegExp(`img-src data: http://asset\\.localhost/board-media/${mine}\\.png;`), 'the file it was given');
  assert.doesNotMatch(csp, /img-src[^;]*http:\/\/asset\.localhost(?:[ ;]|$)/, 'never the whole origin');
  assert.doesNotMatch(csp, new RegExp(held), 'and nothing of the file the board came without');
  assert.match(csp, /media-src data: http:\/\/asset\.localhost\/board-media\//);
});

/* 7b (high): only the person putting a file back lets it go out. An agent's media_add of a file the board came without, by
   its library id, by its bytes, or as a picture of the library's under another name, is refused, saying the person must place it. */
test('an agent cannot put back a file the board came without: by library id, by hash, or by a library picture\'s bytes', () => {
  const held = (bf as unknown as Record<string, unknown>).heldFromAgent as (p: Project, file: string) => string | undefined;
  assert.equal(typeof held, 'function', 'board-file.ts exports heldFromAgent');
  const p = {...initialProject(), leftOut: [sha(3), 'local:0123456789abcdef']} as Project;
  assert.match(held(p, 'local:0123456789abcdef') ?? '', /came without.*person/);
  assert.match(held(p, sha(3)) ?? '', /came without.*person/);
  assert.equal(held(p, sha(4)), undefined);
  assert.equal(held(initialProject(), sha(3)), undefined);
  const apply = body('async function applyBatch(');
  const copy = apply.indexOf('await importMedia(');
  assert.ok(apply.indexOf("heldFromAgent(project,`local:${") > 0 && apply.indexOf("heldFromAgent(project,`local:${") < copy, 'a library id is asked before anything is copied');
  assert.ok(apply.indexOf('heldFromAgent(project,sha)') > copy, 'what was copied is asked by its hash');
  assert.ok(apply.indexOf('heldFromAgent(project,`local:${contentId(') > copy, 'and a picture by the id the library would give it');
  assert.doesNotMatch(apply, /carriedNow\(/, 'an agent\'s file never takes one off the list');
});
