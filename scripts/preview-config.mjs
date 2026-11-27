// A tag and a local build use the same merge patch. Arrays replace arrays in Tauri overrides.
import {readFileSync} from 'node:fs';

export const stableConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
export const previewChannel = 'preview-channel';

export function previewConfig(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-preview\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Expected a version such as 0.3.0-preview.1');
  }
  const stableEndpoint = stableConfig.plugins.updater.endpoints[0];
  return {
    productName: stableConfig.productName + ' Preview',
    identifier: stableConfig.identifier + '.preview',
    version,
    build: {beforeBuildCommand: `export APHRODITE_PREVIEW_VERSION='${version}' && ${stableConfig.build.beforeBuildCommand}`},
    bundle: {
      macOS: {infoPlist: 'Info.preview.plist'},
      fileAssociations: stableConfig.bundle.fileAssociations.map(type => ({...type, rank:'Alternate'})),
    },
    plugins: {updater: {endpoints: [stableEndpoint.replace('/latest/download/', `/download/${previewChannel}/`)]}},
  };
}
