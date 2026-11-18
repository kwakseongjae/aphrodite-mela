// `node --import ./tests/support/raw.mjs` (or tsx --import): lets render.ts and the rest of the
// page pipeline load outside Vite, so a page can be rendered without the app.
import {register} from 'node:module';
register('./raw-hooks.mjs', import.meta.url);
