// A published, versioned prerelease owns the binaries. The fixed prerelease owns only the index.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {previewChannel, previewConfig} from './preview-config.mjs';

function previewVersion(release) {
  if (release.draft || !release.prerelease || !release.tag_name.startsWith('v')) throw new Error('Expected a published preview tag');
  return previewConfig(release.tag_name.slice(1)).version;
}

export function previewManifest(release, signatureFor) {
  const version = previewVersion(release);
  const asset = name => {
    const matches = release.assets.filter(a => a.name === name && a.state === 'uploaded' && a.size > 0);
    if (matches.length !== 1) throw new Error(`Missing published asset: ${name}`);
    return matches[0];
  };
  const platforms = {};
  for (const [platform,arch] of [['darwin-aarch64','aarch64'],['darwin-x86_64','x64']]) {
    const prefix = `Aphrodite_${version}_${arch}`;
    asset(prefix + '.dmg');
    const archive = asset(prefix + '.app.tar.gz');
    const signature = signatureFor(asset(archive.name + '.sig')).trim();
    if (!signature) throw new Error('Empty updater signature for ' + archive.name);
    platforms[platform] = {url:archive.browser_download_url, signature};
  }
  return {version, notes:release.body, pub_date:release.published_at, platforms};
}

export function olderPreview(candidate, existing) {
  const parts = version => previewConfig(version).version.split(/\.|-preview\./).map(BigInt);
  const a = parts(candidate), b = parts(existing);
  const i = a.findIndex((value, i) => value !== b[i]);
  return i >= 0 && a[i] < b[i];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {TAG:tag, GITHUB_REPOSITORY:repo} = process.env;
  const gh = (...args) => execFileSync('gh', args, {encoding:'utf8'});
  const release = name => JSON.parse(gh('api', `repos/${repo}/releases/tags/${name}`));
  const source = release(tag);
  if (source.tag_name !== tag) throw new Error('Wrong source tag');
  const version = previewVersion(source);
  const channel = release(previewChannel);
  if (channel.tag_name !== previewChannel || channel.draft || !channel.prerelease || channel.immutable) {
    throw new Error('The preview-channel prerelease must be published and allow asset updates');
  }
  const contents = asset => gh('api', '-H', 'Accept: application/octet-stream', `repos/${repo}/releases/assets/${asset.id}`);
  const current = channel.assets.find(a => a.name === 'latest.json');
  if (current && olderPreview(version, JSON.parse(contents(current)).version)) {
    console.log('The channel already names a newer preview.');
  } else {
    const manifest = previewManifest(source, contents);
    writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
    gh('release', 'upload', previewChannel, 'latest.json', '--clobber', '--repo', repo);
  }
}
