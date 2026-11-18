import type {Tool} from '../../mcp/aphrodite-mcp/tools.mjs';
export type ToolSnapshot = {
  name: string;
  title: string;
  description: string;
  annotations: Tool['annotations'];
  inputSchema: Tool['inputSchema'];
  route: Tool['route'];
  keys: string[];
  empty: {params?: Record<string, unknown> | null; body?: Record<string, unknown> | null};
  every: {params?: Record<string, unknown> | null; body?: Record<string, unknown> | null};
};
export declare function toolSnapshot(tools: readonly Tool[]): ToolSnapshot[];
