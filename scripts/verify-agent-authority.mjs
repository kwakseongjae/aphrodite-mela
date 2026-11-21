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

const {agent, personClicks, personSubmits, personTypes, presses, evaluate, close} = await openApp({port: 4183, cdp: 9334, profile: '/tmp/aphrodite-authority-profile'});
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
   approve button through `act` or `click`, and revive an approval by putting the content back. ---- */
const approval = () => evaluate(`document.querySelector('#app').dataset.approval`);
const stored = () => evaluate(`(() => { const lib = JSON.parse(localStorage.getItem('aphrodite-project-library-v1') || '{}');
  return (lib.entries ?? []).find(e => e.project.name === 'Approval')?.project.approvedFingerprint ?? null; })()`);
const modals = () => evaluate(`document.querySelector('#modal-root').children.length`);
const closeModal = () => evaluate(`(() => { document.querySelector('#modal-root .modal-backdrop')?.click(); return true; })()`);
const firstBlock = () => evaluate(`document.querySelector('#design-canvas [data-block-id]')?.dataset.blockId ?? ''`);
const refusedApproval = (result, what) => {
  assert.equal(result.status, 403, `${what}: ${JSON.stringify(result)}`);
  assert.match(result.error, /person/, `${what}: the refusal says whose decision it is`);
};
/** The board stays a draft with nothing written and nothing opened. */
const untouched = async (what, fingerprint) => {
  assert.equal(await approval(), 'draft', `${what}: the board is still a draft`);
  assert.equal(await stored(), fingerprint, `${what}: the stored fingerprint did not change`);
  assert.equal(await modals(), 0, `${what}: nothing opened on the screen`);
};
let hero = '';
let drafts = 0;
/** Each route starts from its own draft, so one that gets through cannot hide the next. */
const freshDraft = async () => {
  await agent('edit', {blockId: hero, field: 'title', text: `Draft ${++drafts}`});
  await closeModal();
  await sleep(100);
  assert.equal(await approval(), 'draft');
  return stored();
};

check('the person opens a project and connects an agent', async () => {
  await personClicks('welcome-blank');
  await sleep(400);
  assert.equal(await personSubmits('#new-project-form', {name: 'Approval'}), true, 'the new-project dialog was filled in');
  await sleep(600);
  await personClicks('agent-connect-toggle');
  await sleep(250);
  await closeModal();
  await sleep(150);
  const added = await agent('apply', {ops: [{op: 'add', component_kind: 'hero', content: {title: 'First light'}}]});
  assert.equal(added.ok, true, JSON.stringify(added));
  hero = await firstBlock();
  assert.ok(hero, 'the hero is on the canvas');
  await untouched('a fresh project', null);
});

for (const action of ['approve', 'approve-human-only', 'approve-export']) {
  check(`act ${action} is refused and approves nothing`, async () => {
    const before = await freshDraft();
    refusedApproval(await agent('act', {action}), action);
    await untouched(`act ${action}`, before);
  });
}

check('a click on the real approve button is refused', async () => {
  const before = await freshDraft();
  assert.equal(await evaluate(`document.querySelector('.review-card [data-action="approve"]') !== null`), true, 'the button is on screen');
  refusedApproval(await agent('click', {selector: '.review-card [data-action="approve"]'}), 'click approve');
  await untouched('click approve', before);
});

check('a click on Approve now in the export window is refused', async () => {
  const before = await freshDraft();
  assert.equal((await agent('act', {action: 'export'})).error, undefined, 'the export window opened');
  await sleep(150);
  assert.equal(await evaluate(`document.querySelector('[data-action="approve-export"]') !== null`), true, 'Approve now is on screen');
  refusedApproval(await agent('click', {selector: '[data-action="approve-export"]'}), 'click approve-export');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), before);
  await closeModal();
  await sleep(150);
});

check('the palette has no approve, by query or by key', async () => {
  const before = await freshDraft();
  assert.match((await agent('command', {query: 'approve'})).error ?? '', /no palette command/);
  await untouched('command approve', before);
  await agent('key', {key: 'k', meta: true});
  await sleep(100);
  await agent('type', {selector: '#command-search', text: 'approve', submit: true});
  await sleep(150);
  await agent('key', {key: 'Enter'});
  await sleep(100);
  await closeModal();
  await sleep(100);
  await untouched('key Enter on an approve query', before);
});

check('the person approves with the button, and an agent pressing it again only opens the export window', async () => {
  await agent('edit', {blockId: hero, field: 'title', text: 'First light'});
  await personClicks('approve');
  await sleep(150);
  assert.equal(await approval(), 'approved', 'the person approved');
  assert.ok(await stored(), 'the fingerprint was written');
  const again = await agent('act', {action: 'approve'});
  assert.equal(again.error, undefined, JSON.stringify(again));
  assert.equal(await modals(), 1, 'the export window opened, as it does for the person');
  assert.equal(await approval(), 'approved');
  await closeModal();
  await sleep(150);
});

let approvedFingerprint = null;
check('an agent that puts the content back with edit does not revive the approval', async () => {
  approvedFingerprint = await stored();
  assert.equal((await agent('edit', {blockId: hero, field: 'title', text: 'Second light'})).error, undefined);
  assert.equal(await approval(), 'draft', 'the change made it a draft');
  const back = await agent('edit', {blockId: hero, field: 'title', text: 'First light'});
  assert.equal(back.error, undefined, 'the edit itself went through');
  assert.match(back.approval ?? '', /only the person approves/, JSON.stringify(back));
  assert.equal(await approval(), 'draft', 'the board stayed a draft');
  assert.equal(await stored(), null, 'the fingerprint is gone');
});

