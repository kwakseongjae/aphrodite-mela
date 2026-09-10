import test from 'node:test';
import assert from 'node:assert/strict';
import { patternSpecs, type PatternKind } from '../src/patterns';
import { makeBlock } from '../src/model';
import { patternHtml } from '../src/pattern-render';
import { icons } from '../src/icons';

const NEW_KINDS = ['select', 'checkbox', 'switch', 'textarea', 'badge', 'avatar', 'breadcrumb', 'pagination', 'progress', 'skeleton', 'accordion', 'chips', 'slider', 'stepper', 'toggle'] as const;
type NewKind = (typeof NEW_KINDS)[number];

const MARKERS: Record<NewKind, RegExp> = {
  select: /<select/,
  checkbox: /type="checkbox"/,
  switch: /role="switch"/,
  textarea: /<textarea/,
  badge: /kit-badge-item/,
  avatar: /kit-avatar-item/,
  breadcrumb: /<nav aria-label/,
  pagination: /<nav aria-label/,
  progress: /role="progressbar"/,
  skeleton: /aria-busy/,
  accordion: /<details/,
  chips: /kit-chip/,
  slider: /type="range"/,
  stepper: /<ol/,
  toggle: /role="radiogroup"/,
};

function toPascal(name: string) {
  return name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

test('new pattern kinds expose at least three variants and two states', () => {
  for (const kind of NEW_KINDS) {
    const spec = patternSpecs[kind];
    assert.ok(spec.variants.length >= 3, `${kind} variants`);
    assert.ok(spec.states.length >= 2, `${kind} states`);
    assert.ok(spec.states.includes('default'), `${kind} default state`);
  }
});

test('every new kind variant and state renders a kind-specific marker', () => {
  for (const kind of NEW_KINDS) {
    for (const variant of patternSpecs[kind].variants) {
      for (const state of patternSpecs[kind].states) {
        const b = makeBlock(kind);
        b.variant = variant;
        b.options = { state, density: 'comfortable', columns: 3 };
        const html = patternHtml(b);
        assert.ok(html.length > 100, `${kind}/${variant}/${state} length`);
        assert.match(html, MARKERS[kind], `${kind}/${variant}/${state} marker`);
      }
    }
  }
});

test('xss payload is escaped for the new pattern kinds', () => {
  const payload = '</script><img src=x onerror="alert(1)">';
  for (const kind of NEW_KINDS) {
    const b = makeBlock(kind);
    b.title = b.label = payload;
    b.text = `${payload}|${payload}|${payload}`;
    const html = patternHtml(b);
    assert.ok(!html.includes('<img'), kind);
    assert.ok(!html.includes('</script>'), kind);
    assert.ok(html.includes('&lt;'), kind);
  }
});

test('every patternSpecs icon maps to a lucide key on icons', () => {
  for (const [kind, spec] of Object.entries(patternSpecs) as [PatternKind, (typeof patternSpecs)[PatternKind]][]) {
    const key = toPascal(spec.icon);
    assert.ok(Object.hasOwn(icons, key), `${kind} icon ${spec.icon} -> ${key}`);
  }
});
