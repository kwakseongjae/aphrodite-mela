import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const style=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const home=readFileSync(new URL('../src/workspace/home.css',import.meta.url),'utf8');

/** Every rule written for exactly this selector, base and overrides alike. */
const rules=(css:string,selector:string):string[]=>
  [...css.matchAll(new RegExp(`(?:^|[,{}])\\s*${selector.replace('.','\\.')}\\{([^}]*)\\}`,'gm'))].map(m=>m[1]);

/**
 * `#app` is a flex column, and it stacks banners above whatever screen is open — the agent
 * connection bar, agent mode, a recovery notice. A screen that claims the whole viewport is
 * therefore taller than the room it was given, and the overflow falls off the bottom edge.
 *
 * This is here because it once did: home asked for `100dvh`, so with the connected banner up the
 * bottom of the sidebar sat below the window and the brand-kit link was gone. It shipped in the
 * screenshots before anyone noticed, because every capture cropped the banner away.
 */
test('a top-level screen takes the room left in the column, not the whole viewport',()=>{
  for(const [name,found] of [['.studio',rules(style,'.studio')],['.folio-home',rules(home,'.folio-home')]] as const){
    assert.ok(found.length,`${name} has a rule`);
    for(const body of found)
      assert.doesNotMatch(body,/height:\s*(?:100vh|100dvh)/,`${name} claims the viewport, so a banner above it pushes its bottom off screen`);
    const base=found.find(b=>/flex:\s*1[;}\s]/.test(b));
    assert.ok(base,`${name} has to take the space left in the column`);
    assert.match(base,/min-height:\s*0/,`${name} needs min-height:0 or it refuses to shrink below its content`);
  }
});

/** Only the column itself is allowed to be as tall as the window. */
test('the app column is the one thing measured against the viewport',()=>{
  assert.match(rules(style,'#app')[0],/height:\s*100vh/);
});
