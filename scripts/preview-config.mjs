// A tag and a local build use the same merge patch. Arrays replace arrays in Tauri overrides.
import {readFileSync} from 'node:fs';

export const stableConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
export const previewChannel = 'preview-channel';
export const previewIndex = 'preview.json';

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
      macOS: {infoPlist:'target/Info.preview.plist', bundleVersion:version.split('-preview.')[1]},
      fileAssociations: stableConfig.bundle.fileAssociations.map(type => ({...type, rank:'Alternate'})),
    },
    plugins: {updater: {endpoints: [new URL(`../../download/${previewChannel}/${previewIndex}`, stableEndpoint).href]}},
  };
}

// Tauri supplies its merge patch in CI. The local beforeBuildCommand selects the same preview explicitly.
export function buildIdentity() {
  const base = process.env.APHRODITE_PREVIEW_VERSION ? previewConfig(process.env.APHRODITE_PREVIEW_VERSION) : stableConfig;
  const patch = JSON.parse(process.env.TAURI_CONFIG || '{}');
  return {identifier:patch.identifier ?? base.identifier, version:patch.version ?? base.version};
}
