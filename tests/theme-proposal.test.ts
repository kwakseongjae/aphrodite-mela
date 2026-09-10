import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,fingerprint,isApproved} from '../src/model';
import {contrastRatio,onColor} from '../src/design/contrast';
import {themeProposal,applyThemeProposal} from '../src/design/theme-proposal';
test('Paper Muse text palette meets normal-text contrast',()=>{
 for(const text of ['#292820','#555047','#80601e'])assert.ok(contrastRatio(text,'#f7f5ef')>=4.5);
 assert.equal(contrastRatio('#ffffff','#ffffff'),1);
 for(const color of ['#ffffff','#d7b449','#006644','#2255cc','#777777'])assert.ok(contrastRatio(onColor(color),color)>=4.5);
});
test('theme preview is isolated; applying is explicit, undoable by caller, and not approval',()=>{
 const p=initialProject();p.approvedFingerprint=fingerprint(p);const before=JSON.stringify(p);
 const proposal=themeProposal(p,'#2255cc','sans');assert.equal(JSON.stringify(p),before);
 applyThemeProposal(p,proposal);assert.equal(p.system.accent,'#2255cc');assert.equal(isApproved(p),false);
 assert.throws(()=>applyThemeProposal(p,proposal),/changed/);
 assert.throws(()=>themeProposal(p,'red','sans'),/Invalid/);
});
