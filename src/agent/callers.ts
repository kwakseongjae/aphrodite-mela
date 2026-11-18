/**
 * Who is asking, in words a person knows.
 *
 * An agent reaches the app under a name it gives itself (`X-Aphrodite-Agent`; the MCP server passes on
 * the client's own `clientInfo.name`). That raw name keys the allow list and the receipts and never
 * changes here; this only decides what the person reads — "Codex", not "codex-mcp-client" — and where
 * the program runs, so the request can say so. A name not listed is shown as it came, marked unknown:
 * it is only what the program says about itself.
 */
export type CallerSource = 'terminal' | 'mcp' | 'in-app' | 'unknown';
export type Caller = {name: string; source: CallerSource; known: boolean; raw: string};

const known: [test: (raw: string) => boolean, name: string, source: CallerSource][] = [
  [raw => raw === 'claude-code', 'Claude Code', 'terminal'],
  // Claude Desktop introduces itself to MCP servers as `claude-ai`.
  [raw => raw === 'claude-desktop' || raw === 'claude-ai', 'Claude Desktop', 'mcp'],
  [raw => raw.includes('codex'), 'Codex', 'mcp'],
  [raw => raw.startsWith('cursor'), 'Cursor', 'mcp'],
  [raw => raw.startsWith('chatgpt'), 'ChatGPT', 'in-app'],
];

export function describeCaller(raw: string): Caller {
  const hit = known.find(([test]) => test(raw));
  return hit ? {name: hit[1], source: hit[2], known: true, raw} : {name: raw, source: 'unknown', known: false, raw};
}
