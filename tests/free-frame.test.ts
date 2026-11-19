/**
 * 0.3-P2: a free page is drawn in a frame that keeps it on this Mac. The document the frame loads is
 * built in one place (src/free-page.ts): the page's own CSP comes before anything the page wrote, and a
 * picture or a video it names as `media:<sha256>` becomes a real address only there.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frameCsp, framedDocument, renderShell, FRAME_PREFIX_END, MAX_FRAMED_DOCUMENT} from '../src/free-page.ts';

const SHA = 'b'.repeat(64);
const directives = (csp: string) => new Map(csp.split(';').map(d => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));

test('the frame policy lets the page run and draw, and reach nothing', () => {
  const csp = directives(frameCsp([]));
  for (const [name, values] of [['default-src', ["'none'"]], ['connect-src', ["'none'"]], ['frame-src', ["'none'"]], ['worker-src', ["'none'"]], ['object-src', ["'none'"]], ['form-action', ["'none'"]], ['base-uri', ["'none'"]], ['webrtc', ["'block'"]], ['script-src', ["'unsafe-inline'"]], ['style-src', ["'unsafe-inline'"]], ['font-src', ['data:']], ['img-src', ['data:']], ['media-src', ['data:']]] as const)
    assert.deepEqual(csp.get(name), values, name);
});

test('media may come from the one place the host names, and nowhere else', () => {
  const csp = directives(frameCsp(['asset:', 'http://asset.localhost']));
  assert.deepEqual(csp.get('img-src'), ['data:', 'asset:', 'http://asset.localhost']);
  assert.deepEqual(csp.get('media-src'), ['data:', 'asset:', 'http://asset.localhost']);
  for (const bad of ['*', 'https:', 'http:', "'self'; connect-src *", 'asset: https://example.com', 'blob:'])
    assert.throws(() => frameCsp([bad]), /media origin/, bad);
});

test('the policy comes first, before anything the page wrote, whatever the page holds', () => {
  for (const html of ['<p>Hello</p>', '<!doctype html><html><head><title>x</title></head><body>x</body></html>', '<!-- <head> --><header>top</header><p>x</p>', '<script>document.write("<meta>")</script>']) {
    const doc = framedDocument(html, {media: () => undefined, origins: []});
    assert.ok(doc.startsWith('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + frameCsp([]) + '">'), html);
    const at = doc.indexOf(FRAME_PREFIX_END);
    assert.ok(at > 0, 'the host part ends where it says');
    assert.equal(doc.slice(at + FRAME_PREFIX_END.length), html, 'the page follows, unchanged');
    assert.ok(doc.length - html.length < 4096, 'the host part is small');
  }
});

test('the charset is declared inside the first bytes, so a page read from a file is read as UTF-8', () => {
  const doc = framedDocument('<p>한글</p>', {media: () => undefined, origins: []});
  assert.ok(doc.indexOf('<meta charset="utf-8">') < 64);
});

test('media:<sha256> becomes the address the host gives, and only a whole hash does', () => {
  const html = `<img src="media:${SHA}"><video src='media:${SHA}'></video><div style="background:url(media:${SHA})"></div><img src="media:${SHA.slice(1)}"><p>media:${SHA}</p>`;
  const doc = framedDocument(html, {media: sha => sha === SHA ? 'asset://localhost/board-media/' + sha + '.png' : undefined, origins: ['asset:']});
  const page = doc.slice(doc.indexOf(FRAME_PREFIX_END) + FRAME_PREFIX_END.length);
  assert.equal(page.split('asset://localhost/board-media/').length - 1, 4, 'every whole reference');
  assert.ok(page.includes(`media:${SHA.slice(1)}"`), 'a hash cut short is left as it was');
  const none = framedDocument(html, {media: () => undefined, origins: []});
  assert.ok(none.endsWith(html), 'a hash the host does not hold is left as it was');
});

test('an address the host gives that could break out of the attribute is refused', () => {
  for (const bad of ['x" onerror="alert(1)', "x'", 'x)', 'x y', 'javascript:alert(1)'])
    assert.throws(() => framedDocument(`<img src="media:${SHA}">`, {media: () => bad, origins: []}), /media address/, bad);
});

/* The off-screen render window is a top-level page of its own, not a frame on the board: a page drawn
   there straight could send the window anywhere (RESULTS 0.3-P0 §4). So it is drawn inside the same
   sandboxed frame, under a shell whose own policy lets the frame go nowhere. */
