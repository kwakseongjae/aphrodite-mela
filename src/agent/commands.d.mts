/** Types for the command table, so the app, the MCP server and the tests read one shape. */
import type {Tool, ToolAnnotations} from '../../mcp/aphrodite-mcp/tools.mjs';

/** §11.3's five grades plus `chrome`, the interface around the design. */
export type Grade = 'read' | 'edit' | 'outside' | 'choose' | 'human' | 'chrome';
export type Surface = 'ui' | 'mcp' | 'loopback' | 'inApp';

/** Every UI handle that runs a row: a data-action (with the data that tells two rows apart), an inspector field, a form, a gesture, a listener. */
export type Control =
  | {kind: 'action'; name: string; data?: Record<string, string>}
  | {kind: 'field'; name: string; data?: Record<string, string>}
  | {kind: 'form'; id: string}
  | {kind: 'gesture'; name: 'catalog-drop' | 'block-move-drop' | 'layer-reorder' | 'pointer' | 'frame-move' | 'media-drop' | 'media-paste' | 'undo-key' | 'redo-key'}
  /** An effect outside the app with no button: a link the app opens, the update check at launch. */
  | {kind: 'listener'; name: 'external-link' | 'update-check'};

export type McpBlock = {
  /** Position in the tool list a client is shown. */
  order: number;
  name: `aphrodite_${string}`;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  params?: (args: Record<string, unknown>) => Record<string, unknown>;
  body?: (args: Record<string, unknown>) => Record<string, unknown>;
};

export type Row = {
  id: string;
  label: {en: string; ko: string};
  grade: Grade;
  /** The kind the permission rule is asked about (authority.ts gateFor), when an agent can reach this row by name. */
  kind?: string;
  /** The one schema: MCP inputSchema and loopback payload docs. */
  input: Record<string, unknown>;
  reason: 'required' | 'optional' | 'none';
  revision: 'checked' | 'none';
  /**
   * The ledger sources the row writes; `commit()` refuses any other. Non-null exactly for edits that
   * are not screen verbs, and for approving. An `agent:` source is what an agent's own call writes.
   */
  ledger: {sources: string[]} | null;
  author: 'transport' | 'person-only';
  surfaces: Record<Surface, boolean>;
  controls: Control[];
  route?: {method: 'GET' | 'POST'; path: `/agent/${string}`};
  /** A payload the route's parser accepts, for the tests. */
  example?: Record<string, unknown>;
  mcp?: McpBlock;
  /** act, click, type, key, command, ui: the payload names another control, and that is what runs. */
  resolves?: true;
  /**
   * A file outside the app's own folders that the row reads, at a path the caller names, and the agent
   * surfaces that may ask for it: the ones running on this Mac, which can read its files already.
   */
  reads?: {what: string; field: string; surfaces: Surface[]};
};

export declare const grades: readonly Grade[];
export declare const surfaceNames: readonly Surface[];
export declare const commands: readonly Row[];
export declare const commandById: Record<string, Row>;
export declare function gradeOfKind(kind: string): Grade | undefined;
export declare function kindsOfGrade(...grades: Grade[]): string[];
export declare function loopbackRoutes(): string[];
export declare function toTool(row: Row): Tool;
export declare function mcpTools(): Tool[];
