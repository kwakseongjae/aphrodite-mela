import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBlock} from '../src/model';
import {demoAnchor} from '../src/design/demo-anchor';
test('inserting or moving CTA does not steal existing collection/footer demo anchors',()=>{
 const products=makeBlock('products'),footer=makeBlock('footer'),cta=makeBlock('cta');
 for(const blocks of [[products,footer],[cta,products,footer],[products,cta,footer],[footer,cta,products]]){
  assert.equal(demoAnchor(blocks,'collection'),`block-${products.id}`);assert.equal(demoAnchor(blocks,'contact'),`block-${footer.id}`);
 }
});
test('demo anchors explicitly fall back when target kind is absent',()=>{
 const cta=makeBlock('cta');assert.equal(demoAnchor([cta],'collection'),`block-${cta.id}`);assert.equal(demoAnchor([cta],'contact'),`block-${cta.id}`);assert.equal(demoAnchor([],'contact'),'top');
});