check("the person's own undo may bring their approval back", async () => {
  await presses('z', 4);
  await sleep(200);
  assert.equal(await approval(), 'draft', 'one undo is the agent\'s Second light, still a draft');
  await presses('z', 4);
  await sleep(200);
  assert.equal(await approval(), 'approved', 'the second undo is the person\'s own approved board');
  assert.equal(await stored(), approvedFingerprint);
  await sleep(5_200); // the person's hold on the screen expires
});

check('an agent that puts the content back with apply does not revive the approval', async () => {
  assert.equal((await agent('apply', {ops: [{op: 'update', block_id: hero, fields: {title: 'Third light'}}]})).ok, true);
  assert.equal(await approval(), 'draft');
  const back = await agent('apply', {ops: [{op: 'update', block_id: hero, fields: {title: 'First light'}}]});
  assert.equal(back.ok, true, 'the batch itself went through');
  assert.match(back.approval ?? '', /only the person approves/, JSON.stringify(back));
  assert.equal(back.state?.state?.approval, 'draft', 'the state in the reply says draft too');
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), null);
});

check('an agent undo that lands on an approved board does not revive it', async () => {
  await personClicks('approve');
  await sleep(150);
  assert.equal(await approval(), 'approved');
  await agent('edit', {blockId: hero, field: 'title', text: 'Fourth light'});
  assert.equal(await approval(), 'draft');
  const undo = await agent('act', {action: 'undo'});
  assert.match(undo.approval ?? '', /only the person approves/, JSON.stringify(undo));
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), null);
});

check("after an agent's undo is cleared, the person's ⌘⇧Z and ⌘Z step through drafts", async () => {
  await presses('z', 4 | 8); // ⌘⇧Z: back to the agent's Fourth light
  await sleep(200);
  assert.equal(await approval(), 'draft');
  await presses('z', 4); // ⌘Z: the board as the clearing left it
  await sleep(200);
  assert.equal(await approval(), 'draft', 'the clearing is not an undo step, so no press lands on the revived approval');
  assert.equal(await stored(), null);
  await sleep(5_200);
});

check('an agent redo that lands on an approved board does not revive it', async () => {
  await personClicks('approve');
  await sleep(150);
  assert.equal(await approval(), 'approved');
  await agent('act', {action: 'undo'}); // takes the approval back off: that is not a revival
  assert.equal(await approval(), 'draft');
  const redo = await agent('act', {action: 'redo'});
  assert.match(redo.approval ?? '', /only the person approves/, JSON.stringify(redo));
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), null);
});

check('⌘Z and ⌘⇧Z sent as agent keys do not revive it either', async () => {
  await personClicks('approve');
  await sleep(150);
  await agent('edit', {blockId: hero, field: 'title', text: 'Fifth light'});
  const undo = await agent('key', {key: 'z', meta: true});
  assert.match(undo.approval ?? '', /only the person approves/, JSON.stringify(undo));
  assert.equal(await approval(), 'draft');
  await personClicks('approve');
  await sleep(150);
  await agent('key', {key: 'z', meta: true}); // the approval itself, undone
  const redo = await agent('key', {key: 'z', meta: true, shift: true});
  assert.match(redo.approval ?? '', /only the person approves/, JSON.stringify(redo));
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), null);
});

check('in Agent mode the approve presses are refused too', async () => {
  await personClicks('agent-disconnect');
  await sleep(150);
  await evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'editor-mode'; b.dataset.mode = 'agent';
    document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
  await sleep(300);
  assert.equal(await personSubmits('#agent-mode-form', {operator: 'astra', intent: 'tidy the hero'}), true, 'the hand-over form was filled in');
  await sleep(400);
  assert.equal(await evaluate(`document.querySelector('#app').dataset.mode`), 'agent', 'Agent mode is on');
  for (const action of ['approve', 'approve-human-only', 'approve-export']) {
    await agent('edit', {blockId: hero, field: 'title', text: `Agent mode ${action}`}, 'astra');
    await closeModal();
    await sleep(100);
    const before = await stored();
    refusedApproval(await agent('act', {action}, 'astra'), `Agent mode act ${action}`);
    assert.equal(await approval(), 'draft', action);
    assert.equal(await stored(), before, action);
  }
});

check('in Agent mode an undo onto an approved board does not revive it', async () => {
  await agent('end', {}, 'astra');
  await sleep(200);
  await personClicks('approve');
  await sleep(150);
  assert.equal(await approval(), 'approved');
  await evaluate(`(() => { const b = document.createElement('button'); b.dataset.action = 'editor-mode'; b.dataset.mode = 'agent';
    document.querySelector('#app').append(b); b.click(); b.remove(); return true; })()`);
  await sleep(300);
  await personSubmits('#agent-mode-form', {operator: 'astra', intent: 'tidy the hero'});
  await sleep(400);
  await agent('edit', {blockId: hero, field: 'title', text: 'Sixth light'}, 'astra');
  assert.equal(await approval(), 'draft');
  const undo = await agent('act', {action: 'undo'}, 'astra');
  assert.match(undo.approval ?? '', /only the person approves/, JSON.stringify(undo));
  assert.equal(await approval(), 'draft');
  assert.equal(await stored(), null);
  await agent('end', {}, 'astra');
});

await runChecks(checks, close);
