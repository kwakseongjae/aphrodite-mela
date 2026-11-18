import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {contrastRatio} from '../src/design/contrast';
import {pairs,resolve,themes,type Theme} from '../src/ui/tokens';
import {drawn,sheetKind,rules,type DrawPolicy} from './support/css';

/** The system sheets the app ships: every one under src/ui but the generated tokens and the development gallery. */
const src=new URL('../src/',import.meta.url);
const shipped=readdirSync(src,{recursive:true}).map(String).filter(f=>f.endsWith('.css')&&sheetKind(f)==='system'&&f!=='ui/gallery.css').sort();
const css=shipped.map(f=>readFileSync(new URL(f,src),'utf8')).join('\n');

/**
 * How the pairs are read off the sheet (tests/support/css.ts, drawn()).
 *
 * Meta: the rules whose text may be held to 3:1, because it is a placeholder or meta that repeats
 * something said elsewhere (a count, a shortcut, a time): those that style a placeholder, .ui-caps,
 * .ui-kbd, .ui-tab-count or .ui-row-meta. Anything else a person reads is text, at 4.5.
 * Fills: elements whose colour is the graphic itself. The switch knob is not read: it is the same light
 * colour in both themes, and its position, not its colour against the track, tells on from off.
 * Decorative: --ui-line separates things already told apart by fill, text or position (dividers, the edge
 * of a card or a segmented control), so it is never read; it is never a text colour either (tested below).
 */
const policy:DrawPolicy={
  solid:role=>!!resolve('light',role)&&!!resolve('dark',role),
  colours:Object.keys(themes.light),
  meta:rule=>/\.ui-(caps|kbd|tab-count|row-meta)$|::placeholder$/.test(rule),
  fills:(target,host)=>target.classes.has('ui-switch-track')||target.classes.has('ui-dot')||(target.element==='after'&&!!host?.classes.has('ui-tab')),
  silent:target=>['ui-switch-input','ui-switch-track','ui-dot','ui-toolbar-sep','ui-scrim'].some(k=>target.classes.has(k)),
  decorative:['line'],
};

/** Each drawn pair the list does not hold at the strength it is drawn: text needs 4.5, meta 4.5 or a meta entry, a graphic any entry. */
function unlisted(sheet:string){
  return drawn(sheet,policy).pairs.filter(d=>{
    const p=pairs.find(p=>p.fg===d.fg&&p.bg===d.bg);
    return !p||(d.kind==='text'&&p.min!==4.5)||(d.kind==='meta'&&p.min!==4.5&&!p.meta);
  }).map(d=>`${d.fg} on ${d.bg} as ${d.kind}: ${d.where} (colour from ${d.rule})`);
}

/**
 * Contrast is computed from the source, in both themes, so a value cannot be nudged into a pair that
 * no longer reads. 4.5 for text, 3 for large text and for graphics (WCAG 2.1, 1.4.3 and 1.4.11).
 */
for(const theme of Object.keys(themes) as Theme[]){
  test(`every foreground reads on its background in the ${theme} theme`,()=>{
    const short:string[]=[];
    for(const {fg,bg,min,short:known} of pairs){
      const a=resolve(theme,fg),b=resolve(theme,bg);
      assert.ok(a&&b,`${fg} on ${bg} does not resolve to two colours in ${theme}`);
      const ratio=contrastRatio(a,b);
      if(known?.[theme]){
        assert.ok(ratio<min,`${fg} on ${bg} reaches ${ratio.toFixed(2)}:1 in ${theme} now: remove its \`short\` note in tokens.ts`);
        assert.ok(known[theme]!.length>20,`${fg} on ${bg} is let off in ${theme} without a reason`);
        continue;
      }
      if(ratio<min)short.push(`${fg} on ${bg}: ${ratio.toFixed(2)}:1, under ${min}`);
    }
    assert.deepEqual(short,[],`pairs under their minimum in ${theme}`);
  });
}

