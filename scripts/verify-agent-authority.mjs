/**
 * Stage 1 gate: the permission rule, exercised against a running app rather than a stub.
 *
 * Runs the browser build under headless Chrome, because a real person's input can be reproduced there
 * (CDP dispatches trusted events) and an agent's commands arrive through the same executor the
 * desktop bridge uses. Checks, in order: reads are open, writes are refused until the person opens
 * the door, an agent cannot open that door itself, the person's own typing takes the screen back, and
 * the hold comes back to the agent once they stop.
 *
 *   node scripts/verify-agent-authority.mjs
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {openApp, runChecks, sleep} from './lib/headless.mjs';

const {agent, send, personClicks, personPresses, personSubmits, personTypes, presses, evaluate, close} = await openApp({port: 4183, cdp: 9334, profile: '/tmp/aphrodite-authority-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('reading works with nobody at the door', async () => {
  const state = await agent('state');
  assert.equal(state.ok, true);
  assert.ok(state.state, 'the state payload came back');
});

check('writing is refused with 423 and told how to proceed', async () => {
  const refused = await agent('edit', {field: 'title', text: 'x'});
  assert.equal(refused.status, 423, JSON.stringify(refused));
  assert.match(refused.error, /Connected mode|Agent mode/);
});

check('an agent cannot open the door for itself', async () => {
  const refused = await agent('act', {action: 'agent-connect-toggle'});
  assert.equal(refused.status, 423, 'flipping the switch is a write like any other');
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false, 'no banner appeared');
});

check('with no board open, an agent that reads or writes the board is told so', async () => {
  // export is a write in the permission rule, so with the door shut it is refused by that first; the Home scenes below ask it with the door open.
  for (const [kind, payload] of [['contract', {}], ['tokens', {}]]) {
    const answer = await agent(kind, payload);
    assert.equal(answer.status, 409, `${kind}: ${JSON.stringify(answer).slice(0, 200)}`);
    assert.match(answer.error, /no board is open/, kind);
  }
});

check('the person opens a project', async () => {
  await personClicks('welcome-blank');
  await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Start'}), true, 'the new-project dialog was filled in');
  await sleep(600);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`), 'editor');
  await control('add', {kind: 'hero'});
  await sleep(300);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.selectedKind`), 'hero', 'a hero is on the page and selected, so an edit has something to land on');
});
/** An edit that went through and was saved, not one that was let past the door and then failed. */
const landed = async (result, text) => {
  assert.equal(result.status, undefined, JSON.stringify(result));
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal((await saved('Start')).title, text, 'the edit is in the saved project');
};

check('an agent can ask, and the request reaches the person with its name on it', async () => {
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  assert.match(asked.message, /claude-code/, 'the reply says the person can see who is asking');
  await sleep(200);
  const banner = await evaluate(`document.querySelector('.ask-banner')?.textContent ?? ''`);
  assert.match(banner, /claude-code/, 'the request is on their screen');
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false, 'asking did not open anything');
  const again = await agent('connect', {}, 'claude-code');
  assert.equal(again.status, 'waiting', 'asking twice does not put up a second request');
});

check('the person allows it with one click, and the agent may write', async () => {
  await personClicks('ask-allow');
  await sleep(250);
  assert.equal(await evaluate(`document.querySelector('.ask-banner') !== null`), false, 'the request is answered and gone');
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), true, 'connected mode is on');
  await landed(await agent('edit', {field: 'title', text: 'Asked and allowed'}), 'Asked and allowed');
  await personClicks('agent-disconnect');
  await sleep(200);
});

check('the person declines, and the agent is told to stop asking', async () => {
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', 'a spent yes does not bar a fresh request');
  await sleep(200);
  await personClicks('ask-decline');
  await sleep(200);
  assert.equal(await evaluate(`document.querySelector('.ask-banner') !== null`), false, 'the request is gone');
  const refused = await agent('connect', {}, 'claude-code');
  assert.equal(refused.status, 'declined');
  assert.match(refused.message, /Do not ask again/);
  const write = await agent('edit', {field: 'title', text: 'x'});
  assert.equal(write.status, 423, 'and the door is still shut');
});

check('the guide tells an agent where it stands without asking permission', async () => {
  const {guide} = await agent('guide');
  assert.match(guide, /## Right now/);
  assert.match(guide, /Mode: design/);
  assert.match(guide, /Approve a direction/, 'it says what is never theirs to do');
});

check('the person turns it on, and the banner says so', async () => {
  await personClicks('agent-connect-toggle');
  await sleep(120);
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), true, 'the connected banner is up');
});

check('now the agent may write, and the write is not refused by the rule', async () => {
  await landed(await agent('edit', {field: 'title', text: 'Hello from the agent'}), 'Hello from the agent');
});

check('the person types, and takes the screen back', async () => {
  await personTypes('a');
  await sleep(60);
  const refused = await agent('edit', {field: 'title', text: 'while you were typing'});
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /the person is using the screen/);
});

check('a few quiet seconds and the agent may write again', async () => {
  await sleep(5_400);
  await landed(await agent('edit', {field: 'title', text: 'back to work'}), 'back to work');
});

check('a second agent is refused by name while the first holds it', async () => {
  await landed(await agent('edit', {field: 'title', text: 'mine'}, 'claude-code'), 'mine');
  const refused = await agent('edit', {field: 'title', text: 'mine too'}, 'astra');
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /claude-code/);
});

check('disconnecting closes the door again', async () => {
  await personClicks('agent-disconnect');
  await sleep(120);
  assert.equal(await evaluate(`document.querySelector('.connect-banner') !== null`), false);
  const refused = await agent('edit', {field: 'title', text: 'x'});
  assert.equal(refused.status, 423);
});


/* ---- Approving a direction is the person's alone (0.2.5). v0.2.4 let a connected agent press the
   approve button, and a fingerprint left behind by a change matched again once the content came back. ---- */
