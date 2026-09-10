import runtimeSource from './vendor/runtime.tsx?raw';
import buttonSource from './vendor/shadcn-button.tsx?raw';
import shadcnLicense from './vendor/SHADCN-LICENSE.txt?raw';
import shadcnUtils from './vendor/shadcn/utils.ts?raw';
import shadcnInput from './vendor/shadcn/input.tsx?raw';
import shadcnTextarea from './vendor/shadcn/textarea.tsx?raw';
import shadcnCard from './vendor/shadcn/card.tsx?raw';
import shadcnBadge from './vendor/shadcn/badge.tsx?raw';
import shadcnTable from './vendor/shadcn/table.tsx?raw';
import shadcnSkeleton from './vendor/shadcn/skeleton.tsx?raw';
import shadcnAlert from './vendor/shadcn/alert.tsx?raw';
import shadcnBreadcrumb from './vendor/shadcn/breadcrumb.tsx?raw';
import shadcnPagination from './vendor/shadcn/pagination.tsx?raw';
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
  'react-source/src/vendor/shadcn/utils.ts':shadcnUtils,
  'react-source/src/vendor/shadcn/input.tsx':shadcnInput,
  'react-source/src/vendor/shadcn/textarea.tsx':shadcnTextarea,
  'react-source/src/vendor/shadcn/card.tsx':shadcnCard,
  'react-source/src/vendor/shadcn/badge.tsx':shadcnBadge,
  'react-source/src/vendor/shadcn/table.tsx':shadcnTable,
  'react-source/src/vendor/shadcn/skeleton.tsx':shadcnSkeleton,
  'react-source/src/vendor/shadcn/alert.tsx':shadcnAlert,
  'react-source/src/vendor/shadcn/breadcrumb.tsx':shadcnBreadcrumb,
  'react-source/src/vendor/shadcn/pagination.tsx':shadcnPagination,
  'react-source/scripts/build-library-runtime.mjs':buildScript,
  'react-source/scripts/rebuild-pages.mjs':rebuildScript,
  'react-source/README.md':'# Editable official React adapters\n\nRun npm install && npm run build (Node 22+). Open dist/index.html. Edit src/vendor/runtime.tsx or shadcn-button.tsx, then rebuild. templates/ contains the reviewed composition; import project.aphrodite.json into Aphrodite for structural edits. This is a rebuildable visual prototype, not a complete production application. Official adapters run in sandboxed frames to isolate library CSS. MUI Button/TextField/Card; Astryx/SEED/shadcn Button only. Astryx/SEED retain official default themes. Parent layout and data remain in SCENE.json and project.aphrodite.json.\n',
 };
}
