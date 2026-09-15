#!/usr/bin/env node
/**
 * Aphrodite's MCP server.
 *
 * A thin stdio adapter in front of the app's loopback channel: it finds the running app, forwards a
 * tool call to one route, and hands the answer back. No decisions are made here — what an agent may
 * read and what it may change is the app's judgement (src/agent/authority.ts), so the same request
 * made with curl meets the same answer. Keeping this layer empty is what stops a client's own
 * approval UI from quietly becoming the gate.
 *
 * No dependencies on purpose: `node mcp/aphrodite-mcp/index.mjs` and nothing to install.
 */
import {createInterface} from 'node:readline';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {toolManifest, toolByName} from './tools.mjs';

const NAME = 'aphrodite';
const VERSION = '0.1.5';
/** Protocol versions this server is happy to speak; the newest is offered when a client asks for one we do not know. */
const KNOWN_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ENDPOINT_FILE = join(homedir(), 'Library', 'Application Support', 'studio.aphrodite.mela', 'agent-endpoint.json');
const NOT_RUNNING = 'Aphrodite is not running. Ask the person to open the app, then try again.';

const log = message => process.stderr.write(`[aphrodite-mcp] ${message}\n`);
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id, result) => send({jsonrpc: '2.0', id, result});
const fail = (id, code, message) => send({jsonrpc: '2.0', id, error: {code, message}});

/** Where the app is listening, read fresh each time: the port and token change every launch. */
function endpoint() {
  try {
    const parsed = JSON.parse(readFileSync(ENDPOINT_FILE, 'utf8'));
    if (!parsed?.base || !parsed?.token) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** One tool call, forwarded. Errors come back as text for the model to read, not as protocol errors. */
async function callTool(name, args) {
  const tool = toolByName[name];
  if (!tool) return {isError: true, text: `No such tool "${name}".`};
  const where = endpoint();
  if (!where) return {isError: true, text: NOT_RUNNING};

  const query = tool.params ? Object.entries(tool.params(args ?? {})).filter(([, v]) => v !== undefined && v !== '') : [];
  const search = query.length ? `?${query.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
  const url = `${where.base}${tool.route.path}${search}`;
  const init = {
    method: tool.route.method,
    headers: {
      Authorization: `Bearer ${where.token}`,
      'Content-Type': 'application/json',
      'X-Aphrodite-Agent': 'claude-code',
    },
  };
  if (tool.route.method === 'POST') {
    const body = tool.body ? tool.body(args ?? {}) : {};
    init.body = JSON.stringify(Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)));
  }

  // A call that never returns would leave the agent waiting for ever, so it is given a deadline: the
  // app's own bridge answers or gives up within fifteen seconds, and this allows for the round trip.
  let response;
  try {
    response = await fetch(url, {...init, signal: AbortSignal.timeout(25_000)});
  } catch (error) {
    return {isError: true, text: error?.name === 'TimeoutError'
      ? 'Aphrodite did not answer in time. It may be busy or mid-dialog — ask the person to check the app.'
      : NOT_RUNNING};
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return {isError: true, text: `Aphrodite answered something unexpected (HTTP ${response.status}).`};
  }
  if (!response.ok) {
    // The app's refusals already explain themselves; pass them through unchanged.
    return {isError: true, text: payload.error ?? `Aphrodite refused that (HTTP ${response.status}).`};
  }
  // A document is meant to be read: returning the guide inside a JSON envelope would hand the model
  // a string with escaped newlines instead of prose. Everything else is data, and stays JSON.
  if (typeof payload.guide === 'string') return {isError: false, text: payload.guide};
  if (typeof payload.png === 'string') {
    const {png, ...rest} = payload;
    return {isError: false, image: {data: png, mimeType: payload.mime ?? 'image/png'}, text: JSON.stringify(rest, null, 2)};
  }
  return {isError: false, text: JSON.stringify(payload, null, 2)};
}

async function handle(message) {
  const {id, method, params} = message;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      const version = KNOWN_VERSIONS.includes(asked) ? asked : KNOWN_VERSIONS[0];
      return reply(id, {
        protocolVersion: version,
        capabilities: {tools: {listChanged: false}},
        serverInfo: {name: NAME, version: VERSION},
        instructions: [
          'Aphrodite is a local design workbench. Read the design contract before changing anything, and send a whole change as one aphrodite_apply_edits call so the person can undo it in one press.',
          'Approving a direction is the person\'s decision and no tool here can do it.',
          'Editing needs the person to have opened the door; if a call comes back saying so, tell them rather than retrying.',
        ].join(' '),
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return; // notifications take no reply
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, {tools: toolManifest()});
    case 'tools/call': {
      const {isError, text, image} = await callTool(params?.name, params?.arguments);
      // A picture goes back as a picture: a model cannot read a page from base64 in a text block.
      const content = image
        ? [{type: 'image', data: image.data, mimeType: image.mimeType}, {type: 'text', text}]
        : [{type: 'text', text}];
      return reply(id, {content, isError});
    }
    default:
      if (isRequest) return fail(id, -32601, `Method not found: ${method}`);
  }
}

const lines = createInterface({input: process.stdin});
lines.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  handle(message).catch(error => {
    log(`failed: ${error?.message ?? error}`);
    if (message.id !== undefined && message.id !== null) fail(message.id, -32603, 'Internal error');
  });
});
lines.on('close', () => process.exit(0));
log(`ready · ${toolManifest().length} tools · app endpoint ${ENDPOINT_FILE}`);
