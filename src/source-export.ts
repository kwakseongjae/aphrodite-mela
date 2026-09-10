import runtimeSource from './vendor/runtime.tsx?raw';
import buttonSource from './vendor/shadcn-button.tsx?raw';
import shadcnLicense from './vendor/SHADCN-LICENSE.txt?raw';
import buildScript from '../scripts/build-library-runtime.mjs?raw';
import rebuildScript from '../scripts/rebuild-pages.mjs?raw';
import licenses from './generated/licenses.json';
import pkg from '../package.json';
import { providers } from './providers';
export function sourceFiles():Record<string,string>{
 const dependencies=Object.fromEntries(Object.entries(pkg.dependencies).filter(([k])=>!k.startsWith('@tauri')&&!['fflate','lucide'].includes(k)));
 return {
  'LIBRARIES.json':JSON.stringify(providers,null,2),
  'LICENSES.json':JSON.stringify(licenses,null,2),
  'react-source/package.json':JSON.stringify({name:'aphrodite-handoff',private:true,type:'module',scripts:{build:'node scripts/build-library-runtime.mjs && node scripts/rebuild-pages.mjs'},dependencies,devDependencies:{esbuild:pkg.devDependencies.esbuild,tailwindcss:pkg.devDependencies.tailwindcss}},null,2),
  'react-source/src/vendor/runtime.tsx':runtimeSource,
  'react-source/src/vendor/shadcn-button.tsx':buttonSource,
  'react-source/src/vendor/SHADCN-LICENSE.txt':shadcnLicense,
  'react-source/scripts/build-library-runtime.mjs':buildScript,
  'react-source/scripts/rebuild-pages.mjs':rebuildScript,
  'react-source/README.md':'# Editable official React adapters\n\nRun npm install && npm run build (Node 22+). Open dist/index.html. Edit src/vendor/runtime.tsx or shadcn-button.tsx, then rebuild. templates/ contains the reviewed composition; import project.aphrodite.json into Aphrodite for structural edits. This is a rebuildable visual prototype, not a complete production application. Official adapters run in sandboxed frames to isolate library CSS. MUI Button/TextField/Card; Astryx/SEED/shadcn Button only. Astryx/SEED retain official default themes. Parent layout and data remain in SCENE.json and project.aphrodite.json.\n',
 };
}
