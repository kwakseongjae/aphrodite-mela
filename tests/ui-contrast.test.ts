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
 * .ui-kbd, .ui-tab-count, .ui-row-meta or .ui-side-sub. Anything else a person reads is text, at 4.5.
 * Fills: elements whose colour is the graphic itself. The switch knob is not read: its position, not its
 * colour against the track, tells on from off. On, it takes on-accent, so it stays visible on the ink track
 * in the dark theme too (on-accent on accent is a listed pair).
 * Decorative: --ui-line separates things already told apart by fill, text or position (dividers, the edge
 * of a card or a segmented control), so it is never read; it is never a text colour either (tested below).
 */
const policy:DrawPolicy={
  solid:role=>!!resolve('light',role)&&!!resolve('dark',role),
  colours:Object.keys(themes.light),
  meta:rule=>/\.ui-(caps|kbd|tab-count|row-meta|side-sub)$|::placeholder$/.test(rule),
  fills:(target,host)=>target.classes.has('ui-switch-track')||target.classes.has('ui-dot')||target.classes.has('ui-drop-line')||(target.element==='after'&&!!host?.classes.has('ui-tab')),
  silent:target=>['ui-switch-input','ui-switch-track','ui-dot','ui-toolbar-sep','ui-scrim','ui-drop-line'].some(k=>target.classes.has(k)),
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

test('one pair is let off its minimum, a graphic the board asks about',()=>{
  // Not approved, asked on the board: the input border and off switch track (one pair, line-strong on bg-panel).
  // The dark theme's green fill and its hover (approved 11/18) went with the green: the ink accent reads in both themes.
  const let_off=pairs.filter(p=>p.short);
  assert.deepEqual(let_off.map(p=>p.fg+'/'+p.bg),['line-strong/bg-panel'],'a new exception needs the owner, not a test edit');
  for(const p of let_off){assert.equal(p.min,3,'text has no exceptions');assert.equal(p.meta,undefined,'an exception is never read as text');}
  // A pair let off is let off only where it is drawn today: a new part drawing it needs the owner too.
  const drawers=(fg:string,bg:string)=>drawn(css,policy).pairs.filter(d=>d.fg===fg&&d.bg===bg).flatMap(d=>d.rules).sort();
  assert.deepEqual(drawers('line-strong','bg-panel'),['.ui-btn-secondary','.ui-chip','.ui-composer','.ui-connect','.ui-input','.ui-select','.ui-switch-track','.ui-textarea']);
});

/**
 * text-3 is the quietest step. With direction A it reaches 4.5 on the panel, the sidebar, the sunken and the
 * hover fills, but not on bg-active (4.28 / 4.17), which is why a lit row moves its meta up to text-2. It
 * still writes only meta (a placeholder, a count, a shortcut, a row's repeated detail), a disabled control
 * or an icon, so the steps keep their order. These are the rules that do.
 */
test('text-3 writes only meta, disabled controls and icons, in these rules',()=>{
  const writers=rules(css).filter(r=>/var\(--ui-text-3\)/.test(r.decls.color?.value??'')).map(r=>r.selector);
  for(const s of writers)assert.ok(policy.meta(s)||/:disabled|\.is-disabled/.test(s)||/\.ui-icon$/.test(s),s+' writes text in text-3, which only meta, a disabled control or an icon may');
  assert.deepEqual(writers,['.ui-caps','.ui-kbd','.ui-input::placeholder','.ui-textarea::placeholder','.ui-input:disabled','.ui-input.is-disabled','.ui-textarea:disabled','.ui-textarea.is-disabled',
    '.ui-select.is-disabled','.ui-select:has(> select:disabled)','.ui-select > .ui-icon','.ui-tab-count','.ui-row-meta','.ui-side-sub','.ui-composer-input::placeholder','.ui-send:disabled','.ui-send.is-disabled']);
});

test('the ratios are the ones the approved direction showed',()=>{
  // Read off lab/review-board/proposals/0.3-D2/app/contrast.md (direction A, picked 11/23): the resolver agrees with it.
  // Its dark rows for bg-hover and bg-active are a step off the stylesheet it sits beside, so they are not pinned here.
  const seen=(theme:Theme,fg:string,bg:string)=>Number(contrastRatio(resolve(theme,fg)!,resolve(theme,bg)!).toFixed(2));
  assert.equal(seen('light','text-1','bg-panel'),16.05);
  assert.equal(seen('light','text-2','bg-panel'),6.93);
  assert.equal(seen('light','text-3','bg-panel'),5.77);
  assert.equal(seen('light','on-select','select'),4.77);
  assert.equal(seen('light','agent-text','agent-soft'),4.91);
  assert.equal(seen('light','select','bg-canvas'),4.00);
  assert.equal(seen('dark','text-1','bg-panel'),14.36);
  assert.equal(seen('dark','text-3','bg-panel'),5.52);
  assert.equal(seen('dark','select','bg-canvas'),3.38);
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
