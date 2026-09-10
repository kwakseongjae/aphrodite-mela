import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022' },
});
