import {test} from 'node:test';
import assert from 'node:assert/strict';
import {didYouMean,unknownValue,missingField} from '../src/agent/errors';

const kinds=['hero','features','products','testimonial','cta','footer','navigation','frame'];

test('a near miss is suggested and a wild guess is not',()=>{
  assert.equal(didYouMean('hero',kinds),'hero');
  assert.equal(didYouMean('Hero',kinds),'hero');
  assert.equal(didYouMean('feature',kinds),'features');
  assert.equal(didYouMean('footer-bar',kinds),'footer');
  assert.equal(didYouMean('',kinds),undefined);
  assert.equal(didYouMean('xylophone',kinds),undefined,'nothing close enough to suggest');
});

test('an unknown value error carries the valid list, the near miss and the next step',()=>{
  const message=unknownValue('component_kind','hero-large',kinds,'Call aphrodite_list_components for the variants each kind takes.');
  assert.match(message,/unknown component_kind "hero-large"/);
  assert.match(message,/Valid values: hero, features/);
  assert.match(message,/Closest match: "hero"/);
  assert.match(message,/aphrodite_list_components/);
});

test('a long list is trimmed and says how many there were',()=>{
  const many=Array.from({length:40},(_,i)=>`kind-${i}`);
  const message=unknownValue('component_kind','nope',many);
  assert.match(message,/… \(40 in all\)/);
  assert.ok(message.length<400,'the error stays readable');
});

test('a missing field names an example rather than scolding',()=>{
  assert.equal(missingField('block_id','"block_id": "selection"'),'block_id is required. For example: "block_id": "selection"');
});
