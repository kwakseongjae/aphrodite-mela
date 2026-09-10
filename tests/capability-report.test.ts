import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,makeBlock} from '../src/model';
import {capabilityReport} from '../src/design/capability-report';

test('consumer inventory separates adapter support from source conformance and future motion',()=>{
 const p=initialProject(),button=makeBlock('button');button.provider='seed';p.pages[0].blocks=[button];
 const before=JSON.stringify(p),report=capabilityReport(p);
 assert.equal(report.pages[0].nodes[0].adapterAvailable,true);
 assert.equal(report.pages[0].nodes[0].tokenMapping,'provider-default-theme');
 assert.equal(report.referenceConformance.status,'not-assessed');
 assert.equal(report.pageExperience.scrollMotionContract,'not-implemented');
 assert.equal(report.pageExperience.fullPageReferenceCoverage,'not-assessed');
 assert.equal(JSON.stringify(p),before);
});
test('capability inventory counts visible slots but does not infer media rights',()=>{
 const p=initialProject(),collection=makeBlock('products');collection.text='One|$1\nTwo|$2\nThree|$3';collection.itemImages=['/assets/lighting-hero.png',''];
 const hero=makeBlock('hero');hero.options={media:'calendar'};p.pages[0].blocks=[collection,hero];
 const nodes=capabilityReport(p).pages[0].nodes;
 assert.deepEqual(nodes[0].missingImageSlots,[1,2]);assert.equal(nodes[0].mediaRights,'not-assessed');
 assert.deepEqual(nodes[1].missingImageSlots,[]);
});
