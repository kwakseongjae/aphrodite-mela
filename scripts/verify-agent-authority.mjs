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
  const allowed = await agent('edit', {field: 'title', text: 'Asked and allowed'});
  assert.equal(allowed.status, undefined, JSON.stringify(allowed));
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
  const allowed = await agent('edit', {field: 'title', text: 'Hello from the agent'});
  assert.equal(allowed.status, undefined, `the permission rule let it through: ${JSON.stringify(allowed)}`);
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
  const allowed = await agent('edit', {field: 'title', text: 'back to work'});
  assert.equal(allowed.status, undefined, `expected the hold to have expired: ${JSON.stringify(allowed)}`);
});

check('a second agent is refused by name while the first holds it', async () => {
  await agent('edit', {field: 'title', text: 'mine'}, 'claude-code');
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
    return p ? {id: p.id, fingerprint: p.approvedFingerprint ?? '', title: p.pages.flatMap(pg => pg.blocks).find(b => b.kind === 'hero')?.title ?? ''} : null; })()`);
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
  assert.equal(await approval(), 'approved');
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

await runChecks(checks, close);
