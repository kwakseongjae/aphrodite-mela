/**
 * 0.3-P1-fix1: a saved text diff checks the passage it takes out by SHA-256, not a 32-bit hash, so a
 * different passage of the same length cannot pass for it. The digest is computed in plain JavaScript
 * because the check runs inside a synchronous patch.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256, passageHash} from '../src/ledger/sha256.ts';

const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const ascii = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)));

test('SHA-256 gives the published digests', () => {
  assert.equal(hex(sha256(ascii(''))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex(sha256(ascii('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hex(sha256(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(hex(sha256(ascii('a'.repeat(1_000_000)))), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('a passage hash is the first 128 bits of SHA-256 over its UTF-16 code units, at every block boundary', () => {
  for (const text of ['', 'a', '한글 😀', 'x'.repeat(27), 'x'.repeat(28), 'x'.repeat(31), 'x'.repeat(32), 'x'.repeat(33), 'y'.repeat(100_003), '\ud800 lone']) {
    assert.equal(passageHash(text), createHash('sha256').update(Buffer.from(text, 'utf16le')).digest('hex').slice(0, 32), JSON.stringify(text.slice(0, 20)));
  }
  assert.notEqual(passageHash('\ud800'), passageHash('\ud801'), 'two lone halves are two passages');
});
