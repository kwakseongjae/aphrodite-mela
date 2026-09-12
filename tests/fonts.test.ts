import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fallbackStacks,sanitizeFamily,fontStack,isInstallable,freeFonts,fontsFor,licenseNote} from '../src/design/fonts';

test('the catalogue is unique, licensed and has installable files',()=>{
  assert.equal(new Set(freeFonts.map(f=>f.id)).size,freeFonts.length,'ids are unique');
  assert.ok(freeFonts.length>=14,'curated set is present');
  for(const font of freeFonts){
    assert.ok(font.files.length>=1,`${font.id} has a file`);
    assert.ok(font.files.every(file=>file.url.startsWith('https:')),`${font.id} files are https`);
    assert.ok(font.en.trim()&&font.ko.trim(),`${font.id} labelled in both languages`);
    assert.ok(font.license==='OFL-1.1'||font.license==='Apache-2.0',`${font.id} licence`);
    assert.equal(isInstallable(font.id),true,font.id);
  }
  assert.equal(isInstallable('not-a-font'),false);
});

test('sanitizeFamily keeps real family names and strips hostile input',()=>{
  for(const keep of ['Noto Sans KR','IBM Plex Sans','Source Serif 4','나눔명조','Gowun Dodum']){
    assert.equal(sanitizeFamily(keep),keep,keep);
  }
  assert.equal(sanitizeFamily('  IBM   Plex Sans  '),'IBM Plex Sans');
  const hostile=["Arial'; background:url(x)",'a"}</style><script>','Family;color:red','Fam(ily)','back\\slash','a'.repeat(200),'Arial\u0007'];
  for(const value of hostile)assert.equal(sanitizeFamily(value),'',value);
  for(const value of [{},1,null,undefined])assert.equal(sanitizeFamily(value),'');
});

test('fontStack quotes a family and always ends with the category fallback',()=>{
  assert.equal(fontStack({category:'serif'}),fallbackStacks.serif);
  assert.equal(fontStack({category:'sans'}),fallbackStacks.sans);
  assert.equal(fontStack({category:'mono'}),fallbackStacks.mono);
  assert.equal(fontStack({family:'Noto Sans KR',category:'serif'}),`'Noto Sans KR', ${fallbackStacks.serif}`);
  assert.ok(fontStack({family:'Inter',category:'mono'}).endsWith(fallbackStacks.mono));
  assert.equal(fontStack({family:"Arial'; background:url(x)",category:'sans'}),fallbackStacks.sans);
});

test('fontsFor filters by script coverage',()=>{
  const korean=fontsFor('korean');
  assert.ok(korean.length>0);
  assert.ok(korean.every(f=>f.scripts.includes('korean')));
  assert.equal(fontsFor('all').length,freeFonts.length);
});

test('licenseNote names the licence and differs by language',()=>{
  const font=freeFonts[0];
  const en=licenseNote(font,'en');
  const ko=licenseNote(font,'ko');
  assert.ok(en.includes(font.license));
  assert.ok(ko.includes(font.license));
  assert.notEqual(en,ko);
});
