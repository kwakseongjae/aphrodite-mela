import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('all three signing modes keep the stable release routing and isolate preview drafts', () => {
  const flow = releaseWorkflow();
  const builds = flow.jobs.build.steps.filter((s: {uses?:string}) => s.uses === 'tauri-apps/tauri-action@v0');
  // The release settings at ff08a22 had two full signed drafts and one unsigned prerelease draft.
  assert.deepEqual(builds.map((s:{if:string})=>s.if), ["steps.signing.outputs.mode == 'apikey'", "steps.signing.outputs.mode == 'appleid'", "steps.signing.outputs.mode == 'unsigned' && !contains(env.TAG, '-preview.')"]);
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
  const index = previewManifest(release, signedContents, fixtureKey);
  assert.equal(index.version, version);
  for (const [platform,arch] of [['darwin-aarch64','aarch64'],['darwin-x86_64','x64']]) {
    const archive = assets.find(a=>a.name.endsWith(arch+'.app.tar.gz'))!;
    assert.deepEqual(index.platforms[platform], {url:archive.browser_download_url,signature:fixtureSignature});
  }
  for (const change of [{draft:true},{prerelease:false},{tag_name:'v0.3.0'},{assets:assets.slice(1)},{assets:assets.slice(0,-1)}]) {
    assert.throws(()=>previewManifest({...release,...change}, signedContents, fixtureKey));
  }
  assert.throws(()=>previewManifest(release, ()=>'', fixtureKey));
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
    signedContents, (name:string)=>uploads.push(name), fixtureKey);
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

test('publishing or editing a full preview release, or the fixed channel release, restores its flag and fails the run', () => {
  const flow = releaseWorkflow();
  const guard = flow.jobs['repair-preview'];
  assert.equal(guard.if, "github.event_name == 'release' && !github.event.release.prerelease && (contains(github.event.release.tag_name, '-preview.') || github.event.release.tag_name == 'preview-channel')");
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
  const readAsset = (asset:{name:string}) => { prerelease=false; return signedContents(asset); };
  let uploads = 0;
  const promote = () => promotePreview(release.tag_name, read, readAsset, ()=>uploads++, fixtureKey);
  assert.throws(promote,/preview-channel.*prerelease/);
  assert.throws(promote,/preview-channel.*prerelease/);
  assert.equal(uploads,0);
});

// Published verification vector from minisign-verify 0.2.5 (verify_prehashed). No signing keys are needed.
const encoded = (text:string) => Buffer.from(text).toString('base64');
const fixtureKey = encoded('untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3');
const fixtureSignature = encoded([
  'untrusted comment: signature from minisign secret key',
  'RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=',
  'trusted comment: timestamp:1556193335\tfile:test',
  'y/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==',
].join('\n'));
function signedContents(asset:{name:string}) {
  return asset.name.endsWith('.sig') ? fixtureSignature : 'test';
}

test('promotion verifies each archive against the configured updater key before any upload', async () => {
  const {promotePreview} = await import(new URL('../scripts/promote-preview.mjs', import.meta.url).href);
  const {release} = publishedPreview();
  const read = (tag:string) => tag===release.tag_name ? release : {...release,tag_name:tag,assets:[]};
  let uploads = 0;
  const upload = () => uploads++;
  assert.throws(()=>promotePreview(release.tag_name,read,signedContents,upload),/signature/i,'the real configured key refuses the fixture signature');
  for (const arch of ['aarch64','x64']) {
    const contents = (asset:{name:string}) => asset.name.endsWith(arch+'.app.tar.gz') ? 'changed' : signedContents(asset);
    assert.throws(()=>promotePreview(release.tag_name,read,contents,upload,fixtureKey),/signature/i);
  }
  assert.equal(uploads,0);
});

test('the unsigned path fails a preview build before any release action', () => {
  const steps = releaseWorkflow().jobs.build.steps;
  const i = steps.findIndex((s:{if?:string})=>s.if==="steps.signing.outputs.mode == 'unsigned' && contains(env.TAG, '-preview.')");
  assert.ok(i >= 0 && i < steps.findIndex((s:{uses?:string})=>s.uses==='tauri-apps/tauri-action@v0'));
  const result = spawnSync('bash',['-ec',steps[i].run],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stdout,/::error::.*sign/i);
});

function readNotes(tag:string, cwd:string, output:string) {
  const step = releaseWorkflow().jobs.build.steps.find((s:{id?:string})=>s.id==='notes');
  return spawnSync('bash',['-eo','pipefail','-c',step.run],{cwd,encoding:'utf8',
    env:{...process.env,TAG:tag,GITHUB_OUTPUT:output}});
}

test('only the selected tag’s finished notes can become its release body', t => {
  const dir = mkdtempSync(join(tmpdir(),'aph-release-notes-'));
  t.after(()=>rmSync(dir,{recursive:true}));
  mkdirSync(join(dir,'docs'));
  const draft = 'v0.3.0-preview.1', ready = 'v0.3.0-preview.2';
  writeFileSync(join(dir,'docs',`RELEASE-NOTES-${draft}.md`),'[PLACEHOLDER — preview download page link]');
  writeFileSync(join(dir,'docs',`RELEASE-NOTES-${ready}.md`),'[Download Preview](https://example.org/preview)');
  const output = join(dir,'output');
  assert.notEqual(readNotes(draft,dir,output).status,0);
  assert.equal(readNotes(ready,dir,output).status,0);
  assert.match(readFileSync(output,'utf8'),/Download Preview/);
  assert.doesNotMatch(readFileSync(output,'utf8'),/PLACEHOLDER/);
  assert.notEqual(readNotes('v0.3.0-preview.3',dir,output).status,0);
  assert.equal(releaseWorkflow().jobs.build.steps[0].with.ref,'refs/tags/${{ env.TAG }}');
});

if (process.env.TAG) test('the release notes for the tag being built are ready', t => {
  const dir = mkdtempSync(join(tmpdir(),'aph-tag-notes-'));
  t.after(()=>rmSync(dir,{recursive:true}));
  const result = readNotes(process.env.TAG!,process.cwd(),join(dir,'output'));
  assert.equal(result.status,0,result.stdout+result.stderr);
});

test('the known limit names the page preview window', () => {
  assert.match(readFileSync('docs/RELEASE-NOTES-v0.3.0-preview.1.md','utf8'),/A link inside the page preview can open a hidden page separately/);
});
