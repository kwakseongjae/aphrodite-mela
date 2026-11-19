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

/**
 * The browser build's index.html carries the policy itself, so dist/ keeps it on whatever static server
 * it is put on (0.3-P2-fix1). Nothing the policy holds is lost in a meta tag (no frame-ancestors, report
 * or sandbox directive). The desktop build leaves it out: Tauri gives the window the desktop policy, and
 * two policies both apply, which would close the asset frames. TAURI_ENV_PLATFORM is how a build knows:
 * the Tauri CLI sets it for the commands it runs (tauri dev, tauri build).
 */
export function policyInHtml(html, env = process.env) {
  if (env.TAURI_ENV_PLATFORM) return html;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${appPolicy('browser')}">`;
  const at = html.search(/<meta charset[^>]*>/i);
  if (at < 0) throw new Error('index.html has no <meta charset> to put the policy after');
  const end = html.indexOf('>', at) + 1;
  return html.slice(0, end) + '\n    ' + meta + html.slice(end);
}