test('a page is photographed inside a sandboxed frame that may not be sent anywhere', () => {
  const doc = framedDocument('<p>"quoted" & <b>bold</b></p>', {media: () => undefined, origins: []});
  const shell = renderShell(doc, []);
  const policy = directives(shell.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)![1]);
  assert.deepEqual(policy.get('frame-src'), ["'none'"], 'the frame cannot be sent to an address');
  assert.deepEqual(policy.get('connect-src'), ["'none'"]);
  assert.deepEqual(policy.get('default-src'), ["'none'"]);
  const frames = shell.match(/<iframe[^>]*srcdoc="[^"]*"[^>]*>/g)!;
  assert.equal(frames.length, 1);
  assert.match(frames[0], /sandbox="allow-scripts"/);
  assert.doesNotMatch(frames[0], /allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
  const srcdoc = frames[0].match(/srcdoc="([^"]*)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.equal(srcdoc, doc, 'the frame holds the page exactly');
  assert.doesNotMatch(shell.replace(frames[0], ''), /<script/i, 'the shell runs nothing of its own');
  assert.ok(shell.length - doc.length < 1024, 'escaping only & and " keeps the shell close to the page in size');
});

/* 0.3-P2-fix1: connect-src does not govern WebRTC, and neither engine enforces the webrtc directive yet
   (measured in Chrome and WKWebView). What keeps it off is the script the frame runs first. */
test('the frame takes WebRTC and the other ways out off the window before the page runs', () => {
  const doc = framedDocument('<script>new RTCPeerConnection()</script>', {media: () => undefined, origins: []});
  const wall = doc.indexOf('RTC'), page = doc.indexOf(FRAME_PREFIX_END);
  assert.ok(wall > 0 && wall < page, 'it comes before the page');
  assert.ok(doc.indexOf('<script>') < wall && doc.indexOf('Content-Security-Policy') < doc.indexOf('<script>'));
  for (const name of ['mediaDevices', 'WebTransport', 'Presentation', 'attachShadow', 'MutationObserver', 'iframe,frame,object,embed']) assert.ok(doc.slice(0, page).includes(name), name);
  const dsd = framedDocument('<div><template shadowrootmode="closed"><iframe></iframe></template></div><template ShadowRoot = open>', {media: () => undefined, origins: []});
  assert.doesNotMatch(dsd.slice(dsd.indexOf(FRAME_PREFIX_END)), /\sshadowroot(mode)?\s*=/i, 'a page cannot have the parser make a shadow root the watcher cannot see');
  const shell = renderShell(doc, []);
  assert.match(shell.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)![1], /webrtc 'block'/);
});

/* 0.3-P2-fix1 #8: a file put inline (the browser build gives a frame its pictures as data: URLs) is counted
   before the document is built: one picture named a thousand times does not make gigabytes. */
test('media put inline is measured before the document is built, and what would not fit is left unresolved', () => {
  const sha = 'a'.repeat(64), other = 'b'.repeat(64);
  const big = 'data:image/png;base64,' + 'A'.repeat(2_000_000);
  const html = `<img src="media:${other}">` + `<img src="media:${sha}">`.repeat(1000);
  const doc = framedDocument(html, {media: s => s === sha ? big : 'data:image/png;base64,AAAA', origins: []});
  assert.ok(doc.length <= MAX_FRAMED_DOCUMENT, `${doc.length} characters`);
  assert.ok(doc.includes('data:image/png;base64,AAAA'), 'what fits is resolved');
  assert.ok(doc.includes(`media:${sha}`), 'what does not is left as it was, and loads nothing');
  const fits = framedDocument(`<img src="media:${sha}">`.repeat(3), {media: () => big, origins: []});
  assert.equal(fits.split(big).length - 1, 3, 'a few big pictures within the cap are all put in');
});
