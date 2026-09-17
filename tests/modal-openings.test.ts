import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');

/**
 * A sheet nobody asked for.
 *
 * On 2026-09-10 the brand kit was noted as "already open" on a first run, and two clean installs
 * since have found it closed. Rather than close the item on not reproducing it, this pins the thing
 * that makes it impossible: the brand kit has one call site and it sits inside the action switch, so
 * the only way to it is a click on `data-action="brand-kit"`. Nothing at boot can reach it.
 *
 * If someone later opens it from a timer, a first-run branch or a restored state, this fails and
 * they have to say so on purpose.
 */
test('the brand kit can only be opened by someone clicking it',()=>{
  const opens=[...main.matchAll(/brandHtml\(/g)];
  assert.equal(opens.length,1,`the brand kit is built in ${opens.length} places; it used to be one`);
  const line=main.split('\n').find(l=>l.includes('brandHtml('))!;
  assert.match(line,/case 'brand-kit':/,'its one call site has to be an action, not something that runs on its own');
});

/**
 * The same question for every other sheet: which of them can appear without being asked for?
 * `welcomeModal` may — a first run is exactly when it should — and nothing else should join it
 * without a deliberate change here.
 */
test('only the welcome sheet opens itself',()=>{
  const selfOpening=new Set<string>();
  for(const [,name] of main.matchAll(/(?:^|[^.\w])([a-zA-Z]+Modal)\(\)/gm)){
    const uses=main.split('\n').filter(l=>l.includes(`${name}()`)&&!l.startsWith(`function ${name}`)&&!l.startsWith(`async function ${name}`));
    // A call that is not inside the action switch and not inside another modal's own body.
    if(uses.some(l=>!l.includes('case ')&&!l.trimStart().startsWith('//')&&l.includes('boot')))selfOpening.add(name);
  }
  assert.deepEqual([...selfOpening],[],`these open without being asked: ${[...selfOpening].join(', ')}`);
  assert.match(main,/welcomeModal/,'the welcome sheet still exists for a first run');
});
