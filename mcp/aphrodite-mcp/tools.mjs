/**
 * What Aphrodite offers an agent, and how each tool reaches the app.
 *
 * The descriptions are the product here. A tool an agent misreads costs a round trip and often a
 * wrong edit, so each one says what it is for, when not to reach for it, and shows one complete call.
 * Every tool is a thin route onto the loopback channel: the app decides what is allowed, always.
 */
import {mcpTools} from '../../src/agent/commands.mjs';

/** Tools are namespaced so they stay distinct among whatever else a client has loaded. */
export const PREFIX = 'aphrodite_';

/**
 * The name this client goes by in the app — on the request the person answers, in the banner and in
 * every receipt — taken from its own `initialize` (`clientInfo.name`). It is what the program says
 * about itself, so it is cleaned the way the app cleans it (src/agent/authority.ts normalizeCaller),
 * with spaces kept as hyphens, and it may never be `human`. Nothing usable falls back to `mcp-client`.
 */
export const FALLBACK_CALLER = 'mcp-client';
export function callerName(clientInfo) {
  const raw = typeof clientInfo?.name === 'string' ? clientInfo.name : '';
  const cleaned = raw.toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '');
  return !cleaned || cleaned === 'human' ? FALLBACK_CALLER : cleaned;
}

/**
 * The tools are the command table's MCP rows (src/agent/commands.mjs): the descriptions, schemas and
 * routes live there, beside the grade and the controls of the same command, and this list is their
 * projection. A test fails if the two ever differ.
 */
/**
 * A refusal as the agent reads it: the app's own words, and the board open now when the refusal names it (0.3-R fix 4 #5),
 * since only words reach an agent through MCP.
 */
export function refusalText(payload, status) {
  const said = payload?.error ?? `Aphrodite refused that (HTTP ${status}).`;
  const open = payload?.open;
  if (!open || typeof open !== 'object' || typeof open.name !== 'string') return said;
  return `${said} The board open now is "${open.name.slice(0, 200)}"${typeof open.project_id === 'string' ? ` (project_id ${open.project_id.slice(0, 200)})` : ''}.`;
}

export const tools = mcpTools();

export const toolByName = Object.fromEntries(tools.map(t => [t.name, t]));

/** What the client sees — the call plumbing stays here. */
export function toolManifest() {
  return tools.map(({name, title, description, inputSchema, annotations}) => ({name, title, description, inputSchema, annotations}));
}
