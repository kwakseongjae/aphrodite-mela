// Module hooks for Node: `import css from './page.css?raw'` gives the file's text, as Vite does.
// Everything else passes through untouched. Registered by raw.mjs.
import {readFile} from 'node:fs/promises';

export async function resolve(specifier, context, next) {
  if (!specifier.endsWith('?raw')) return next(specifier, context);
  const found = await next(specifier.slice(0, -4), context);
  return {...found, url: `${found.url}?raw`, format: 'module', shortCircuit: true};
}

export async function load(url, context, next) {
  if (!url.endsWith('?raw')) return next(url, context);
  const text = await readFile(new URL(url.slice(0, -4)), 'utf8');
  return {format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true};
}
