import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('each native save awaits its blocking worker before acknowledging the write', () => {
  for (const [file, command] of [
    ['workspace', 'workspace_write'], ['vault', 'vault_sync'],
    ['vault', 'vault_document'], ['image_library', 'image_library_import'],
  ]) {
    const source = readFileSync(new URL(`../src-tauri/src/${file}.rs`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`pub async fn ${command}\\([^]*?\\{\\s*crate::disk::write\\(move \\|\\| \\{`), command);
  }
});

test('the disk-image query does not forward the app environment to the system utility', () => {
  const source=readFileSync(new URL('../src-tauri/src/connect/mod.rs',import.meta.url),'utf8');
  assert.match(source,/Command::new\("\/usr\/bin\/hdiutil"\)\s*\.env_clear\(\)/);
});
