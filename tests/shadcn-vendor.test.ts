import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const names = ['input', 'textarea', 'card', 'badge', 'table', 'skeleton', 'alert', 'breadcrumb', 'pagination'] as const;
const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/vendor/shadcn');

test('vendored shadcn files exist, carry a license comment, and import no extra radix', () => {
  for (const name of names) {
    const path = join(dir, `${name}.tsx`);
    assert.ok(existsSync(path), path);
    const src = readFileSync(path, 'utf8');
    const first = src.split('\n')[0] ?? '';
    assert.match(first, /https:\/\/ui\.shadcn\.com\/r\/styles\/new-york\/.+\.json/, `${name} source comment`);
    assert.match(first, /MIT/, `${name} license comment`);
    const radix = [...src.matchAll(/from\s+['"](@radix-ui\/[^'"]+)['"]/g)].map(m => m[1]);
    for (const spec of radix) {
      assert.equal(spec, '@radix-ui/react-slot', `${name} extra radix ${spec}`);
    }
  }
});
