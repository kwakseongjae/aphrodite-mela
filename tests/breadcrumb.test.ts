import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BREADCRUMB_KEY,
  readBreadcrumb,
  writeBreadcrumb,
  storeVanished,
  crumbFor,
  vanishedHtml,
} from '../src/workspace/breadcrumb';

const slot = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
};

test('a round trip keeps what the notice needs', () => {
  const store = slot();
  writeBreadcrumb(store, crumbFor('/Users/x/store', 317, 18, new Date('2026-09-17T05:00:00Z')));
  assert.deepEqual(readBreadcrumb(store), {
    path: '/Users/x/store',
    revision: 317,
    entries: 18,
    at: '2026-09-17',
  });
});

test('an unreadable breadcrumb is the same as not having one', () => {
  assert.equal(readBreadcrumb(slot()), undefined);
  assert.equal(readBreadcrumb(slot({[BREADCRUMB_KEY]: 'not json'})), undefined);
  assert.equal(readBreadcrumb(slot({[BREADCRUMB_KEY]: '{"path":42}'})), undefined);
  assert.equal(readBreadcrumb(slot({[BREADCRUMB_KEY]: '{"path":"/a"}'})), undefined, 'entries is required');
  assert.equal(readBreadcrumb(slot({[BREADCRUMB_KEY]: '{"path":"/a","entries":-1}'})), undefined);
});

test('a storage that refuses to write does not take the save down with it', () => {
  const angry = {getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }};
  assert.doesNotThrow(() => writeBreadcrumb(angry, crumbFor('/a', 1, 1, new Date())));
});

/* The whole point: an empty disk plus a memory of something is the case worth shouting about, and
   an empty disk on its own is an ordinary first launch. Getting this backwards would either alarm
   every new user or stay silent for the one person who needs telling. */
test('a vanished store is an empty disk we remember filling', () => {
  const had = crumbFor('/Users/x/store', 317, 18, new Date('2026-09-17T00:00:00Z'));
  assert.deepEqual(storeVanished({data: null}, had), had, 'empty disk, 18 remembered');
  assert.equal(storeVanished({data: '{"version":1,"entries":[]}'}, had), undefined, 'disk has data');
  assert.equal(storeVanished({data: null}, undefined), undefined, 'a genuine first launch');
});

test('a breadcrumb that never held anything is not worth a warning', () => {
  const empty = crumbFor('/Users/x/store', 1, 0, new Date('2026-09-17T00:00:00Z'));
  assert.equal(storeVanished({data: null}, empty), undefined, 'nothing was there to lose');
});

test('the notice names the folder and what was in it, and escapes the path', () => {
  const crumb = crumbFor('/Users/x/<script>/store', 317, 18, new Date('2026-09-17T00:00:00Z'));
  const ko = vanishedHtml(crumb, true);
  assert.match(ko, /18개의 프로젝트/, 'it says how much it remembers');
  assert.match(ko, /저장 폴더가 있던 자리에 없습니다/);
  assert.ok(!ko.includes('<script>'), 'the path is escaped, not executed');
  assert.match(ko, /&lt;script&gt;/);
  const en = vanishedHtml(crumb, false);
  assert.match(en, /18 projects were saved here/);
  assert.match(en, /Nothing has been deleted/, 'it leads with the reassurance');
});

test('one project reads as one, not as one projects', () => {
  const one = crumbFor('/a', 2, 1, new Date('2026-09-17T00:00:00Z'));
  assert.match(vanishedHtml(one, false), /1 project were|1 project was/);
  assert.ok(!vanishedHtml(one, false).includes('1 projects'), 'no bare plural on one');
});

/* Starting fresh is the only destructive door in this notice, so it must be a deliberate press and
   never something the notice does on the person's behalf. */
test('the notice offers looking again before starting fresh', () => {
  const html = vanishedHtml(crumbFor('/a', 2, 3, new Date()), false);
  assert.ok(
    html.indexOf('disk-reload') < html.indexOf('disk-start-fresh'),
    'the safe action comes first',
  );
  assert.match(html, /old folder untouched/, 'it says starting fresh does not delete the old one');
});

/* localStorage does not follow the data directory — it lives under ~/Library/WebKit — so two app
   instances pointed at different HOMEs share this note. Comparing paths is what keeps one
   instance's empty first launch from raising an alarm about the other one's folder. */
test('a breadcrumb from a different store is not this store going missing', () => {
  const elsewhere = crumbFor('/tmp/other-home/store', 12, 5, new Date('2026-09-17T00:00:00Z'));
  assert.equal(
    storeVanished({data: null, path: '/Users/x/store'}, elsewhere),
    undefined,
    'a different path is a different instance, not a vanished folder',
  );
  assert.deepEqual(
    storeVanished({data: null, path: '/tmp/other-home/store'}, elsewhere),
    elsewhere,
    'the same path with nothing at it is the case worth raising',
  );
});

test('a caller that reports no path still gets the old behaviour', () => {
  const had = crumbFor('/Users/x/store', 317, 18, new Date('2026-09-17T00:00:00Z'));
  assert.deepEqual(storeVanished({data: null}, had), had);
});