test('three pairs are let off their minimum, all graphics: one the owner approved, two the board asks about',()=>{
  // Approved by the owner on 11/18: the dark theme's green fill (accent). Not approved, asked on the board:
  // the input border and off switch track (one pair, line-strong on bg-panel) and the green fill's hover.
  const let_off=pairs.filter(p=>p.short);
  assert.deepEqual(let_off.map(p=>p.fg+'/'+p.bg),['line-strong/bg-panel','accent/bg-panel','accent-hover/bg-panel'],'a new exception needs the owner, not a test edit');
  for(const p of let_off){assert.equal(p.min,3,'text has no exceptions');assert.equal(p.meta,undefined,'an exception is never read as text');}
  // A pair let off is let off only where it is drawn today: a new part drawing it needs the owner too.
  const drawers=(fg:string,bg:string)=>drawn(css,policy).pairs.filter(d=>d.fg===fg&&d.bg===bg).flatMap(d=>d.rules).sort();
  assert.deepEqual(drawers('line-strong','bg-panel'),['.ui-btn-secondary','.ui-chip','.ui-composer','.ui-connect','.ui-input','.ui-select','.ui-switch-track','.ui-textarea']);
  assert.deepEqual(drawers('accent','bg-panel'),['.ui-connect.is-connected','.ui-dot.ui-dot-accent','.ui-switch-input:checked + .ui-switch-track','.ui-switch.is-on .ui-switch-track']);
  assert.deepEqual(drawers('accent-hover','bg-panel'),['.ui-switch.is-on.is-hover .ui-switch-track','.ui-switch:hover .ui-switch-input:checked:not(:disabled) + .ui-switch-track']);
});

/**
 * text-3 reaches 3:1, not 4.5, so it writes only meta (a placeholder, a count, a shortcut, a row's
 * repeated detail), a disabled control (WCAG exempts it) or an icon. These are the rules that do.
 */
test('text-3 writes only meta, disabled controls and icons, in these rules',()=>{
  const writers=rules(css).filter(r=>/var\(--ui-text-3\)/.test(r.decls.color?.value??'')).map(r=>r.selector);
  for(const s of writers)assert.ok(policy.meta(s)||/:disabled|\.is-disabled/.test(s)||/\.ui-icon$/.test(s),s+' writes text in text-3, which only meta, a disabled control or an icon may');
  assert.deepEqual(writers,['.ui-caps','.ui-kbd','.ui-input::placeholder','.ui-textarea::placeholder','.ui-input:disabled','.ui-input.is-disabled','.ui-textarea:disabled','.ui-textarea.is-disabled',
    '.ui-select.is-disabled','.ui-select:has(> select:disabled)','.ui-select > .ui-icon','.ui-tab-count','.ui-row-meta','.ui-composer-input::placeholder','.ui-send:disabled','.ui-send.is-disabled']);
});

test('the ratios are the ones the approved direction showed',()=>{
  // Read off lab/review-board/proposals/0.3-F/shots/06-system-*.png: the resolver agrees with the sheet.
  const seen=(theme:Theme,fg:string,bg:string)=>Number(contrastRatio(resolve(theme,fg)!,resolve(theme,bg)!).toFixed(2));
  assert.equal(seen('light','text-1','bg-panel'),16.07);
  assert.equal(seen('light','text-2','bg-panel'),5.44);
  assert.equal(seen('light','text-3','bg-panel'),3.52);
  assert.equal(seen('light','on-select','select'),4.77);
  assert.equal(seen('light','agent-text','agent-soft'),4.70);
  assert.equal(seen('dark','text-1','bg-panel'),15.49);
  assert.equal(seen('dark','text-3','bg-panel'),4.56);
  assert.equal(seen('dark','select','bg-canvas'),3.82);
});

test('every colour pair a part draws is in the list, at the strength it is drawn',()=>{
  assert.deepEqual(unlisted(css),[]);
});

test('the pair reader finds a pair drawn across two rules and a border on what is outside it',()=>{
  const sheet='.ui-row{background:none} .ui-row.is-on{background:var(--ui-bg-active)} .ui-row-meta{color:var(--ui-text-3)}\n'+
    '.ui-input{background:var(--ui-bg-panel);border:var(--ui-hairline) solid var(--ui-line-strong)} .ui-input.is-error{border-color:var(--ui-danger)}';
  const found=drawn(sheet,{...policy,meta:()=>false}).pairs.map(d=>d.fg+'/'+d.bg+'/'+d.kind);
  for(const pair of ['text-3/bg-active/text','danger/bg-panel/graphic','line-strong/bg-panel/graphic'])assert.ok(found.includes(pair),pair+' in '+found.join(', '));
});

test('the pairs the reader cannot read are these, and why',()=>{
  // The toast's button hover is color-mix() of the inverse text over the inverse fill: not a token.
  assert.deepEqual(drawn(css,policy).unread,['.ui-toast > .ui-btn:hover','.ui-toast > .ui-btn.is-hover']);
});

test('nothing writes text in a separator colour',()=>{
  for(const r of rules(css))assert.doesNotMatch(r.decls.color?.value??'',/--ui-line\b/,r.selector);
});
