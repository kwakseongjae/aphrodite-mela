// @ts-nocheck: run inside a checkout of an older version, beside its own src (see below), not checked with this one.
/*
 * How tests/fixtures/library-*.json were made (0.3-R fix 1 #8): run inside a checkout of the version named, so that version's
 * own code writes the library and its own reader says which boards are approved.
 *   git archive <ref> src | tar -x -C <dir>; cp this file <dir>/gen.mts; ln -s <this repo>/node_modules <dir>/
 *   (cd <dir> && npx tsx gen.mts <out.json> <label>)
 */
// Writes a library the way this checkout's code writes one, with what its own reader says of each board's approval.
// Run with this checkout's src next to it: node --import tsx gen.mts <out.json> <label>
import {writeFileSync} from 'node:fs';
import {initialProject, parseProject, fingerprint, isApproved} from './src/model.ts';
import {readLibrary, upsertProject, writeLibrary} from './src/workspace/library.ts';
import {sampleProject} from './src/workspace/onboarding.ts';
const [out, label] = process.argv.slice(2);
const stamp = '2026-11-23T00:00:00.000Z';
const approve = (p: any) => { p.approvedFingerprint = fingerprint(p); return p; };
const boards: [string, any][] = [];
// An approved new board, and the two samples, approved.
boards.push(['approved-new', approve(Object.assign(initialProject(), {id: 'fixture-approved-new'}))]);
boards.push(['approved-sample-en', approve(Object.assign(sampleProject('en'), {id: 'fixture-sample-en'}))]);
boards.push(['approved-sample-ko', approve(Object.assign(sampleProject('ko'), {id: 'fixture-sample-ko'}))]);
// A draft: approved, then changed.
const draft = approve(Object.assign(initialProject(), {id: 'fixture-draft'})); draft.brief = 'Changed after it was approved';
boards.push(['draft-after-change', draft]);
// A type scale approved as the reader keeps it, stored with each role's keys in another order.
const typed = Object.assign(initialProject(), {id: 'fixture-type-roles'});
typed.system = {...typed.system, type: {body: {size: 16, weight: 400, lineHeight: 1.5}, display: {size: 48, weight: 700}}};
const kept = parseProject(JSON.stringify(typed));
kept.approvedFingerprint = fingerprint(kept);
boards.push(['type-roles-reordered', kept]);
let library: any = {version: 1, entries: []};
for (const [, p] of boards) library = upsertProject(library, p, stamp);
const store: Record<string, string> = {};
writeLibrary({getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }} as any, library);
let raw = Object.values(store)[0];
// Each role's keys in reverse, as a writer that did not keep their order would have stored them.
raw = raw.replace(/"body":\{"size":16,"weight":400,"lineHeight":1.5\}/, '"body":{"lineHeight":1.5,"weight":400,"size":16}').replace(/"display":\{"size":48,"weight":700\}/, '"display":{"weight":700,"size":48}');
const read = readLibrary({getItem: () => raw, setItem: () => {}} as any);
const approved = Object.fromEntries(read.entries.map((e: any) => [e.project.id, isApproved(e.project)]));
writeFileSync(out, JSON.stringify({writtenBy: label, library: raw, approved}, null, 1) + '\n');
console.log(label, JSON.stringify(approved), raw.includes('"lineHeight":1.5,"weight":400'));