const NAME = 'Approval';
const approval = () => evaluate(`document.querySelector('#app').dataset.approval`);
/** The saved copy of a project, by name. Missing is an error, never "no fingerprint". */
const saved = async (name = NAME) => {
  const entry = await evaluate(`(() => { const lib = JSON.parse(localStorage.getItem('aphrodite-project-library-v1') || '{}');
    const p = (lib.entries ?? []).find(e => e.project.name === ${JSON.stringify(name)})?.project;
    return p ? {id: p.id, fingerprint: p.approvedFingerprint ?? '', reference: !!p.reference, title: p.pages.flatMap(pg => pg.blocks).find(b => b.kind === 'hero')?.title ?? ''} : null; })()`);
  assert.ok(entry, `${name} is in the library`);
  return entry;
};
const stored = async (name = NAME) => (await saved(name)).fingerprint;
const title = async () => (await saved()).title;
const modals = () => evaluate(`document.querySelector('#modal-root').children.length`);
const closeModal = () => evaluate(`(() => { document.querySelector('#modal-root .modal-backdrop')?.click(); return true; })()`);
const firstBlock = () => evaluate(`document.querySelector('#design-canvas [data-block-id]')?.dataset.blockId ?? ''`);
/** A control pressed with the data the real button carries; synthetic, so it never counts as the person approving. */
const control = (action, data = {}) => evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = ${JSON.stringify(action)};
  Object.assign(b.dataset, ${JSON.stringify(data)}); document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
const refusedApproval = (result, what) => {
  assert.equal(result.status, 403, `${what}: ${JSON.stringify(result)}`);
  assert.match(result.error, /person/, `${what}: the refusal says whose decision it is`);
};
let hero = '';
/** An agent edit that has to land: a refused one would make every check after it meaningless. */
const agentEdits = async (text, caller = 'claude-code') => {
  const result = await agent('edit', {blockId: hero, field: 'title', text}, caller);
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(await title(), text, 'the edit landed');
};
let drafts = 0;
/** Each refusal starts from its own draft, so one route that gets through cannot hide the next. */
const freshDraft = async () => {
  await closeModal();
  await agentEdits(`Draft ${++drafts}`);
  assert.equal(await approval(), 'draft');
  return stored();
};
/** The person's own press on the review card's button. It holds the screen for five seconds after. */
const personApproves = async () => {
  await closeModal();
  await sleep(100);
  await personPresses('.review-card [data-action="approve"]');
  await sleep(200);
  assert.equal(await approval(), 'approved', 'the person approved with their own press');
  assert.ok(await stored(), 'the fingerprint was saved');
  await sleep(5_200);
};
/** The person's own ⌘Z or ⌘⇧Z. */
const personUndoes = async (redo = false) => { await presses('z', redo ? 4 | 8 : 4); await sleep(200); };
const cleared = (result, what) => assert.match(result.approval ?? '', /only the person approves/, `${what}: ${JSON.stringify(result).slice(0, 300)}`);

check('the person opens two projects and connects an agent', async () => {
  for (const name of ['Other', NAME]) {
    await personClicks('welcome-blank');
    await sleep(400);
    assert.equal(await personSubmits('#new-project-form', {name}), true, 'the new-project dialog was filled in');
    await sleep(600);
  }
  await personClicks('agent-connect-toggle');
  await sleep(250);
  await closeModal();
  await sleep(150);
  const added = await agent('apply', {ops: [{op: 'add', component_kind: 'hero', content: {title: 'First light'}}]});
  assert.equal(added.ok, true, JSON.stringify(added));
  hero = await firstBlock();
  assert.ok(hero, 'the hero is on the canvas');
  assert.equal(await title(), 'First light');
  assert.equal(await stored(), '');
  await saved('Other');
});

for (const action of ['approve', 'approve-human-only', 'approve-export']) {
  check(`act ${action} is refused and approves nothing`, async () => {
    const before = await freshDraft();
    refusedApproval(await agent('act', {action}), action);
    assert.equal(await approval(), 'draft');
    assert.equal(await stored(), before);
    assert.equal(await modals(), 0, 'nothing opened on the screen');
  });
}

check('a click on the real approve button is refused', async () => {
  const before = await freshDraft();
  assert.equal(await evaluate(`document.querySelector('.review-card [data-action="approve"]') !== null`), true, 'the button is on screen');
  refusedApproval(await agent('click', {selector: '.review-card [data-action="approve"]'}), 'click approve');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), before);
});

check('a click on Approve now in the export window is refused', async () => {
  const before = await freshDraft();
  assert.equal((await agent('act', {action: 'export'})).error, undefined);
  await sleep(150);
  assert.equal(await evaluate(`document.querySelector('[data-action="approve-export"]') !== null`), true, 'Approve now is on screen');
  refusedApproval(await agent('click', {selector: '[data-action="approve-export"]'}), 'click approve-export');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), before);
  await closeModal();
});

check('the palette has no approve, by query or by key', async () => {
  const before = await freshDraft();
  assert.match((await agent('command', {query: 'approve'})).error ?? '', /no palette command/);
  assert.equal((await agent('key', {key: 'k', meta: true})).error, undefined);
  await sleep(100);
  assert.equal(await evaluate(`document.querySelector('#command-search') !== null`), true, 'the palette opened');
  assert.equal((await agent('type', {selector: '#command-search', text: 'approve'})).error, undefined);
  await sleep(200);
  assert.equal(await evaluate(`document.querySelectorAll('#command-list [data-palette]').length`), 0, 'nothing in the palette answers to approve');
  assert.equal((await agent('key', {key: 'Enter'})).error, undefined);
  await sleep(100);
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), before);
  await closeModal();
});

check('the person approves with their own press, and an agent pressing it again only opens the export window', async () => {
  await agentEdits('First light');
  await personApproves();
  const again = await agent('act', {action: 'approve'});
  assert.equal(again.error, undefined, JSON.stringify(again));
  assert.equal(await modals(), 1, 'the export window opened, as it does for the person');
  assert.equal(await approval(), 'approved');
  await closeModal();
});

/** The person's own key on whatever has focus: Enter or Space, as the keyboard sends them. */
const personKeys = async name => {
  const key = name === 'Enter' ? {key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r'} : {key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' '};
  await send('Input.dispatchKeyEvent', {type: 'keyDown', ...key});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: key.key, code: key.code, windowsVirtualKeyCode: key.windowsVirtualKeyCode});
};
const focusApprove = () => evaluate(`(() => { const b = document.querySelector('.review-card [data-action="approve"]'); b.focus(); return document.activeElement === b; })()`);

check('the person approves with Enter on the focused button', async () => {
  await freshDraft();
  assert.equal(await focusApprove(), true, 'the button has focus');
  await personKeys('Enter');
  await sleep(200);
  assert.equal(await approval(), 'approved');
  assert.ok(await stored());
  await sleep(5_200);
});

check('Space on the focused button pans the canvas instead, as it did in v0.2.4', async () => {
  const before = await freshDraft();
  assert.equal(await focusApprove(), true, 'the button has focus');
  await personKeys('Space');
  await sleep(200);
  assert.equal(await approval(), 'draft', 'Space is the canvas pan key in the editor, so it presses nothing');
  assert.equal(await stored(), before);
  await sleep(5_200);
});

