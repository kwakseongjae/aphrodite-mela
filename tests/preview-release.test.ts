import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';

test('all three signing modes keep the stable release routing and isolate preview drafts', () => {
  const flow = releaseWorkflow();
  const builds = flow.jobs.build.steps.filter((s: {uses?:string}) => s.uses === 'tauri-apps/tauri-action@v0');
  // The release settings at ff08a22 had two full signed drafts and one unsigned prerelease draft.
  assert.deepEqual(builds.map((s:{if:string})=>s.if), ["steps.signing.outputs.mode == 'apikey'", "steps.signing.outputs.mode == 'appleid'", "steps.signing.outputs.mode == 'unsigned'"]);
  assert.deepEqual(flow.jobs.build.strategy.matrix.include.map((row:{target:string})=>row.target), ['aarch64-apple-darwin','x86_64-apple-darwin']);
  const channel = flow.jobs.build.steps.find((s:{id?:string})=>s.id==='channel');
  assert.equal(channel.if, "contains(env.TAG, '-preview.')");
  assert.match(channel.run, /build-preview\.mjs --version "\$\{TAG#v\}" --target "\$TARGET" --config-only/);
  assert.match(channel.run, /args=--config src-tauri\/target\/preview.conf.json/);
  assert.match(channel.run, /assets=Aphrodite_\[version\]_\[arch\]\[ext\]/);
  assert.equal(flow.jobs.build.if, "github.event_name != 'release'");
  for (const step of builds) {
    const args = step.with;
    assert.equal(args.tagName, '${{ env.TAG }}');
    assert.equal(args.releaseDraft, true);
    assert.equal(args.releaseBody, '${{ steps.notes.outputs.body }}');
    assert.equal(args.releaseName, 'Aphrodite ${{ env.TAG }}');
    assert.equal(args.assetNamePattern, '${{ steps.channel.outputs.assets }}');
    assert.equal(args.prerelease, step.if.includes("'unsigned'") ? true : "${{ contains(env.TAG, '-preview.') }}");
    assert.equal(args.includeUpdaterJson, "${{ !contains(env.TAG, '-preview.') }}");
    assert.match(args.args, /^--target \$\{\{ matrix.target \}\} --bundles dmg,app/);
    assert.match(args.args, /steps.channel.outputs.args/);
  }
  const on = flow.on ?? flow.true; // Ruby's system YAML parser also accepts YAML 1.1.
  assert.deepEqual(on.release.types,['published','edited']);
  assert.equal(flow.jobs['promote-preview'].steps.at(-1).run, 'node scripts/promote-preview.mjs');
  assert.match(flow.jobs['promote-preview'].if, /github.event_name == 'release' && github.event.action == 'published' && github.event.release.prerelease/);
  assert.match(flow.jobs['promote-preview'].if, /contains\(github.event.release.tag_name, '-preview\.'\)/);
});

test('only a complete published preview can advance the fixed manifest for both Macs', async () => {
  const {previewManifest, olderPreview} = await import(new URL('../scripts/promote-preview.mjs', import.meta.url).href);
  const {release,version,assets} = publishedPreview();
  const signature = (asset:{name:string}) => 'signed ' + asset.name;
  const index = previewManifest(release, signature);
  assert.equal(index.version, version);
  for (const [platform,arch] of [['darwin-aarch64','aarch64'],['darwin-x86_64','x64']]) {
    const archive = assets.find(a=>a.name.endsWith(arch+'.app.tar.gz'))!;
    assert.deepEqual(index.platforms[platform], {url:archive.browser_download_url,signature:'signed '+archive.name+'.sig'});
  }
  for (const change of [{draft:true},{prerelease:false},{tag_name:'v0.3.0'},{assets:assets.slice(1)},{assets:assets.slice(0,-1)}]) {
    assert.throws(()=>previewManifest({...release,...change}, signature));
  }
  assert.throws(()=>previewManifest(release, ()=>''));
  assert.equal(olderPreview('0.3.0-preview.2', version),true);
  assert.equal(olderPreview(version, '0.3.0-preview.2'),false);
  assert.equal(olderPreview(version, version),false);
});

