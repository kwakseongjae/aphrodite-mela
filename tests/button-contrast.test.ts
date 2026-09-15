import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrastRatio} from '../src/design/contrast';
import {systems} from '../src/model';

const css=readFileSync(new URL('../src/page.css',import.meta.url),'utf8');

/**
 * A button's label has to be readable on the button, whatever surface the variant puts it on.
 *
 * This is here because it once was not: the base rule sets the label colour with !important, which a
 * variant's plain `color:` could not beat, so the banner call to action drew a pale button with pale
 * text on it — an action nobody could read. Face and text are one decision now, and this holds them
 * together: change one in a variant and you must change the other.
 */
test('a variant that repaints the button repaints its label too',()=>{
  const rules=[...css.matchAll(/([^{}]*\.site-button)\{([^}]*)\}/g)];
  assert.ok(rules.length>=2,'there are variant rules to check');
  for(const [,selector,body] of rules){
    if(!body.includes('--button-face')) continue;
    assert.match(body,/--button-text/,`${selector.trim()} gives the button a new face without saying what colour its label should be`);
  }
});

test('the label colour is never set in a way a variant cannot change',()=>{
  const base=css.match(/\.site-button\{([^}]*)\}/)![1];
  assert.match(base,/color:var\(--button-text,/,'the label reads a variable, so a variant can set it');
  const important=[...css.matchAll(/\.site-button[^{]*\{[^}]*color:[^;}]*!important/g)];
  for(const [rule] of important){
    assert.match(rule,/var\(--button-text/,`this rule pins the label colour past any variant: ${rule.slice(0,60)}`);
  }
});

test('every design system reads on its own banner',()=>{
  // The banner puts the paper-coloured button on the brand, with ink on the button.
  for(const system of systems){
    const ratio=contrastRatio(system.background,system.foreground);
    assert.ok(ratio>=4.5,`${system.name}: ink on paper is ${ratio.toFixed(1)}:1, under the 4.5 a label needs`);
  }
});

/**
 * The same mistake in another place: a colour chosen for one surface used on another.
 *
 * A caption over a photograph is white with a shadow, which is right — until there is no photograph
 * yet and it sits on the pale placeholder instead, where it is white on light. Every new project
 * starts that way, so this was the first thing a person saw.
 */
test('a caption over a placeholder takes the ink, not the photograph treatment',()=>{
  assert.match(css,/\.image-caption\{[^}]*color:#fff/,'over a photograph it stays white');
  const onPlaceholder=css.match(/:has\(\.media-placeholder\)[^{]*\.image-caption\{([^}]*)\}/);
  assert.ok(onPlaceholder,'nothing changes the caption when there is no photograph');
  assert.match(onPlaceholder![1],/color:var\(--ink\)/);
  assert.match(onPlaceholder![1],/text-shadow:none/,'and drops the shadow meant for a photograph');
});

test('nothing else paints white text without saying what it sits on',()=>{
  const whites=[...css.matchAll(/([^{}]*)\{([^}]*color:#fff[^}]*)\}/g)].map(m=>m[1].trim());
  // Only the caption does, and only because a rule above covers the case where there is no photo.
  assert.deepEqual(whites,['.image-caption']);
});
