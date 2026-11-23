/**
 * Half of a surrogate pair on its own (0.3-P3-fix2 #4): a JavaScript string can hold one, UTF-8 cannot, and the
 * desktop's save refuses the JSON escape it becomes (src-tauri/src/workspace.rs, its test). Such text is refused at
 * the doors it could come in by: an html page (htmlProblem), a board file, and a project file.
 */
import {halfPair} from './free-page';
export {halfPair};
/** The path of the first string value (or key) in a parsed JSON value holding one, or undefined. */
export function halfPairIn(value: unknown, path = ''): string | undefined {
  if (typeof value === 'string') return halfPair(value) >= 0 ? path || '(the text)' : undefined;
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) { const at = halfPairIn(value[i], `${path}[${i}]`); if (at) return at; } return undefined; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (halfPair(k) >= 0) return `${path}.${k}`; const at = halfPairIn(v, path ? `${path}.${k}` : k); if (at) return at; }
  return undefined;
}