check('the person approves with Approve now in the export window', async () => {
  await freshDraft();
  await control('export');
  await sleep(200);
  await personPresses('[data-action="approve-export"]');
  await sleep(200);
  assert.equal(await approval(), 'approved', await evaluate(`JSON.stringify({toast: document.querySelector('#toast').textContent, modal: document.querySelector('#modal-root .export-status')?.outerHTML.slice(0, 160), screen: document.querySelector('#app').dataset.screen})`));
  assert.ok(await stored());
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-status.approved') !== null`), true, 'the export window says approved');
  await closeModal();
  await sleep(5_200);
});

check('on an approved board the person’s press of Ready to export opens the export window', async () => {
  const fp = await stored();
  await personPresses('.review-card [data-action="approve"]');
  await sleep(200);
  assert.equal(await modals(), 1, 'the export window opened');
  assert.equal(await approval(), 'approved');
  assert.equal(await stored(), fp, 'nothing was rewritten');
  await closeModal();
  await sleep(5_200);
});

/* Codex 2026-11-22, high 1: the guard looked before two awaits, and the write came after them. */
check('an approve begun on an approved board writes nothing for the board an edit left behind', async () => {
  const [approve, edit] = await evaluate(`Promise.all([
    window.aphroditeAgent.run('act', {action: 'approve'}, 'claude-code'),
    window.aphroditeAgent.run('edit', {blockId: ${JSON.stringify(hero)}, field: 'title', text: 'Raced'}, 'claude-code'),
  ])`);
  assert.equal(edit.error, undefined, JSON.stringify(edit));
  assert.equal(await title(), 'Raced');
  assert.equal(await approval(), 'draft', 'the edited board is a draft');
  assert.equal(await stored(), '', 'and no fingerprint was written for it');
  refusedApproval(approve, 'the approve that reached its write on a draft');
  await closeModal();
});

/* Medium: a refusal belongs to the command that was refused, not to whatever ran beside it. */
check('only the refused command hears the refusal', async () => {
  await freshDraft();
  const [approve, edit] = await evaluate(`Promise.all([
    window.aphroditeAgent.run('act', {action: 'approve'}, 'claude-code'),
    window.aphroditeAgent.run('edit', {blockId: ${JSON.stringify(hero)}, field: 'title', text: 'Beside it'}, 'claude-code'),
  ])`);
  refusedApproval(approve, 'the approve');
  assert.equal(edit.error, undefined, `the edit beside it went through and says so: ${JSON.stringify(edit).slice(0, 200)}`);
  assert.equal(await title(), 'Beside it');
});

check('content put back by edit or apply is a draft', async () => {
  await agentEdits('First light');
  await personApproves();
  assert.equal((await agent('contract')).project.approved, true);
  await agentEdits('Second light');
  assert.equal(await stored(), '', 'the change made it a draft, and the old fingerprint went then, not later');
  await agentEdits('First light');
  assert.equal(await approval(), 'draft', 'edit: the same words do not bring the approval back');
  assert.equal(await stored(), '');
  assert.equal((await agent('apply', {ops: [{op: 'update', block_id: hero, fields: {title: 'Third light'}}]})).ok, true);
  const back = await agent('apply', {ops: [{op: 'update', block_id: hero, fields: {title: 'First light'}}]});
  assert.equal(back.ok, true);
  assert.equal(back.state?.state?.approval, 'draft', 'apply: the reply says draft');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), '');
});

check("the person's own ⌘Z steps back to the board they approved", async () => {
  await personUndoes();
  assert.equal(await title(), 'Third light', 'one ⌘Z takes back the last batch');
  assert.equal(await approval(), 'draft');
  for (const expected of ['First light', 'Second light', 'First light']) {
    await personUndoes();
    assert.equal(await title(), expected);
  }
  assert.equal(await approval(), 'approved', 'the snapshot from before the change carries the approval the person gave');
  assert.ok(await stored());
  await sleep(5_200);
});

check("an agent's undo onto an approved board brings the content back as a draft", async () => {
  await agentEdits('Fourth light');
  const undo = await agent('act', {action: 'undo'});
  assert.equal(await title(), 'First light', 'the undo itself went through');
  cleared(undo, 'act undo');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), '');
});

check("after an agent's undo, the person's ⌘⇧Z and ⌘Z step through drafts", async () => {
  await personUndoes(true);
  assert.equal(await title(), 'Fourth light');
  assert.equal(await approval(), 'draft');
  await personUndoes();
  assert.equal(await title(), 'First light');
  assert.equal(await approval(), 'draft', 'the board the agent undid to was saved as a draft, and stays one');
  await sleep(5_200);
});

check("an agent's redo onto an approved board brings the content back as a draft", async () => {
  await personApproves();
  const off = await agent('act', {action: 'undo'}); // the approval itself, undone: nothing to clear
  assert.equal(off.approval, undefined);
  assert.equal(await approval(), 'draft');
  const redo = await agent('act', {action: 'redo'});
  cleared(redo, 'act redo');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), '');
});

check('⌘Z and ⌘⇧Z sent as agent keys bring content back as drafts too', async () => {
  await personApproves();
  await agentEdits('Fifth light');
  const undo = await agent('key', {key: 'z', meta: true});
  assert.equal(await title(), 'First light');
  cleared(undo, 'key ⌘Z');
  assert.equal(await approval(), 'draft');
  await personApproves();
  await agent('key', {key: 'z', meta: true});
  const redo = await agent('key', {key: 'z', meta: true, shift: true});
  cleared(redo, 'key ⌘⇧Z');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), '');
});

check("an agent's Undo from the palette brings content back as a draft", async () => {
  await personApproves();
  await agentEdits('Palette light');
  assert.equal((await agent('key', {key: 'k', meta: true})).error, undefined);
  await sleep(100);
  assert.equal(await evaluate(`document.querySelector('#command-search') !== null`), true, 'the palette opened');
  assert.equal((await agent('type', {selector: '#command-search', text: 'undo'})).error, undefined);
  await sleep(250);
  assert.equal(await evaluate(`document.querySelector('#command-list [data-palette]')?.dataset.action`), 'undo', 'Undo is the first answer');
  const enter = await agent('key', {key: 'Enter'});
  cleared(enter, 'Enter on the palette Undo, sent as agent keys');
  assert.equal(await title(), 'First light');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), '');
});

