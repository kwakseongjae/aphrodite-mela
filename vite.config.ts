import { defineConfig } from 'vite';
import { buildIdentity, schemeForIdentifier } from './scripts/preview-config.mjs';
import { appPolicy, policyInHtml } from './src/csp.mjs';
const build = buildIdentity();
// The browser build runs under the app's own policy. `tauri dev` loads the dev server into the desktop
// webview, which takes its policy from tauri.conf.json, so the dev server only sends one to a browser.
const browserPolicy = { 'Content-Security-Policy': appPolicy('browser') };
const desktopDev = Boolean(process.env.TAURI_ENV_PLATFORM);
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] }, headers: desktopDev ? {} : browserPolicy },
  preview: { headers: browserPolicy },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: { __APP_VERSION__: JSON.stringify(build.version), __BOARD_SCHEME__: JSON.stringify(schemeForIdentifier(build.identifier)) },
  plugins: [{ name: 'app-policy', transformIndexHtml: { order: 'pre', handler: html => policyInHtml(html) } }],
  build: { target: 'es2022' },
});
