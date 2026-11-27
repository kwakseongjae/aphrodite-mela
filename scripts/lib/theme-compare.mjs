/**
 * What verify:theme reads in the light and the dark theme, held to one comparison (0.3-L5 fix 2): the app's paper changed, and
 * the person's design did not, read whole on both sides. An export or a list that came back empty or short fails here rather
 * than comparing equal to its twin. The preview is compared as the document it was given (srcdoc), not as painted pixels: a
 * difference only in how its controls are drawn is for the frames' pixel comparison and the signed build to find.
 */
import assert from 'node:assert/strict';

export function sameInBothThemes(seen) {
  assert.ok(seen.light.design.length > 20, 'the section page was read');
  assert.notEqual(seen.light.paper, seen.dark.paper, 'the app around them did change');
  assert.ok(seen.light.code && seen.light.code.includes('<html') && seen.light.code.length > 500, 'the exported index.html was read');
  assert.equal(seen.dark.code, seen.light.code, 'the exported index.html');
  assert.ok(seen.light.catalog.length >= 2, 'the catalog showed its previews');
  assert.equal(seen.dark.catalog.length, seen.light.catalog.length, 'as many catalog previews in both');
  seen.light.catalog.forEach((shot, i) => assert.ok(shot === seen.dark.catalog[i], 'catalog preview ' + (i + 1) + ', pixel for pixel'));
  assert.ok(seen.light.frames.length >= 2, 'both free pages were on screen');
  assert.equal(seen.dark.frames.length, seen.light.frames.length, 'as many free pages in both');
  seen.light.frames.forEach((shot, i) => assert.ok(shot === seen.dark.frames[i], 'free page ' + (i + 1) + ', pixel for pixel, its own dark rule unanswered'));
  assert.ok(seen.light.preview, 'the preview was read');
  assert.deepEqual(seen.dark.design, seen.light.design, 'the section page\'s colours, every element');
  assert.ok(seen.light.design.every(s => / light /.test(s)), 'every element of the section page is drawn light');
  assert.equal(seen.dark.preview, seen.light.preview, 'the preview\'s document');
}