/* Codex 2026-11-22, high 4: the old clearing came 60 ms late, and anything read in between saw approved. */
check('nothing read beside an agent undo sees an approval', async () => {
  await personApproves();
  await agentEdits('Sixth light');
  const seen = await evaluate(`(() => {
    const run = (kind, payload) => window.aphroditeAgent.run(kind, payload, 'claude-code');
    const undo = run('act', {action: 'undo'});
    const reads = new Promise(r => setTimeout(r, 20)).then(async () => {
      const lib = JSON.parse(localStorage.getItem('aphrodite-project-library-v1'));
      const entry = lib.entries.find(e => e.project.name === 'Approval');
      return {
        state: (await run('state', {})).state.approval,
        contract: (await run('contract', {})).project.approved,
        export: (await run('export', {format: 'contract'})).approved,
        storage: entry.project.approvedFingerprint ?? '',
      };
    });
    return Promise.all([undo, reads]).then(([u, r]) => ({...r, undo: u.approval ?? ''}));
  })()`);
  assert.deepEqual(seen, {state: 'draft', contract: false, export: false, storage: '', undo: 'cleared — only the person approves'});
  assert.equal(await title(), 'First light');
});

/* Codex 2026-11-22, high 2: a click starts a handler that finishes after the reply has gone. */
check('a handler that lands after its command replied brings content back as a draft', async () => {
  assert.equal((await agent('act', {action: 'demo-reference'})).error, undefined);
  await closeModal();
  await personApproves();
  assert.equal((await agent('act', {action: 'remove-reference'})).error, undefined);
  assert.equal(await approval(), 'draft');
  await evaluate(`(() => { const real = window.fetch; window.__heldFetch = real;
    const held = new Promise(r => { window.__release = r; });
    window.fetch = (url, ...rest) => String(url).includes('demo-reference') ? held.then(() => real(url, ...rest)) : real(url, ...rest); return true; })()`);
  assert.equal(await evaluate(`document.querySelector('#modal-root [data-action="demo-reference"]') !== null`), true, 'the sample reference button is on screen');
  const click = await agent('click', {selector: '#modal-root [data-action="demo-reference"]'});
  assert.equal(click.error, undefined, 'the click replied while the picture was still on its way');
  await evaluate(`(() => { window.__release(); window.fetch = window.__heldFetch; return true; })()`);
  await sleep(800);
  assert.equal(await evaluate(`document.querySelector('#modal-root .reference-large') !== null || document.querySelector('#modal-root img') !== null`), true, 'the reference came back');
  assert.equal(await approval(), 'draft', 'on screen');
  assert.equal(await stored(), '', 'and saved');
  await closeModal();
});

/* Codex 2026-11-22, high 3: a rename on the home screen writes straight to the library. */
check('a project renamed away and back on the home screen opens as a draft', async () => {
  assert.equal((await agent('act', {action: 'remove-reference'})).error, undefined);
  await agentEdits('First light');
  await personApproves();
  const id = (await saved()).id;
  await control('home');
  await sleep(300);
  for (const name of ['Renamed', NAME]) {
    await control('hub-rename', {id});
    await sleep(200);
    assert.equal(await personSubmits('#hub-rename-form', {name}), true, 'the rename dialog was filled in');
    await sleep(300);
  }
  assert.equal(await stored(), '', 'the rename made it a draft in the library');
  await control('hub-open', {id});
  await sleep(500);
  assert.equal(await approval(), 'draft', 'and it opens as one');
});

check('a board left during an edit that put its content back is a draft when it is opened again', async () => {
  await personApproves();
  await agentEdits('Seventh light');
  const other = (await saved('Other')).id, id = (await saved()).id;
  await evaluate(`Promise.all([
    window.aphroditeAgent.run('edit', {blockId: ${JSON.stringify(hero)}, field: 'title', text: 'First light'}, 'claude-code'),
    new Promise(r => setTimeout(r, 10)).then(() => window.aphroditeAgent.run('act', {action: 'hub-open', data: {id: ${JSON.stringify(other)}}}, 'claude-code')),
  ]).then(() => true)`);
  await sleep(300);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.project`), 'Other', 'the other project is open');
  assert.equal(await title(), 'First light');
  assert.equal(await stored(), '', 'the board it left was saved as a draft');
  await control('hub-open', {id});
  await sleep(500);
  assert.equal(await approval(), 'draft');
});

/* Medium: the first version ignored the person's own press while any agent command was running. */
check("the person's press and ⌘Z work while an agent command is still running", async () => {
  await closeModal();
  await evaluate(`(() => { const real = window.fetch; window.__heldFetch = real;
    const held = new Promise(r => { window.__release = r; });
    window.fetch = (url, ...rest) => String(url).includes('demo-reference') ? held.then(() => real(url, ...rest)) : real(url, ...rest); return true; })()`);
  const running = agent('act', {action: 'demo-reference'});
  await sleep(100);
  await personPresses('.review-card [data-action="approve"]');
  await sleep(200);
  assert.equal(await approval(), 'approved', 'the press counted while the agent command waited');
  await personUndoes();
  assert.equal(await approval(), 'draft');
  await personUndoes(true);
  assert.equal(await approval(), 'approved', "the person's own redo brings their approval back");
  await evaluate(`(() => { window.__release(); window.fetch = window.__heldFetch; return true; })()`);
  assert.equal((await running).error, undefined);
  await closeModal();
  await sleep(5_200);
});

check("the person's own Undo from the palette is their undo too", async () => {
  assert.equal(await approval(), 'draft', 'the sample reference that landed made it a draft');
  await presses('k', 4);
  await sleep(150);
  assert.equal(await evaluate(`document.querySelector('#command-search') !== null`), true, 'the palette opened');
  await send('Input.insertText', {text: 'undo'});
  await sleep(250);
  assert.equal(await evaluate(`document.querySelector('#command-list [data-palette]')?.dataset.action`), 'undo', 'Undo is the first answer');
  await presses('Enter');
  await sleep(250);
  assert.equal(await approval(), 'approved', 'an Enter the person pressed is the person undoing');
  await sleep(5_200);
});

check('in Agent mode the approve presses are refused too', async () => {
  await agent('act', {action: 'remove-reference'});
  await agentEdits('First light');
  await personApproves();
  await personClicks('agent-disconnect');
  await sleep(150);
  await control('editor-mode', {mode: 'agent'});
  await sleep(300);
  assert.equal(await personSubmits('#agent-mode-form', {operator: 'astra', intent: 'tidy the hero'}), true, 'the hand-over form was filled in');
  await sleep(400);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.mode`), 'agent', 'Agent mode is on');
  await agentEdits('Agent mode', 'astra');
  for (const action of ['approve', 'approve-human-only', 'approve-export']) {
    refusedApproval(await agent('act', {action}, 'astra'), `Agent mode act ${action}`);
    assert.doesNotMatch(await evaluate(`document.querySelector('#toast').textContent`), /Approval stays with you|승인은 사람의 몫/, `${action}: refused before anything ran, so no handler spoke`);
    assert.equal(await approval(), 'draft', action);
    assert.equal(await stored(), '', action);
  }
});

