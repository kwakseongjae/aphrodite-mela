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
import {protocol} from './protocol.mjs';
import {once} from 'node:events';
import {frames, decode, parse, fitsTree, validateScalars, readEndpoint, responseBody} from './wire.mjs';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {toolManifest, toolByName, callerName, FALLBACK_CALLER, refusalText} from './tools.mjs';
import {promptManifest, promptByName} from './prompts.mjs';

const NAME = 'aphrodite';
/* Read, not written down. This was a hard-coded '0.1.5' through nine releases — a sixth version site
   nobody knew to bump, and a client shows it in its server list. The one place the version lives is
   package.json; if that cannot be read the server still starts, because a wrong number in a label is
   not a reason to refuse an agent. */
const VERSION = process.env.APHRODITE_PREVIEW_VERSION || (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
/** Protocol versions this server is happy to speak; the newest is offered when a client asks for one we do not know. */

/* The override exists so a harness can point this at a file it controls, and so a second app
   running under another HOME (a sandbox instance) can be reached without editing this line. */
const ENDPOINT_FILE = process.env.APHRODITE_ENDPOINT_FILE
  || join(homedir(), 'Library', 'Application Support', 'studio.aphrodite.mela', 'agent-endpoint.json');
function offline(name) {
  return name === 'aphrodite_guide' ? {isError: false, text: protocol.offlineGuide} : {isError: true, text: protocol.notRunning};
}

/** Who this client is, as it said at `initialize`. Every call carries it so the person sees the real name. */
let caller = FALLBACK_CALLER;
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id, result) => send({jsonrpc: '2.0', id, result});
const fail = (id, code, message) => send({jsonrpc: '2.0', id, error: {code, message}});

/**
 * Is the process that wrote the endpoint file still here?
 *
 * Signal 0 checks for existence without delivering anything. EPERM means it exists and is not ours,
 * which still counts as alive. A file from before this field existed has no pid, and an old app is
 * not a dead one — say alive and let the connection decide.
 */
function ownerAlive(pid) {
  if (typeof pid !== 'number') return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Where the app is listening, read fresh each time: the port and token change every launch.
 *
 * Nothing deletes this file when the app exits, so it routinely outlives the app it describes.
 * Checking the owner costs nothing and turns "the request timed out" into "the app is not running",
 * which is the difference between a person debugging their network and a person opening the app.
 */
function endpoint() {
  try {
    const parsed = readEndpoint(ENDPOINT_FILE);
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(parsed?.base) || typeof parsed.token !== 'string' || !parsed.token || Number(parsed.base.split(':').at(-1))>65535) return undefined;
    if (!ownerAlive(parsed.pid)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** One tool call, forwarded. Errors come back as text for the model to read, not as protocol errors. */
async function callTool(name, args, who) {
  const tool = Object.hasOwn(toolByName,name) && toolByName[name];
  if (!tool) return {isError: true, text: `No such tool "${name}".`};
  const where = endpoint();
  if (!where) return offline(name);

  const query = tool.params ? Object.entries(tool.params(args ?? {})).filter(([, v]) => v !== undefined && v !== '') : [];
  const search = query.length ? `?${query.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
  const url = `${where.base}${tool.route.path}${search}`;
  const init = {
    method: tool.route.method,
    headers: {
      Authorization: `Bearer ${where.token}`,
      'Content-Type': 'application/json',
      'X-Aphrodite-Agent': who,
    },
  };
  if (tool.route.method === 'POST') {
    const body = tool.body ? tool.body(args ?? {}) : {};
    init.body = JSON.stringify(Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)));
  }

  // A call that never returns would leave the agent waiting for ever, so it is given a deadline: the
  // app's own bridge answers or gives up within fifteen seconds, and this allows for the round trip.
  let response, bytes;
  try {
    response = await fetch(url, {...init, redirect: 'manual', signal: AbortSignal.timeout(25_000)});
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return offline(name);
    }
    bytes = await responseBody(response);
  } catch (error) {
    if(error instanceof RangeError) return {isError:true,text:protocol.tooLarge};
    return error?.name === 'TimeoutError' ? {isError: true, text: protocol.timeout} : offline(name);
  }
  let payload;
  try {
    const text = decode(bytes);
    if (!fitsTree(text, protocol.limits.responseTree)) {
      validateScalars(text);
      payload = JSON.parse(text); // No recursive reviver on a deep response.
      if (response.ok) return {isError: false, text};
    } else {
      payload = parse(text, true);
    }
  } catch {
    return {isError: true, text: `Aphrodite answered something unexpected (HTTP ${response.status}).`};
  }
  if (!response.ok) {
    // The app's refusals explain themselves; passed through, with the board open now when one names it.
    return {isError: true, text: refusalText(payload, response.status)};
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

async function handle(message, who) {
  const {id, method, params} = message;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize': {
      caller = callerName(params?.clientInfo);
      const asked = params?.protocolVersion;
      const version = protocol.versions.includes(asked) ? asked : protocol.versions[0];
      return reply(id, {
        protocolVersion: version,
        capabilities: {tools: {listChanged: false}, prompts: {listChanged: false}},
        serverInfo: {name: NAME, version: (process.env.APHRODITE_ENDPOINT_FILE && endpoint()?.version) || VERSION},
        instructions: protocol.instructions,
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return; // notifications take no reply
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, {tools: toolManifest()});
    case 'prompts/list':
      return reply(id, {prompts: promptManifest()});
    case 'prompts/get': {
      const prompt = Object.hasOwn(promptByName,params?.name) && promptByName[params.name];
      if (!prompt) return fail(id, -32602, `Unknown prompt: ${params?.name}`);
      return reply(id, {description: prompt.description, messages: prompt.build(params?.arguments ?? {})});
    }
    case 'tools/call': {
      const {isError, text, image} = await callTool(params?.name, params?.arguments, who);
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

let inFlight = 0;
const waiting = [];

function dispatch(message, who) {
  return handle(message, who).catch(() => {
    if (message.id != null) fail(message.id, -32603, 'Internal error');
  });
}

async function runCalls(message, who) {
  inFlight++;
  try {
    await dispatch(message, who);
    while (waiting.length) {
      const next = waiting.shift();
      await dispatch(next.message, next.who);
    }
  } finally {
    inFlight--;
  }
}
for await (const bytes of frames(process.stdin)) {
  if (process.stdout.writableNeedDrain) await once(process.stdout,'drain');
  let message;
  try {
    if (!bytes) throw new RangeError();
    const text=decode(bytes);
    if (/^[ \t]*$/.test(text)) continue;
    message=parse(text);
  } catch {
    fail(null,-32700,'Parse error');
    continue;
  }
  if (!message || Array.isArray(message) || typeof message !== 'object') continue;
  const call = message.method==='tools/call';
  if (call && !Object.hasOwn(toolByName,message.params?.name)) {
    reply(message.id,{content:[{type:'text',text:`No such tool "${message.params?.name}".`}],isError:true});
    continue;
  }
  if (!call) {
    void dispatch(message, caller);
  } else if (inFlight < protocol.limits.inFlight) {
    void runCalls(message, caller);
  } else if (waiting.length < protocol.limits.queued) {
    waiting.push({message, who:caller});
  } else {
    reply(message.id,{content:[{type:'text',text:protocol.busy}],isError:true});
  }
}
