/** Types for the dependency-free server, so the repository's tests can hold it to its contract. */
export type ToolAnnotations = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};
export type ToolRoute = {method: 'GET' | 'POST'; path: string};
export type Tool = {
  name: string;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  route: ToolRoute;
  /** GET tools: the query parameters a call becomes. */
  params?: (args: Record<string, unknown>) => Record<string, unknown>;
  /** POST tools: the JSON body a call becomes. */
  body?: (args: Record<string, unknown>) => Record<string, unknown>;
};
export declare const PREFIX: string;
export declare const tools: Tool[];
export declare const toolByName: Record<string, Tool>;
export declare function toolManifest(): Omit<Tool, 'route' | 'params' | 'body'>[];