check('in Agent mode an undo onto an approved board brings the content back as a draft', async () => {
  const undo = await agent('act', {action: 'undo'}, 'astra');
  assert.equal(await title(), 'First light');
  cleared(undo, 'Agent mode undo');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), '');
  await agent('end', {}, 'astra');
});

/* Opus review 2026-11-22, M2: data could rename the button act pressed, past the refusal that read the name. */
check('act cannot rename the action it presses through data', async () => {
  await agent('end', {}, 'astra');
  await personClicks('agent-connect-toggle');
  await sleep(250);
  await closeModal();
  const before = await freshDraft();
  for (const action of ['approve-export', 'approve-human-only']) {
    const answer = await agent('act', {action: 'export', data: {action}});
    assert.match(answer.error ?? '', /"action"/, `data.action ${action}: ${JSON.stringify(answer).slice(0, 200)}`);
    await closeModal();
    assert.equal(await approval(), 'draft');
    assert.equal(await stored(), before);
  }
});

/* The write itself is the last door. A press with no origin at all (in-page code, not the person and
   not an agent's command) reaches it past every refusal before it, and must find it shut. */
check('a press nobody vouches for approves nothing, on either approve button', async () => {
  const before = await freshDraft();
  // The real buttons, carrying the stamp of the board they show, clicked by in-page code: only the person check stands in the way.
  await evaluate(`document.querySelector('.review-card [data-action="approve"]').click()`);
  await sleep(200);
  assert.equal(await approval(), 'draft', 'Approve direction');
  await control('export');
  await sleep(200);
  await evaluate(`document.querySelector('#modal-root [data-action="approve-export"]').click()`);
  await sleep(200);
  assert.equal(await approval(), 'draft', 'Approve now');
  assert.equal(await stored(), before);
  await closeModal();
});

/* Opus review 2026-11-22, M1: an agent undo of a step that changed nothing approved took the approval away. */
check("an agent's undo of a step that changed nothing keeps the person's approval", async () => {
  await agentEdits('First light');
  const pages = await agent('contract');
  let second = pages.pages.find(p => p.name === 'Second');
  if (!second) { assert.equal((await agent('apply', {ops: [{op: 'page', name: 'Second'}]})).ok, true); second = (await agent('contract')).pages.find(p => p.name === 'Second'); await agent('act', {action: 'page', data: {id: pages.pages[0].page_id}}); }
  await personApproves();
  const fp = await stored();
  const active = async () => (await agent('contract')).pages.find(p => p.active)?.page_id;
  const first = await active();
  assert.equal((await agent('act', {action: 'page', data: {id: second.page_id}})).error, undefined);
  assert.equal(await active(), second.page_id, 'the page did change');
  assert.equal(await approval(), 'approved', 'moving to another page changes nothing approved');
  const undo = await agent('act', {action: 'undo'});
  assert.equal(await active(), first, 'and the undo did take it back');
  assert.equal(undo.approval, undefined, JSON.stringify(undo).slice(0, 200));
  assert.equal(await approval(), 'approved');
  assert.equal(await stored(), fp);
});

/* Opus review 2026-11-22, H2: the export window is not redrawn on a change, so Approve now approved what the person had not seen. */
check('Approve now in a window the board changed under is refused, and the redrawn one approves', async () => {
  await agentEdits('What the person saw');
  await control('export');
  await sleep(200);
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-stale') === null`), true, 'nothing stale yet');
  await agentEdits('Agent changed this');
  await sleep(100);
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-stale') !== null`), true, 'the window says the board changed under it');
  await personPresses('[data-action="approve-export"]');
  await sleep(250);
  assert.equal(await approval(), 'draft', 'the press did not approve what the window had not shown');
  assert.equal(await stored(), '');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /board changed|보드가 바뀌었/);
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-stale') === null`), true, 'the window was redrawn with the board as it is');
  await personPresses('[data-action="approve-export"]');
  await sleep(250);
  assert.equal(await approval(), 'approved', 'pressed again on the redrawn window, it approves');
  assert.equal(await title(), 'Agent changed this');
  await closeModal();
  await sleep(5_200);
});

check('the person reaches Approve now with Tab and presses Enter', async () => {
  await freshDraft();
  await control('export');
  await sleep(300);
  let on = '';
  for (let i = 0; i < 12 && on !== 'approve-export'; i++) {
    await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9});
    await sleep(60);
    on = await evaluate(`document.activeElement?.dataset?.action ?? ''`);
  }
  assert.equal(on, 'approve-export', 'Tab reached Approve now');
  await personKeys('Enter');
  await sleep(250);
  assert.equal(await approval(), 'approved');
  await closeModal();
  await sleep(5_200);
});

/* Codex 2026-11-22 (check 3): Home's delete, sent while a board was open, took its library entry, and every save after
   that quietly wrote nothing. Home's actions run on Home only. */
check('a Home delete sent while a board is open is refused, and the next edit is saved', async () => {
  const id = (await saved()).id;
  const answer = await agent('act', {action: 'hub-delete-confirm', data: {id}});
  assert.equal(answer.status, 409, JSON.stringify(answer).slice(0, 200));
  assert.match(answer.error, /Home action/);
  assert.equal((await saved()).id, id, 'the board is still in the library');
  await agentEdits('Saved after the refusal');
  await agentEdits('First light');
});

