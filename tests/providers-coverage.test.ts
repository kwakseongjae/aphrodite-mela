import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coverage, type CoverageProvider} from '../src/vendor/coverage';

function providerBlock(src: string, provider: string): string {
  const marker = `\n  ${provider}: {`;
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `missing ${provider} renderer object`);
  let i = start + marker.length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i++];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return src.slice(start + marker.length, i - 1);
}

function rendererKeys(block: string): string[] {
  return [...block.matchAll(/^    ([a-z]+):/gm)].map(m => m[1]);
}

test('coverage kinds match renderer registry keys for every official provider', () => {
  const src = readFileSync(new URL('../src/vendor/runtime.tsx', import.meta.url), 'utf8');
  for (const provider of Object.keys(coverage) as CoverageProvider[]) {
    const keys = rendererKeys(providerBlock(src, provider));
    assert.deepEqual([...keys].sort(), [...coverage[provider]].sort(), provider);
  }
});
