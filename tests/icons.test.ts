import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { icons } from '../src/icons.ts';

const skip = new Set(['vendor', 'generated']);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else if (name.endsWith('.ts')) acc.push(path);
  }
  return acc;
}

function toPascal(name: string) {
  return name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

function add(names: Set<string>, value?: string) {
  if (value && /^[a-z0-9-]+$/.test(value)) names.add(value);
}

function referencedIcons(root: string) {
  const names = new Set<string>();
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(/(?<![A-Za-z])icon\(\s*['"]([a-z0-9-]+)['"]/g)) add(names, match[1]);
    for (const match of src.matchAll(/(?<![A-Za-z])icon\(/g)) {
      const window = src.slice(match.index, match.index + 240);
      if (/^icon\(\s*['"]/.test(window)) continue;
      const tern = window.match(/^icon\([\s\S]{0,200}?\?\s*['"]([a-z0-9-]+)['"]\s*:\s*['"]([a-z0-9-]+)['"]/);
      if (tern) { add(names, tern[1]); add(names, tern[2]); }
    }
    for (const match of src.matchAll(/iconButton\(\s*['"][^'"]+['"]\s*,\s*['"]([a-z0-9-]+)['"]/g)) add(names, match[1]);
    for (const match of src.matchAll(/(?<![A-Za-z])button\(\s*['"][^'"]+['"]\s*,\s*['"]([a-z0-9-]+)['"]/g)) add(names, match[1]);
    for (const match of src.matchAll(/(?<![A-Za-z])button\(/g)) {
      const window = src.slice(match.index, match.index + 280);
      if (/^button\(\s*['"][^'"]+['"]\s*,\s*['"]/.test(window)) continue;
      const tern = window.match(/^button\(\s*['"][^'"]+['"]\s*,\s*[\s\S]{0,160}?\?\s*['"]([a-z0-9-]+)['"]\s*:\s*['"]([a-z0-9-]+)['"]/);
      if (tern) { add(names, tern[1]); add(names, tern[2]); }
    }
    for (const match of src.matchAll(/data-lucide=["']([a-z0-9-]+)["']/g)) add(names, match[1]);
    for (const match of src.matchAll(/\bicon:\s*['"]([a-z0-9-]+)['"]/g)) add(names, match[1]);
  }
  return names;
}

test('kebab icon names convert to lucide PascalCase keys', () => {
  assert.equal(toPascal('circle-check'), 'CircleCheck');
  assert.equal(toPascal('undo-2'), 'Undo2');
  assert.equal(toPascal('x'), 'X');
});

test('icons includes every lucide name the app can render and nothing else', () => {
  const referenced = [...referencedIcons('src')].map(toPascal).sort();
  const exported = Object.keys(icons).sort();
  const missing = referenced.filter(name => !exported.includes(name));
  const extra = exported.filter(name => !referenced.includes(name));
  assert.deepEqual(missing, [], `missing from icons: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `not referenced in src: ${extra.join(', ')}`);
});
