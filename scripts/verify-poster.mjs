/**
 * The poster downscaler, in a real browser.
 *
 * Adding a picture in the app goes through a file dialog that cannot be driven from here, so the
 * shrinking step was the one piece of it nobody had ever watched run. This bundles the module into a
 * scratch page and puts real photographs through it, which is the only way to know that
 * `createImageBitmap` and the canvas do what the arithmetic says.
 *
 *   node scripts/verify-poster.mjs
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFile, mkdir, readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {openPage} from './lib/headless.mjs';

const OUT = process.env.POSTER_OUT || '/tmp/aphrodite-poster-check';
await mkdir(OUT, {recursive: true});

// Two real pictures: one that has to shrink, one that has to be left exactly as it is.
execFileSync('python3', ['-c', `
from PIL import Image
src=Image.open('public/brand/cutouts/apple-hand.png').convert('RGB')
src.resize((4000,3000),Image.LANCZOS).save('${OUT}/big.jpg',quality=92)
src.resize((900,675),Image.LANCZOS).save('${OUT}/small.jpg',quality=88)
`]);

const bundled = await build({entryPoints: ['src/design/downscale.ts'], bundle: true, write: false,
  format: 'iife', globalName: 'Downscale', logLevel: 'silent'});
const lib = Buffer.from(bundled.outputFiles[0].contents).toString();

const pictures = {
  big: (await readFile(`${OUT}/big.jpg`)).toString('base64'),
  small: (await readFile(`${OUT}/small.jpg`)).toString('base64'),
};
await writeFile(`${OUT}/probe.html`, `<!doctype html><meta charset="utf-8"><script>${lib}</script>
<script>
window.pictures = ${JSON.stringify(pictures)};
window.run = async function(name){
  const b64 = window.pictures[name];
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/jpeg'}));
  const size = {width: bitmap.width, height: bitmap.height};
  bitmap.close();
  const out = await Downscale.shrinkToPoster(bytes, 'image/jpeg');
  return {...size, inBytes: bytes.length, outChars: out.length, untouched: out === b64};
};
</script>`);

const {evaluate, close} = await openPage(`file://${OUT}/probe.html`);
try {
  const big = await evaluate('window.run("big")');
  console.log(`  ${big.width}×${big.height} · ${Math.round(big.inBytes / 1024)} kB in → ${Math.round(big.outChars / 1024)} kB of base64`);
  assert.equal(big.width, 4000, 'the browser read the real picture, not a stub');
  assert.equal(big.untouched, false, 'a four-thousand-pixel photograph must not be stored whole');
  assert.ok(big.outChars < big.inBytes, `it came out bigger: ${big.outChars} vs ${big.inBytes}`);
  assert.ok(big.outChars < 900_000, `still too heavy to cross the bridge per card: ${big.outChars}`);

  const small = await evaluate('window.run("small")');
  console.log(`  ${small.width}×${small.height} · ${Math.round(small.inBytes / 1024)} kB in → ${Math.round(small.outChars / 1024)} kB of base64`);
  assert.equal(small.untouched, true, 'a picture already small enough is stored as it is, not re-encoded');

  console.log('\nboth checks passed');
} finally {
  close();
}
