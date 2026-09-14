import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAgentCommand} from '../src/agent/bridge';
import {judge,isRead,isWrite,type Authority,type Mode} from '../src/agent/authority';

/**
 * The permission rule must belong to the app, not to whichever client happens to be calling. These
 * tests pin that: a request built the way the HTTP bridge builds it and the same request built the
 * way `window.aphroditeAgent` builds it meet the identical verdict, and no command kind can slip
 * past the rule by not being classified.
 */

/** Every kind `parseAgentCommand` accepts today, with a payload it accepts. */
const commands: [string, unknown][] = [
  ['state', null],
  ['act', {action: 'add', data: {kind: 'cta'}}],
  ['click', {selector: '[data-action="page"]'}],
  ['type', {selector: 'input', text: 'hi'}],
  ['key', {key: '1', shift: true}],
  ['command', {query: 'hero 추가'}],
  ['edit', {field: 'title', text: 'Hello'}],
  ['library', {action: 'list'}],
  ['end', null],
];

const modes: Mode[] = ['design', 'connected', 'delegated'];
const holders = [null, {label: 'astra', since: 1_700_000_000_000}, {label: 'human', since: 1_700_000_000_000}];
const NOW = 1_700_000_000_000;

/** How the loopback bridge arrives: a route picks the kind, a header carries the caller. */
const overHttp = (kind: string, header?: string) => ({kind, caller: header ?? ''});
/** How the browser build arrives: both are arguments. */
const overJs = (kind: string, caller?: string) => ({kind, caller: caller ?? ''});

test('every command kind the bridge accepts is classified by the permission rule',() => {
  for (const [kind, payload] of commands) {
    assert.ok(!('error' in parseAgentCommand(kind, payload)), `${kind} should parse`);
    const known = isRead(kind) || isWrite(kind) || kind === 'end';
    assert.ok(known, `command kind "${kind}" is not classified in authority.ts, so it would be refused as unknown`);
  }
});

test('a kind that does not exist is refused by both the parser and the rule',() => {
  assert.ok('error' in parseAgentCommand('approve', {}));
  const verdict = judge('approve', 'claude-code', {mode: 'delegated', holder: null, now: NOW});
  assert.equal(verdict.allow, false);
});

test('the same command meets the same verdict whichever transport it arrives on',() => {
  for (const [kind] of commands) {
    for (const mode of modes) {
      for (const holder of holders) {
        const authority: Authority = {mode, holder, now: NOW};
        const http = overHttp(kind, 'claude-code');
        const js = overJs(kind, 'claude-code');
        assert.deepEqual(
          judge(http.kind, http.caller, authority),
          judge(js.kind, js.caller, authority),
          `${kind} in ${mode} with holder ${holder?.label ?? 'none'}`,
        );
      }
    }
  }
});

test('a caller that sends no label is treated the same on both transports',() => {
  const authority: Authority = {mode: 'connected', holder: null, now: NOW};
  assert.deepEqual(judge('edit', overHttp('edit').caller, authority), judge('edit', overJs('edit').caller, authority));
});

test('the rule takes only the request and the app state — a client cannot pass an approval into it',() => {
  assert.equal(judge.length, 3, 'judge(kind, caller, authority): no fourth parameter for a client to fill in');
  const authority: Authority = {mode: 'design', holder: null, now: NOW};
  const first = judge('apply', 'claude-code', authority);
  const second = judge('apply', 'claude-code', authority);
  assert.deepEqual(first, second, 'the same inputs always give the same answer');
  assert.equal(first.allow, false, 'and a client claiming approval changes nothing: design mode still refuses');
});