/* Codex 2026-11-22 (check 3): a handler that waits wrote to whichever board was open when it finished. */
check('a picture fetched for one board lands on no other board', async () => {
  await closeModal();
  await agent('act', {action: 'remove-reference'});
  await closeModal();
  assert.equal((await saved()).reference, false);
  assert.equal((await saved('Other')).reference, false);
  const otherId = (await saved('Other')).id, id = (await saved()).id;
  await evaluate(`(() => { const real = window.fetch; window.__heldFetch = real;
    const held = new Promise(r => { window.__release = r; });
    window.fetch = (url, ...rest) => String(url).includes('demo-reference') ? held.then(() => real(url, ...rest)) : real(url, ...rest); return true; })()`);
  assert.equal((await agent('act', {action: 'reference'})).error, undefined);
  await sleep(200);
  assert.equal((await agent('click', {selector: '#modal-root [data-action="demo-reference"]'})).error, undefined, 'the click replied while the picture was on its way');
  assert.equal((await agent('act', {action: 'hub-open', data: {id: otherId}})).error, undefined, 'and then the other board was opened');
  await sleep(300);
  await evaluate(`(() => { window.__release(); window.fetch = window.__heldFetch; return true; })()`);
  await sleep(800);
  assert.equal((await saved('Other')).reference, false, 'the board open now did not get it');
  assert.equal((await saved()).reference, false, 'nor did the board it was for, which is no longer open');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /Cancelled|취소했습니다/, 'the person is told it was cancelled');
  await closeModal();
  await control('hub-open', {id});
  await sleep(500);
});

/* Codex 2026-11-22 (check 3): the export window's notice stayed after the board came back, and a page switch or an undone
   approval, outside the content fingerprint, said nothing. */
check('the export window says it is stale exactly while what it shows differs from the board', async () => {
  const stale = () => evaluate(`document.querySelector('#modal-root .export-stale') !== null`);
  const was = await title();
  await control('export');
  await sleep(200);
  assert.equal(await stale(), false);
  await agentEdits('Round trip');
  assert.equal(await stale(), true, 'changed');
  await agentEdits(was);
  assert.equal(await stale(), false, 'back as it was, the notice goes');
  const second = (await agent('contract')).pages.find(p => p.name === 'Second');
  const first = (await agent('contract')).pages.find(p => p.active);
  assert.equal((await agent('act', {action: 'page', data: {id: second.page_id}})).error, undefined);
  assert.equal(await stale(), true, 'another page is open than the one the preview shows');
  await agent('act', {action: 'page', data: {id: first.page_id}});
  assert.equal(await stale(), false);
  await closeModal();
});

/* Codex 2026-11-22 (check 4): Approve now checked the content only, so a page switch under an open window let the first press approve. */
check('Approve now in a window whose page changed under it redraws instead of approving', async () => {
  await freshDraft();
  const contract = await agent('contract');
  const first = contract.pages.find(p => p.active), second = contract.pages.find(p => p.name === 'Second');
  await control('export');
  await sleep(200);
  assert.equal((await agent('act', {action: 'page', data: {id: second.page_id}})).error, undefined);
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-stale') !== null`), true, 'the window says it is stale');
  await personPresses('[data-action="approve-export"]');
  await sleep(250);
  assert.equal(await approval(), 'draft', 'the first press redrew the window instead of approving');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`), /board changed|보드가 바뀌었/);
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-stale') === null`), true, 'redrawn with the page that is open');
  await closeModal();
  await sleep(5_200);
  await agent('act', {action: 'page', data: {id: first.page_id}});
});

check('a window left open while the approval is undone says it no longer shows the board', async () => {
  await personApproves();
  await control('export');
  await sleep(200);
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-status.approved') !== null`), true);
  assert.equal((await agent('act', {action: 'undo'})).error, undefined);
  assert.equal(await approval(), 'draft');
  assert.equal(await evaluate(`document.querySelector('#modal-root .export-stale') !== null`), true, 'an Approved badge over a draft board is called stale');
  await closeModal();
});

/* Opus review 2026-11-22, H1: Home left the last board in memory, and an agent's write put the old copy back. */
const toHome = async () => { await control('home'); await sleep(300); assert.equal(await evaluate(`document.querySelector('#app').dataset.screen`), 'home'); };
const refusedNoBoard = (answer, what) => {
  assert.equal(answer.status, 409, `${what}: ${JSON.stringify(answer).slice(0, 200)}`);
  assert.match(answer.error, /no board is open/, what);
};
const agentWritesFromHome = async () => {
  refusedNoBoard(await agent('act', {action: 'page', data: {id: 'x'}}), 'act page');
  refusedNoBoard(await agent('apply', {ops: [{op: 'frame', preset: 'mobile'}]}), 'apply frame');
  refusedNoBoard(await agent('edit', {blockId: hero, field: 'title', text: 'First light'}), 'edit');
  refusedNoBoard(await agent('contract'), 'contract');
  refusedNoBoard(await agent('export', {format: 'contract'}), 'export');
};

check('a board renamed on Home stays the draft the rename made, whatever an agent then sends', async () => {
  await agentEdits('First light');
  await personApproves();
  const id = (await saved()).id;
  await toHome();
  await control('hub-rename', {id});
  await sleep(200);
  assert.equal(await personSubmits('#hub-rename-form', {name: 'Renamed by person'}), true);
  await sleep(300);
  assert.equal(await stored('Renamed by person'), '', 'the rename made it a draft');
  await agentWritesFromHome();
  assert.equal(await stored('Renamed by person'), '', 'still the draft the person left');
  assert.equal(await evaluate(`(JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries ?? []).some(e => e.project.name === 'Approval')`), false, 'the old name did not come back');
  await control('hub-open', {id});
  await sleep(500);
  assert.equal(await approval(), 'draft', 'and it opens as a draft');
  await toHome();
  await control('hub-rename', {id});
  await sleep(200);
  await personSubmits('#hub-rename-form', {name: NAME});
  await sleep(300);
  await closeModal();
});

check('a board deleted on Home stays deleted, whatever an agent then sends', async () => {
  await control('hub-open', {id: (await saved()).id});
  await sleep(500);
  await agentEdits('First light');
  await personApproves();
  const id = (await saved()).id;
  await toHome();
  await control('hub-delete-confirm', {id});
  await sleep(300);
  const gone = () => evaluate(`(JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries ?? []).some(e => e.project.id === ${JSON.stringify(id)})`);
  assert.equal(await gone(), false, 'the person deleted it');
  refusedNoBoard(await agent('act', {action: 'page', data: {id: 'x'}}), 'act page');
  refusedNoBoard(await agent('apply', {ops: [{op: 'frame', preset: 'mobile'}]}), 'apply frame');
  // The editor's own actions read the board in memory, which is the deleted one: none of them runs on Home.
  for (const action of ['export', 'save-project', 'approve', 'download-bundle', 'copy-prompt']) {
    refusedNoBoard(await agent('act', {action}), `act ${action}`);
    assert.equal(await modals(), 0, `act ${action}: no window opened`);
  }
  await sleep(200);
  assert.equal(await gone(), false, 'and it was not written back');
});

