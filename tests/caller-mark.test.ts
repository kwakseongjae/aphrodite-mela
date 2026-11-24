/**
 * 0.3-L4 ③: a program asking to edit is shown by its maker's own mark, the official file used as it was received
 * (owner, 2026-11-19): Claude's spark for Claude, OpenAI's blossom for Codex and ChatGPT, and a plain mark for any other.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callerMarkHtml} from '../src/agent/caller-mark.ts';

test('Claude programs show the Claude spark, Codex and ChatGPT the OpenAI blossom, anything else a plain mark', () => {
  for (const raw of ['claude-code', 'claude-desktop', 'claude-ai']) assert.match(callerMarkHtml(raw), /src="\/brand\/agents\/claude-spark-clay\.svg"/, raw);
  for (const raw of ['codex-mcp-client', 'chatgpt']) assert.match(callerMarkHtml(raw), /src="\/brand\/agents\/openai-blossom-black\.svg"/, raw);
  for (const raw of ['cursor', 'my-agent', '<img src=x onerror=alert(1)>']) {
    const html = callerMarkHtml(raw);
    assert.doesNotMatch(html, /<img/, raw);
    assert.match(html, /data-lucide="terminal"/, raw);
  }
});

test('the logo files are the official ones as received: drawn, with nothing in them that runs or fetches', () => {
  for (const name of ['claude-spark-clay.svg', 'openai-blossom-black.svg']) {
    const svg = readFileSync(new URL(`../public/brand/agents/${name}`, import.meta.url), 'utf8');
    assert.match(svg, /^<svg[\s>]/, name);
    assert.doesNotMatch(svg, /<script|href=|on[a-z]+=/i, name);
  }
});
