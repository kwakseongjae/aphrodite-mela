import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,makeBlock,parseProject,fingerprint} from '../src/model';
import {sceneManifest} from '../src/components';
import {collectionRows} from '../src/design/collection';
import {planVibe} from '../src/design/vibe';
import {layerMove} from '../src/editor/layer-reorder';
import {applyEditorCommand} from '../src/editor/commands';
import {changeReceipt} from '../src/agent/run';

test('reference variants and per-item media round-trip and are included in scene slots',()=>{
 const p=initialProject(),hero=makeBlock('hero'),products=makeBlock('products',true);
 hero.variant='editorial-wide';products.variant='editorial';products.description='Reviewed collection story';products.itemImages=['/assets/lighting-hero.png','','/assets/living.jpg'];p.pages[0].blocks=[hero,products];
 const restored=parseProject(JSON.stringify(p));assert.equal(fingerprint(restored),fingerprint(p));
 const scene=sceneManifest(p).pages[0].nodes[1];assert.deepEqual(scene.slots.itemImages,products.itemImages);assert.equal(scene.slots.description,products.description);
 assert.deepEqual(collectionRows(products).map(r=>r.image),products.itemImages);
 delete products.itemImages;assert.ok(collectionRows(products).every(r=>r.image===products.image));
 for(const bad of [['https://untrusted/image.png'],Array(31).fill(''),[null]])assert.throws(()=>parseProject(JSON.stringify({...p,pages:[{...p.pages[0],blocks:[{...products,itemImages:bad}]}]})),/collection images/);
});
test('missing media counts visible product slots after planned copy changes',()=>{
 const b=makeBlock('products');let plan=planVibe([b],'lighting',{copy:true,images:true,replace:false,language:'en'});
 assert.equal(plan.missingAssets.length,1);assert.deepEqual(plan.missingImageSlots.map(s=>s.index),[0,1,2]);
 b.itemImages=['/assets/lighting-hero.png',''];plan=planVibe([b],'lighting',{copy:true,images:true,replace:false,language:'en'});assert.deepEqual(plan.missingImageSlots.map(s=>s.index),[1,2]);
});
test('layer drop positions are reversible, reject cycles and report pure order changes',()=>{
 const p=initialProject(),blocks=p.pages[0].blocks,[nav,hero,feature,products]=blocks,before=structuredClone(p);
 const command=layerMove(blocks,feature.id,products.id,true)!;assert.equal(applyEditorCommand(blocks,command),true);
 assert.deepEqual(blocks.slice(0,4).map(b=>b.id),[nav.id,hero.id,products.id,feature.id]);
 assert.equal(feature.layout,undefined);assert.equal(changeReceipt(before,p).pageOrders.length,1);
 const snapshot=JSON.stringify(blocks);assert.equal(applyEditorCommand(blocks,command),false);assert.equal(JSON.stringify(blocks),snapshot);
 assert.equal(layerMove(blocks,hero.id,hero.id),null);
 const frame=makeBlock('frame'),child=makeBlock('button');child.parentId=frame.id;assert.equal(layerMove([frame,child],frame.id,child.id),null);
 const undo=layerMove(blocks,feature.id,products.id)!;applyEditorCommand(blocks,undo);assert.equal(fingerprint(p),fingerprint(before));
});
test('receipt captures removed layout field instead of empty changed-field list',()=>{
 const p=initialProject();p.pages[0].blocks[0].layout={widthPx:500};const before=structuredClone(p);delete p.pages[0].blocks[0].layout;
 assert.ok(changeReceipt(before,p).changedNodes[0].fields.includes('layout'));
});