/* Codex 2026-11-22 (check 4): on Home, disk-backup wrote the board left in memory, a deleted one included. */
const captureDownloads = () => evaluate(`(() => { window.__downloads = []; if (!window.__realObjectURL) { window.__realObjectURL = URL.createObjectURL; URL.createObjectURL = blob => { window.__downloads.push(blob); return window.__realObjectURL(blob); }; } return true; })()`);
const lastDownload = () => evaluate(`(async () => { const b = window.__downloads?.at(-1); return b ? await b.text() : null; })()`);
check('on Home a backup holds the library as saved, not the board deleted there', async () => {
  const deleted = (await evaluate(`JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.map(e => e.project.name)`));
  assert.equal(deleted.includes(NAME), false, 'the scene before deleted it');
  await captureDownloads();
  await control('disk-backup');
  await sleep(300);
  const text = await lastDownload();
  assert.ok(text, 'a file came out');
  assert.equal(text.includes('"name": "' + NAME + '"') || text.includes('"name":"' + NAME + '"'), false, 'the deleted board is not in it');
  assert.ok(text.includes('Other'), 'the library that is saved is');
});

/* Codex 2026-11-22 (check 4): the editor's save-failure buttons were refused by a disk- prefix. In the browser the
   save fails at storage; the backup has to carry the edit that could not be saved. */
check('when a save fails in the editor, the backup holds the edit that was not saved', async () => {
  const start = (await saved('Start')).id;
  await control('hub-open', {id: start});
  await sleep(500);
  await captureDownloads();
  await evaluate(`(() => { window.__realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; return true; })()`);
  try {
    const blockId = await evaluate(`document.querySelector('#design-canvas [data-block-id]')?.dataset.blockId`);
    assert.ok(blockId, 'the board has a block');
    assert.equal((await agent('edit', {blockId, field: 'title', text: 'Not saved yet'})).error, undefined);
    await evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'disk-backup'; document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
    await sleep(300);
  } finally { await evaluate(`(() => { Storage.prototype.setItem = window.__realSetItem; return true; })()`); }
  assert.match(await lastDownload() ?? '', /Not saved yet/, 'the backup carries the unsaved edit');
});

/* The rule the prefixes broke: a button a screen draws can be pressed on that screen. Every window and band the
   browser build can open, on each screen, with every menu unfolded. */
const screensModule = await build({entryPoints: ['src/editor/screens.ts'], bundle: true, write: false, format: 'esm', logLevel: 'silent'});
const {actionScreen} = await import('data:text/javascript;base64,' + Buffer.from(screensModule.outputFiles[0].contents).toString('base64'));
const drawnActions = () => evaluate(`(() => { document.querySelectorAll('details').forEach(d => { d.open = true; }); return [...new Set([...document.querySelectorAll('[data-action]')].map(e => e.dataset.action))]; })()`);
const opened = {}, collected = {};
const sweep = async (where, windows, shown = 'the screen and its menus') => {
  opened[where] ??= []; collected[where] ??= new Map();
  for (const a of await drawnActions()) if (!collected[where].has(a)) collected[where].set(a, shown);
  opened[where].push(`(${shown})`);
  for (const [action, data] of windows) {
    await closeModal();
    await control(action, data);
    await sleep(250);
    if (await modals()) opened[where].push(action);
    for (const a of await drawnActions()) if (!collected[where].has(a)) collected[where].set(a, action);
  }
  await closeModal();
};
check('every button a screen draws can be pressed on that screen', async () => {
  const start = (await saved('Start')).id, other = (await saved('Other')).id;
  await control('hub-open', {id: start});
  await sleep(500);
  await sweep('editor', [['export', {}], ['export-tab', {view: 'html'}], ['storage-info', {}], ['theme-review', {}], ['commands', {}], ['project', {}], ['systems', {}], ['component-explorer', {}], ['reference', {}], ['add-page', {}], ['page-menu', {}], ['agent', {}], ['agent-connect', {}], ['about', {}], ['brand-kit', {}], ['language-settings', {}], ['welcome-show', {}], ['new-frame', {}], ['autofill', {}], ['design-md', {}], ['preview', {}], ['font-picker', {}], ['new-project', {}]]);
  await control('home');
  await sleep(300);
  await sweep('home', [['storage-info', {}], ['ws-new', {}], ['ws-settings', {}], ['hub-rename', {id: other}], ['hub-delete', {id: other}], ['new-project', {}], ['welcome-show', {}], ['language-settings', {}], ['about', {}], ['brand-kit', {}], ['agent-connect', {}]]);
  assert.deepEqual(refusedWhereDrawn(['editor', 'home']), [], 'a drawn button its screen would refuse');
});
/** Each action drawn on a screen that the table keeps to the other one, with the window it was drawn in. */
const refusedWhereDrawn = wheres => wheres.flatMap(where => {
  const screen = where.endsWith('editor') ? 'editor' : 'home', other = screen === 'editor' ? 'home' : 'editor';
  console.log(`       opened (${where}): ${opened[where].join(', ')}`);
  console.log(`       actions drawn (${where}): ${collected[where].size}`);
  return [...collected[where]].filter(([a]) => actionScreen(a) === other).map(([a, from]) => `${where} draws ${a} (in ${from})`);
});

/* The bands the browser build never draws (the save-failure band, Files, the missing-folder notice, the unreadable-store
   band) belong to the desktop app. The page is reopened as the desktop build, its Tauri calls answered here, and
   saves are made to fail to raise the band. This check reloads the page, so it runs last. */