function publishedPreview() {
  const version = '0.3.0-preview.10';
  const assets = ['aarch64','x64'].flatMap(arch => ['.dmg','.app.tar.gz','.app.tar.gz.sig'].map(ext=>{
    const name = `Aphrodite_${version}_${arch}${ext}`;
    return {name,state:'uploaded',size:12,browser_download_url:`https://github.com/owner/app/releases/download/v${version}/${name}`};
  }));
  const release = {tag_name:'v'+version, prerelease:true, draft:false, assets, published_at:'2026-11-27T00:00:00Z', body:'Notes'};
  return {release,version,assets};
}

test('a preview writes only preview.json and refuses releases carrying the stable index', async () => {
  const {promotePreview} = await import(new URL('../scripts/promote-preview.mjs', import.meta.url).href);
  const {release} = publishedPreview();
  const channel = {...release, tag_name:'preview-channel', assets:[] as {name:string}[]};
  const uploads:string[] = [];
  const promote = () => promotePreview(release.tag_name, (tag:string)=>tag===channel.tag_name ? channel : release,
    ()=>'signature', (name:string)=>uploads.push(name));
  promote();
  assert.deepEqual(uploads,['preview.json']);
  channel.assets.push({name:'latest.json'});
  assert.throws(promote,/latest.json/);
  channel.assets.pop();
  release.assets.push({...release.assets[0], name:'latest.json'});
  assert.throws(promote,/latest.json/);
  assert.equal(uploads.length,1);
});

function releaseWorkflow() {
  const file = '.github/workflows/release.yml';
  return JSON.parse(execFileSync('ruby', ['-ryaml','-rjson','-e','puts JSON.generate(YAML.safe_load(File.read(ARGV[0])))', file], {encoding:'utf8'}));
}

test('publishing or editing a full preview release restores its flag and fails the run', () => {
  const flow = releaseWorkflow();
  const guard = flow.jobs['repair-preview'];
  assert.equal(guard.if, "github.event_name == 'release' && contains(github.event.release.tag_name, '-preview.') && !github.event.release.prerelease");
  const step = guard.steps[0];
  assert.equal(step.env.TAG, '${{ github.event.release.tag_name }}');
  assert.equal(step.env.GH_TOKEN, '${{ secrets.GITHUB_TOKEN }}');
  const result = spawnSync('bash',['-ec', 'gh() { echo "$*"; }\n' + step.run], {
    encoding:'utf8', env:{...process.env, TAG:'v0.3.0-preview.1', GITHUB_REPOSITORY:'owner/app'}
  });
  assert.equal(result.status,1);
  assert.match(result.stdout,/release edit v0.3.0-preview.1 --prerelease --repo owner\/app/);
  assert.match(result.stdout,/::error::.*restored.*prerelease/i);
  assert.equal(flow.jobs['promote-preview'].if, "github.event_name == 'release' && github.event.action == 'published' && github.event.release.prerelease && contains(github.event.release.tag_name, '-preview.')");
});

test('the promotion job checks the fixed release again immediately before writing', async () => {
  const flow = releaseWorkflow();
  assert.equal(flow.jobs['promote-preview'].steps.at(-1).run, 'node scripts/promote-preview.mjs');
  const {promotePreview} = await import(new URL('../scripts/promote-preview.mjs', import.meta.url).href);
  const {release} = publishedPreview();
  let prerelease = true;
  const read = (tag:string) => tag===release.tag_name ? release : {...release, tag_name:tag, assets:[], prerelease};
  const readAsset = () => { prerelease=false; return 'signature'; };
  let uploads = 0;
  const promote = () => promotePreview(release.tag_name, read, readAsset, ()=>uploads++);
  assert.throws(promote,/preview-channel.*prerelease/);
  assert.throws(promote,/preview-channel.*prerelease/);
  assert.equal(uploads,0);
});
