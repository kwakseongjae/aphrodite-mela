/**
 * The app document's own policy, for the desktop app (tauri.conf.json) and the browser build (vite's
 * preview and dev servers): one source, so the two cannot drift apart unnoticed (tests/csp.test.ts).
 *
 * `frame-src` is what keeps a free page from sending its own frame somewhere else: a frame's policy
 * cannot forbid that, the policy of the document that holds the frame can (RESULTS 0.3-P0 §1). The
 * desktop loads free pages from the asset protocol and nothing else into frames; the browser build
 * draws them with srcdoc, which frame-src does not govern, so it allows no address at all.
 *
 * They differ in one more place, on purpose. A srcdoc frame runs under the policy of the document
 * that holds it as well as its own, so the browser build has to allow inline scripts for a free page's
 * scripts to run at all. The desktop does not draw free pages with srcdoc and keeps `script-src 'self'`.
 */
const ASSET = 'asset: http://asset.localhost';

/** @param {'desktop' | 'browser'} target */
export function appPolicy(target) {
  const desktop = target === 'desktop';
  return [
    "default-src 'self'",
    `img-src 'self' ${ASSET} data: blob:`,
    `media-src 'self' ${ASSET} data: blob:`,
    "style-src 'self' 'unsafe-inline'",
    desktop ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'",
    desktop ? `frame-src ${ASSET}` : "frame-src 'none'",
    desktop ? "connect-src 'self' ipc: http://ipc.localhost" : "connect-src 'self'",
  ].join('; ');
}