const desktopCalls = `(() => {
  const state = window.__desktop = {library: localStorage.getItem('__desktopLibrary'), gone: localStorage.getItem('__desktopGone') === '1', failWrites: false, revision: 1, calls: [], files: []};
  const callbacks = new Map(); let next = 1;
  const vault = {path: '/tmp/aphrodite-desktop-check/vault', snapshot: 'project.json', files: [{name: 'project.json', kind: 'snapshot', bytes: 10}, {name: 'notes.md', kind: 'document', bytes: 10}, {name: 'logo.png', kind: 'image', bytes: 10}], externalReferences: []};
  const answers = {
    workspace_read: () => ({revision: state.revision, data: state.gone ? null : state.library, path: '/tmp/aphrodite-desktop-check/workspace.json'}),
    workspace_write: ({data}) => { if (state.failWrites) throw 'the disk is full'; state.library = data; return ++state.revision; },
    workspace_recovery: () => ({}),
    vault_sync: () => vault, vault_document: () => vault,
    image_library_list: () => ({dir: '/tmp/aphrodite-desktop-check/images', images: []}),
    references_list: () => ({entries: []}),
    'plugin:event|listen': () => next++, 'plugin:event|unlisten': () => null,
    'plugin:dialog|save': ({options}) => '/tmp/aphrodite-desktop-check/' + (options?.defaultPath ?? 'file'),
    'plugin:fs|write_file': args => { state.files.push(new TextDecoder().decode(args instanceof Uint8Array ? args : new Uint8Array(args?.data ?? []))); return null; },
  };
  window.isTauri = true;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener: () => {}};
  window.__TAURI_INTERNALS__ = {
    metadata: {currentWindow: {label: 'main'}, currentWebview: {windowLabel: 'main', label: 'main'}},
    transformCallback: cb => { const id = next++; callbacks.set(id, cb); return id; },
    unregisterCallback: id => callbacks.delete(id),
    convertFileSrc: p => p,
    invoke: async (cmd, args) => { state.calls.push(cmd); const answer = answers[cmd]; if (!answer) throw cmd + ' is not part of this check'; return answer(args ?? {}); },
  };
})();`;
/** Every action name written in the source as a data-action or as an action in a menu table. */
const actionsInCode = () => {
  const names = new Set();
  const walk = dir => { for (const entry of readdirSync(dir, {withFileTypes: true})) { const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path); else if (path.endsWith('.ts')) for (const m of readFileSync(path, 'utf8').matchAll(/data-action="([a-z0-9-]+)"|\baction:'([a-z0-9-]+)'|\bbutton\('([a-z0-9-]+)'/g)) names.add(m[1] ?? m[2] ?? m[3]); } };
  walk('src');
  return names;
};
const reopenAsDesktop = async (library, gone = false) => {
  await evaluate(`(() => { localStorage.setItem('__desktopLibrary', ${JSON.stringify(library)}); localStorage.setItem('__desktopGone', ${JSON.stringify(gone ? '1' : '0')}); return true; })()`);
  await send('Page.reload');
  let screen;
  for (let i = 0; i < 40 && screen !== 'home'; i++) { await sleep(250); screen = await evaluate(`document.documentElement.classList.contains('native-desktop') && document.querySelector('#app')?.dataset.screen`).catch(() => undefined); }
  assert.equal(screen, 'home', 'the page came back as the desktop build, on Home');
  await closeModal();
};
const desktopWritten = () => evaluate(`window.__desktop.files.at(-1) ?? null`);
check('on the desktop build too, every button a screen draws can be pressed on that screen, the save-failure band included', async () => {
  const start = (await saved('Start')).id, other = (await saved('Other')).id;
  const library = await evaluate(`localStorage.getItem('aphrodite-project-library-v1')`);
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {source: desktopCalls});
  /* Home: its windows, a save that fails there, the missing-folder notice, and a store that cannot be read. */
  await reopenAsDesktop(library);
  await sweep('desktop Home', [['storage-info', {}], ['vault-open', {id: other}], ['ws-settings', {}], ['hub-rename', {id: other}], ['hub-delete', {id: other}], ['new-project', {}], ['about', {}], ['agent-connect', {}]]);
  await evaluate(`(() => { window.__desktop.failWrites = true; return true; })()`);
  await control('hub-pin', {id: other});
  await sleep(500);
  await sweep('desktop Home', [], 'Home after a save failed there');
  await reopenAsDesktop(library, true);
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-action]')].some(e => e.dataset.action === 'disk-start-fresh')`), 'the missing-folder notice is up');
  await sweep('desktop Home', [], 'the missing-folder notice');
  await reopenAsDesktop('{not a library');
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-action]')].some(e => e.dataset.action === 'hub-recovery')`), 'the unreadable-store band is up');
  await sweep('desktop Home', [], 'the unreadable-store band');
  /* The editor: its windows, then a save that fails, which raises the band. */
  await reopenAsDesktop(library);
  await control('hub-open', {id: start});
  await sleep(500);
  await sweep('desktop editor', [['storage-info', {}], ['vault-open', {}], ['export', {}], ['about', {}], ['agent-connect', {}], ['theme-review', {}]]);
  await evaluate(`(() => { window.__desktop.failWrites = true; return true; })()`);
  await control('add', {kind: 'cta'});
  await sleep(800);
  assert.equal(await evaluate(`document.querySelector('.disk-warning') !== null`), true, 'the save-failure band is up');
  await sweep('desktop editor', [['storage-info', {}]], 'the save-failure band');
  const refused = refusedWhereDrawn(['desktop editor', 'desktop Home']);
  const reached = new Set(Object.values(collected).flatMap(m => [...m.keys()]));
  /* An action that runs anywhere cannot be refused where it is drawn; the ones kept to a screen and never reached here are what this sweep does not vouch for. */
  const unreached = [...actionsInCode()].filter(a => !reached.has(a) && actionScreen(a) !== 'any').sort();
  console.log(`       kept to a screen, written in src, drawn in none of these windows (${unreached.length}): ${unreached.map(a => `${a} (${actionScreen(a)})`).join(', ')}`);
  assert.deepEqual(refused, [], 'a drawn button its screen would refuse');
});

check('on the desktop build, when a save fails the backup holds the edit that was not saved, and reload reads the disk', async () => {
  assert.equal(await evaluate(`document.querySelector('.disk-warning') !== null`), true, 'the scene before left a failed save in the editor');
  const saved = JSON.parse(await evaluate(`window.__desktop.library`)).entries.find(e => e.project.name === 'Start').project;
  const kept = saved.pages.flatMap(p => p.blocks).length;
  const added = await evaluate(`[...document.querySelectorAll('#design-canvas [data-block-id]')].map(e => e.dataset.blockId).at(-1)`);
  await control('disk-backup');
  await sleep(500);
  assert.ok((await desktopWritten() ?? '').includes(added), 'the backup holds the block the failed save did not keep');
  const reads = await evaluate(`window.__desktop.calls.filter(c => c === 'workspace_read').length`);
  await control('disk-reload');
  await sleep(600);
  assert.equal(await evaluate(`window.__desktop.calls.filter(c => c === 'workspace_read').length`), reads + 1, 'reload read the disk');
  assert.equal(await evaluate(`document.querySelectorAll('#design-canvas [data-block-id]').length`), kept, 'and the board is the saved one');
  assert.equal(await evaluate(`document.querySelector('.disk-warning') !== null`), false, 'the band is gone');
});

await runChecks(checks, close);
