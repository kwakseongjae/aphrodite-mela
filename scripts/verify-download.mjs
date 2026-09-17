/**
 * The landing page's download button points at a file that exists.
 *
 * `site/script.js` pins a floor so the button works when GitHub's API is rate-limited, and
 * `latestRelease()` upgrades it — but it refuses to go *below* the floor, which is what stops a
 * stale "latest" from downgrading the button. So a floor set to a release that has not been
 * published yet pins the page to a 404 for the whole notarization window, which is exactly what
 * happened on v0.2.1, v0.2.2 and v0.2.3: bump the floor with the other four version sites and the
 * live site serves a dead link for twenty minutes.
 *
 * The floor has to lag the tag by one. This says so out loud rather than trusting anyone to remember.
 *
 *   node scripts/verify-download.mjs
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const REPO = 'kwakseongjae/aphrodite-mela';
const script = readFileSync(new URL('../site/script.js', import.meta.url), 'utf8');
const floor = script.match(/var VERSION = '([^']+)'/)?.[1];
assert.ok(floor, 'site/script.js has no pinned version');

const app = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
console.log(`  app is ${app} · the landing floor is ${floor}`);

const urls = [
  `https://github.com/${REPO}/releases/download/v${floor}/Aphrodite_${floor}_aarch64.dmg`,
  `https://github.com/${REPO}/releases/download/v${floor}/Aphrodite_${floor}_x64.dmg`,
];
for (const url of urls) {
  const response = await fetch(url, {method: 'HEAD', redirect: 'follow'});
  console.log(`  ${response.status}  ${url.split('/').pop()}`);
  assert.ok(response.ok, `the pinned floor does not download: ${url}\n  Set VERSION in site/script.js to the last PUBLISHED release.`);
}

if (floor === app) {
  console.log('\n  note: the floor equals the app version — fine once this release is published, a 404 until then.');
}
console.log('\nthe download button resolves');
