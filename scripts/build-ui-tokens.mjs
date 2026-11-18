/**
 * Renders src/ui/tokens.ts into src/ui/tokens.css and the token table in docs/UI-SYSTEM.md.
 *
 *   node scripts/build-ui-tokens.mjs
 *
 * tests/ui-tokens.test.ts fails when either output no longer matches the source.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {tokensCss, tokensDoc} from '../src/ui/tokens.ts';

const css = new URL('../src/ui/tokens.css', import.meta.url);
writeFileSync(css, tokensCss());
console.log('wrote src/ui/tokens.css');

const doc = new URL('../docs/UI-SYSTEM.md', import.meta.url);
const START = '<!-- tokens:start -->', END = '<!-- tokens:end -->';
const text = readFileSync(doc, 'utf8');
const [head, rest] = text.split(START);
if (rest === undefined || !rest.includes(END)) throw new Error(`docs/UI-SYSTEM.md has no ${START} … ${END} block`);
writeFileSync(doc, `${head}${START}\n${tokensDoc()}${END}${rest.slice(rest.indexOf(END) + END.length)}`);
console.log('wrote the token table in docs/UI-SYSTEM.md');
