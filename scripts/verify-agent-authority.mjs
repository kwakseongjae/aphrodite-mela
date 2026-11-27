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
import {openApp, runChecks, sleep, waitFor} from './lib/headless.mjs';

const {agent, personClicks, personPresses, personSubmits, personTypes, evaluate, send, close} = await openApp({port: 4183, cdp: 9334, profile: '/tmp/aphrodite-authority-profile'});
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
/** `edit` needs a reason since 0.3-2b; what is checked here is the door, not the reason. */
const WHY = 'verify-agent-authority: checking who may write.';

check('reading works with nobody at the door', async () => {
  const state = await agent('state');
  assert.equal(state.ok, true);
  assert.ok(state.state, 'the state payload came back');
});

check('writing is refused with 423 and told how to proceed', async () => {
  const refused = await agent('edit', {reason: WHY, field: 'title', text: 'x'});
  assert.equal(refused.status, 423, JSON.stringify(refused));
  assert.match(refused.error, /Connected mode|Agent mode/);
});

check('an agent cannot open the door for itself', async () => {
  const refused = await agent('act', {action: 'agent-connect-toggle'});
  assert.equal(refused.status, 403, 'flipping the switch is the person\'s, like approving');
  assert.match(refused.error, /the person's to decide/);
  assert.equal(await evaluate(`document.querySelector('.connect-mark') !== null`), false, 'no mark appeared');
});

/* The request is a dialog in the middle of the screen (0.3-1b). The person answers it with their own
   mouse and keys — trusted CDP input — because a synthetic event is exactly what an agent could send. */
const dialog = () => evaluate(`document.querySelector('#modal-root .ask-modal')?.textContent ?? ''`);
const key = async (key, code, vk) => {
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code, windowsVirtualKeyCode: vk});
  await sleep(200);
};
const press = async action => {
  const p = await evaluate(`(() => { const r = document.querySelector('#modal-root [data-action="${action}"]').getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); if (hit?.closest('[data-action]')?.dataset.action !== '${action}') throw new Error('${action} is covered by ' + hit?.outerHTML.slice(0, 120)); return {x, y}; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1});
  await sleep(250);
};

check('an agent can ask, and the request waits for the dialog the person is in', async () => {
  const before = await evaluate(`document.querySelector('#app').dataset.modal`);
  assert.ok(before, 'the first-launch welcome is open');
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  assert.match(asked.message, /claude-code/, 'the reply says the person can see who is asking');
  await sleep(200);
  assert.equal(await dialog(), '', 'the request does not replace what the person has open');
  assert.equal(await evaluate(`document.querySelector('#app').dataset.modal`), before);
  await personClicks('welcome-dismiss');
  await sleep(250);
});

check('the request reaches the person with its name on it, in the middle of the screen', async () => {
  const text = await dialog();
  assert.match(text, /claude-code/, 'the request is on their screen once the welcome closes');
  // The person reads which program it is and where it runs; the raw name it sent stays, small, in code type.
  assert.match(await evaluate(`document.querySelector('#modal-root .ask-modal #modal-title').textContent`), /^Claude Code/, 'the heading names the program');
  assert.match(text, /터미널|terminal/, 'and where it runs');
  assert.match(text, /MCP/);
  assert.match(text, /새로 켜지는 것은 없습니다|starts nothing new/, 'allowing launches nothing');
  assert.equal(await evaluate(`document.querySelector('#modal-root .ask-name').textContent`), 'claude-code', 'the name it gave itself is shown as such');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#modal-root .ask-name')).fontFamily.includes('monospace')`), true, 'the name is set in code type');
  assert.match(text, /⌘Z/);
  assert.match(text, /not be asked again|다음부터는 묻지 않습니다/);
  assert.equal(await evaluate(`document.activeElement?.dataset.action`), 'ask-allow', 'Allow has the focus, so Enter allows');
  assert.equal(await evaluate(`document.querySelector('.connect-mark') !== null`), false, 'asking did not open anything');
  const again = await agent('connect', {}, 'claude-code');
  assert.equal(again.status, 'waiting', 'asking twice does not put up a second request');
});

check('the focus stays in the request', async () => {
  for (let i = 0; i < 5; i++) {
    await key('Tab', 'Tab', 9);
    assert.equal(await evaluate(`document.querySelector('#modal-root').contains(document.activeElement)`), true, `after ${i + 1} Tab presses`);
  }
  await evaluate(`document.querySelector('#modal-root [data-action="ask-allow"]').focus(), true`);
});

check('the person allows it with one click, and the agent may write', async () => {
  await press('ask-allow');
  assert.equal(await dialog(), '', 'the request is answered and gone');
  assert.equal(await evaluate(`document.querySelector('.connect-mark') !== null`), true, 'connected mode is on');
  const allowed = await agent('edit', {reason: WHY, field: 'title', text: 'Asked and allowed'});
  assert.equal(allowed.status, undefined, JSON.stringify(allowed));
  // 0.3-G2b fix 1: the person opens the mark and presses its own Disconnect, as they would.
  await pressOn('.connect-mark > summary');
  assert.equal(await evaluate(`document.querySelector('.connect-mark')?.open ?? false`), true, 'the mark opens under the person\'s press');
  await pressOn('.connect-mark [data-action="agent-disconnect"]');
  assert.equal(await evaluate(`document.querySelector('.connect-mark') !== null`), false, 'Disconnect on the mark closed the door');
  assert.equal((await agent('edit', {reason: WHY, field: 'title', text: 'After the door closed'})).status, 423, 'and the agent can no longer write');
  await sleep(200);
});

check('Enter allows and Esc is Not now, from the person\'s keyboard', async () => {
  await agent('connect', {}, 'claude-code');
  await sleep(200);
  await key('Enter', 'Enter', 13);
  assert.equal(await dialog(), '');
  assert.equal((await agent('state', {}, 'claude-code')).state.writes, 'on', 'Enter allowed it');
  await personPresses('agent-disconnect');
  await sleep(200);
  await agent('connect', {}, 'codex');
  await sleep(200);
  await key('Escape', 'Escape', 27);
  assert.equal(await dialog(), '');
  assert.equal((await agent('connect', {}, 'codex')).status, 'declined', 'Esc declined it');
});

check('a request that arrives mid-press waits for the release', async () => {
  const p = {x: 5, y: 300};
  await send('Input.dispatchMouseEvent', {type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1});
  assert.equal((await agent('connect', {}, 'cursor')).status, 'asked');
  await sleep(200);
  assert.equal(await dialog(), '', 'nothing goes inert under a press');
  await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1});
  await sleep(250);
  assert.match(await dialog(), /cursor/, 'and it shows once the press is over');
  await key('Escape', 'Escape', 27);
});

check('a request left open is not replaced by the next asker, and Allow lets in the name on screen', async () => {
  assert.equal((await agent('connect', {}, 'zed')).status, 'asked');
  await sleep(200);
  const shown = await evaluate(`(() => { const d = document.querySelector('#modal-root .ask-dialog'); return d ? {id: d.dataset.askId, by: d.dataset.askBy} : null; })()`);
  assert.equal(shown?.by, 'zed', 'the dialog carries who asked');
  assert.ok(shown?.id, 'and which request it is');
  // The clock moves past the cooldown while the dialog sits there.
  await evaluate(`(() => { const real = Date.now.bind(Date); window.__realNow = real; Date.now = () => real() + 6 * 60 * 1000; return true; })()`);
  try {
    const other = await agent('connect', {}, 'windsurf');
    assert.equal(other.status, 'waiting', JSON.stringify(other));
    await press('ask-allow');
  } finally {
    await evaluate(`(Date.now = window.__realNow, true)`);
  }
  assert.equal(await writes('zed'), 'on', 'the name on screen is the one let in');
  assert.equal(await writes('windsurf'), 'off');
  await personPresses('agent-disconnect');
  await sleep(150);
});

/* Re-review 0.3-1b: a button pressed before the request arrived can finish after it — `font-picker`
   awaits loadFonts() and then opens its dialog. That continuation must not take the request off the
   screen. The press here is a script in the page, as an agent's act would be; it lands after the request. */
check('a dialog that opens late, from anything but the person, goes under the request', async () => {
  await evaluate(`(setTimeout(() => { const b = document.createElement('button'); b.dataset.action = 'font-picker'; document.querySelector('#app').append(b); b.click(); b.remove(); }, 400), true)`);
  assert.equal((await agent('connect', {}, 'cline')).status, 'asked');
  await sleep(900);
  assert.match(await dialog(), /cline/, 'the request is still on screen');
  assert.equal(await evaluate(`document.querySelectorAll('#modal-root .modal').length`), 2, 'with the late dialog under it');
  assert.equal(await evaluate(`document.activeElement?.dataset.action`), 'ask-allow', 'and the focus still on Allow');
  assert.equal(await evaluate(`!!document.querySelector('#modal-root .modal-backdrop:last-child .ask-modal')`), true, 'the request is the one on top');
  await press('ask-allow');
  assert.equal((await agent('state', {}, 'cline')).state.writes, 'on', 'the person answered the request they saw');
  assert.equal(await dialog(), '');
  assert.equal(await evaluate(`document.querySelectorAll('#modal-root .modal').length`), 1, 'the late dialog is there once the request is answered');
  await key('Escape', 'Escape', 27);
  assert.equal(await evaluate(`document.querySelectorAll('#modal-root .modal').length`), 0);
  await personPresses('agent-disconnect');
  await sleep(150);
});

check('while a request is open, nothing but the person answers or closes it', async () => {
  await agent('connect', {}, 'claude-code');
  await sleep(200);
  await press('ask-allow');
  assert.equal((await agent('connect', {}, 'kiro')).status, 'asked');
  await sleep(200);
  assert.match(await dialog(), /kiro/);
  assert.match(await dialog(), /알 수 없는 프로그램|unknown program/, 'a name the app does not know is said to be unknown');
  // An allowed agent driving buttons that would close or replace a dialog.
  for (const action of ['welcome-dismiss', 'systems', 'home']) {
    const r = await agent('act', {action}, 'claude-code');
    assert.equal(r.status, 409, `${action} waits for the person's answer: ${JSON.stringify(r)}`);
  }
  assert.equal((await agent('command', {query: 'commands'}, 'claude-code')).status, 409);
  assert.equal((await agent('key', {key: 'k', meta: true}, 'claude-code')).status, 409);
  // Its edits are not dialogs, so they go on — and leave the request where it is.
  const edit = await agent('apply', {reason: 'still working', ops: []}, 'claude-code');
  assert.notEqual(edit.status, 409, JSON.stringify(edit));
  await sleep(150);
  assert.match(await dialog(), /kiro/, 'the request is still on screen');
  // Script in the page closing it is not the person either: the request comes back, still unanswered.
  await personClicks('welcome-dismiss');
  await sleep(200);
  assert.match(await dialog(), /kiro/, 'the request is back, not declined');
  assert.equal((await agent('connect', {}, 'kiro')).status, 'waiting', 'and nothing was recorded for the person');
  await press('close-modal');
  assert.equal(await dialog(), '');
  assert.equal((await agent('connect', {}, 'kiro')).status, 'declined', 'the person\'s own × is Not now');
  await personPresses('agent-disconnect');
  await sleep(150);
});

check('the person declines, and the agent is told to stop asking', async () => {
  const asked = await agent('connect', {}, 'gemini');
  assert.equal(asked.status, 'asked', 'a refusal of one name does not hold back another');
  await sleep(200);
  await press('ask-decline');
  assert.equal(await dialog(), '', 'the request is gone');
  const refused = await agent('connect', {}, 'gemini');
  assert.equal(refused.status, 'declined');
  assert.match(refused.message, /Do not ask again/);
  const write = await agent('edit', {reason: WHY, field: 'title', text: 'x'}, 'gemini');
  assert.equal(write.status, 423, 'and the door is still shut');
});

check('the guide tells an agent where it stands without asking permission', async () => {
  const {guide} = await agent('guide');
  assert.match(guide, /## Right now/);
  assert.match(guide, /Mode: design/);
  assert.match(guide, /Approve a direction/, 'it says what is never theirs to do');
});

check('the person turns it on, and the banner says so', async () => {
  await personPresses('agent-connect-toggle');
  await sleep(120);
  assert.equal(await evaluate(`document.querySelector('.connect-mark') !== null`), true, 'the connected mark is up');
});

check('now the agent may write, and the write is not refused by the rule', async () => {
  const allowed = await agent('edit', {reason: WHY, field: 'title', text: 'Hello from the agent'});
  assert.equal(allowed.status, undefined, `the permission rule let it through: ${JSON.stringify(allowed)}`);
});

check('the person types, and takes the screen back', async () => {
  await personTypes('a');
  await sleep(60);
  const refused = await agent('edit', {reason: WHY, field: 'title', text: 'while you were typing'});
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /the person is using the screen/);
});

check('a few quiet seconds and the agent may write again', async () => {
  await sleep(5_400);
  const allowed = await agent('edit', {reason: WHY, field: 'title', text: 'back to work'});
  assert.equal(allowed.status, undefined, `expected the hold to have expired: ${JSON.stringify(allowed)}`);
});

check('a second agent is refused by name while the first holds it', async () => {
  await agent('edit', {reason: WHY, field: 'title', text: 'mine'}, 'claude-code');
  const refused = await agent('edit', {reason: WHY, field: 'title', text: 'mine too'}, 'astra');
  assert.equal(refused.status, 409, JSON.stringify(refused));
  assert.match(refused.error, /claude-code/);
});

check('disconnecting closes the door again', async () => {
  await personPresses('agent-disconnect');
  await sleep(120);
  assert.equal(await evaluate(`document.querySelector('.connect-mark') !== null`), false);
  const refused = await agent('edit', {reason: WHY, field: 'title', text: 'x'});
  assert.equal(refused.status, 423);
});

/* 0.3-1b: an agent the person allowed is remembered by name — no clock, across a restart — until they
   disconnect it. A reload of the page stands in for the restart: the app reads its state back from
   storage exactly as it does at launch. */
const restart = async () => {
  await send('Page.reload', {ignoreCache: true});
  await sleep(800);
  await waitFor(() => evaluate('!!window.aphroditeAgent && !!document.querySelector("#app")'), 'the app to boot again');
};
const writes = async caller => (await agent('state', {}, caller)).state.writes;

check('the person allows an agent by name, and a restart remembers it', async () => {
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
  await sleep(200);
  await press('ask-allow');
  await sleep(200);
  assert.equal(await writes('claude-code'), 'on');
  await restart();
  assert.equal(await writes('claude-code'), 'on', 'still let in after the restart');
  const again = await agent('connect', {}, 'claude-code');
  assert.equal(again.status, 'already-open', 'and it is not asked again');
  const write = await agent('edit', {reason: WHY, field: 'title', text: 'remembered'}, 'claude-code');
  assert.notEqual(write.status, 423, JSON.stringify(write));
  assert.equal(await evaluate(`document.querySelector('.connect-mark > summary')?.textContent ?? ''`).then(t => t.includes('Claude Code')), true, 'the mark itself, not only what opens under it, names who is let in, as a person knows it');
  await personClicks('agent-connect');
  await sleep(250);
  const listed = await evaluate(`document.querySelector('#modal-root .connect-allowed')?.textContent ?? ''`);
  assert.match(listed, /Claude Code/, 'Help → Agent connection lists it the same way');
  assert.match(listed, /claude-code/, 'with the name it sent');
  await key('Escape', 'Escape', 27);
});

check('a different name is still asked, and cannot write meanwhile', async () => {
  assert.equal(await writes('astra'), 'off');
  const refused = await agent('edit', {reason: WHY, field: 'title', text: 'x'}, 'astra');
  assert.equal(refused.status, 423, JSON.stringify(refused));
  assert.match(refused.error, /writing is off for astra/);
  const asked = await agent('connect', {}, 'astra');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
});

check('no agent can answer for the person or change the list — not even an allowed one', async () => {
  for (const caller of ['astra', 'claude-code']) {
    for (const action of ['ask-allow', 'ask-decline', 'agent-connect-toggle', 'agent-disconnect', 'agent-forget']) {
      const refused = await agent('act', {action, data: {name: 'claude-code'}}, caller);
      assert.equal(refused.status, 403, `${caller} ${action}: ${JSON.stringify(refused)}`);
    }
    const clicked = await agent('click', {selector: '[data-action="ask-allow"]'}, caller);
    assert.equal(clicked.status, 403, `${caller} clicking Allow: ${JSON.stringify(clicked)}`);
  }
  // The gate judges `action`; `data` must not be able to swap in another one underneath it.
  for (const data of [{action: 'ask-allow'}, {Action: 'ask-allow'}, {action: 'agent-connect-toggle'}, {action: 'agent-disconnect'}]) {
    const r = await agent('act', {action: 'preview', data}, 'claude-code');
    assert.ok(r.error, `an act whose data names an action is refused: ${JSON.stringify(data)} → ${JSON.stringify(r)}`);
  }
  // And whatever reaches a door button without the person's own input — script in the page, a built
  // button, a programmatic click — is refused by the interface itself, like approving.
  await personClicks('agent-disconnect');
  await personClicks('ask-allow');
  await sleep(150);
  // A key is a write an allowed agent may send, but the dialog only answers to the person's own keyboard.
  for (const k of ['Enter', 'Escape']) await agent('key', {key: k}, 'claude-code');
  // Nor can it close the dialog, which would answer Not now for the person.
  for (const selector of ['#modal-root .modal-backdrop', '#modal-root [data-action="close-modal"]']) {
    const r = await agent('click', {selector}, 'claude-code');
    assert.equal(r.status, 409, `a click waits while the request is open: ${JSON.stringify(r)}`);
  }
  await sleep(200);
  assert.match(await dialog(), /astra/, 'the request is still waiting for the person');
  assert.equal(await writes('astra'), 'off', 'astra is still out');
  assert.equal(await writes('claude-code'), 'on', 'and claude-code is still in');
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('aphrodite-allowed-agents'))`), ['claude-code'], 'the remembered list did not move');
  await press('ask-decline');
  await sleep(200);
});

/* 0.3-P3-fix1: files out and in, links, and Edit in the app are the person's alone. An allowed agent reaching
   them through the screen (act, click) is refused before anything runs: no download, no picker, no page change. */
check('an allowed agent cannot send a page or the board as a file, open the file picker, or press Edit in the app', async () => {
  assert.equal(await writes('claude-code'), 'on', 'claude-code may write');
  if (await evaluate('document.querySelector("#app").dataset.screen') !== 'editor') { await personClicks('welcome-sample'); await waitFor(() => evaluate('document.querySelector("#app").dataset.screen === "editor"'), 'a board open'); }
  await sleep(5_200); // the person's last press holds the screen for a moment
  await evaluate(`(() => { if (window.__made) return true; window.__made = 0; const make = URL.createObjectURL; URL.createObjectURL = blob => { window.__made++; return make.call(URL, blob); }; return true; })()`);
  const rev = (await agent('changes', {limit: 1}, 'claude-code')).revision;
  const made = await agent('apply', {reason: WHY, base_revision: rev, ops: [{op: 'html_page', name: 'Only theirs', html: '<p>only theirs</p>'}]}, 'claude-code');
  assert.ok(made.ok, JSON.stringify(made).slice(0, 300));
  const page = made.created_pages[0].page_id;
  const state = async () => ({seq: (await agent('changes', {limit: 1, include_view: true}, 'claude-code')).seq, page: await evaluate('document.querySelector("#app").dataset.frame'), made: await evaluate('window.__made'), picker: await evaluate('!!document.querySelector("input[data-upload]")')});
  const before = await state();
  for (const [action, data] of [['page-view-edit', {id: page}], ['page-view-edit', {id: 'missing'}], ['download-page-html', {}], ['download-board-file', {}], ['import-project', {}], ['disk-reload', {}], ['update-relaunch', {}]]) {
    const r = await agent('act', {action, data}, 'claude-code');
    assert.equal(r.status, 403, `${action} ${JSON.stringify(data)}: ${JSON.stringify(r)}`);
    assert.match(r.error, /the person's to do/);
  }
  await personPresses('page-view', {id: page});
  await sleep(5_200);
  const clicked = await agent('click', {selector: '[data-action="page-view-edit"]'}, 'claude-code');
  assert.equal(clicked.status, 403, `clicking Edit in the app: ${JSON.stringify(clicked)}`);
  await sleep(300);
  assert.equal(await evaluate('document.querySelector("#app").dataset.pageView'), page, 'the page is still seen on its own');
  await personPresses('page-view-close');
  await sleep(300);
  const after = await state();
  assert.deepEqual({...after, seq: after.seq}, {...before, seq: before.seq + 0}, `nothing moved: ${JSON.stringify({before, after})}`);
});


/* 0.3-R ①: an approval is the person's. Nothing but their own approve, and their own undo or redo, gives a board an
   approval it did not have: a fingerprint the content no longer matches goes with the change that made it stale. */
const approval = () => evaluate(`document.querySelector('#app').dataset.approval`);
/** The person's own mouse on a button drawn on the screen (a trusted click), wherever it is. */
const pressOn = async selector => {
  const p = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('nothing matches ${selector}'); el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); if (!el.contains(hit)) throw new Error('${selector} is covered by ' + hit?.outerHTML.slice(0, 120)); return {x, y}; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1});
  await sleep(300);
};
/** The person's own ⌘Z or ⇧⌘Z, on the canvas. */
const personUndo = async (shift = false) => {
  await evaluate(`document.activeElement?.blur?.(), true`);
  await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'z', code: 'KeyZ', modifiers: 4 | (shift ? 8 : 0), windowsVirtualKeyCode: 90});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 4 | (shift ? 8 : 0), windowsVirtualKeyCode: 90});
  await sleep(300);
};
const brief = async () => (await agent('contract', {format: 'detailed'}, 'claude-code')).project.brief;
const setBrief = async text => {
  await sleep(5_200); // the person's last press holds the screen for a moment
  const r = await agent('apply', {reason: WHY, patch: [{op: 'set', on: 'project', field: 'brief', value: text}]}, 'claude-code');
  assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
  return r;
};
let originalBrief = '';

check('Codex route 1: an agent that puts the brief back after a change leaves the board a draft', async () => {
  assert.equal(await writes('claude-code'), 'on', 'claude-code may write');
  if (await evaluate('document.querySelector("#app").dataset.screen') !== 'editor') { await personClicks('welcome-sample'); await waitFor(() => evaluate('document.querySelector("#app").dataset.screen === "editor"'), 'a board open'); }
  originalBrief = await brief();
  await pressOn('.review-card [data-action="approve"]');
  assert.equal(await approval(), 'approved', 'the person approved with their own mouse');
  await setBrief('Changed by the agent');
  assert.equal(await approval(), 'draft');
  const {seq} = await agent('changes', {limit: 1}, 'claude-code');
  const changed = (await agent('changes', {since: seq - 1}, 'claude-code')).changes.at(-1);
  assert.match(changed.reason ?? '', /Approval cleared/, `the change that made it stale says it cleared the approval: ${JSON.stringify(changed).slice(0, 600)}`);
  assert.ok(changed.ops.some(op => op.field === 'approvedFingerprint'), 'and the clearing is in that change');
  await setBrief(originalBrief);
  assert.equal(await brief(), originalBrief, 'the content is back');
  assert.equal(await approval(), 'draft', 'and the board is a draft');
  assert.equal((await agent('contract', {}, 'claude-code')).project.approved, false);
});

check('Codex route 2: the person\'s own ⌘Z brings the approval back; an agent\'s undo or redo brings back content only', async () => {
  await pressOn('.review-card [data-action="approve"]');
  assert.equal(await approval(), 'approved');
  await setBrief('Changed once more');
  await personUndo();
  assert.equal(await brief(), originalBrief);
  assert.equal(await approval(), 'approved', 'their own undo is theirs to bring an approval back with');
  await setBrief('Changed by the agent again');
  const undone = await agent('act', {action: 'undo'}, 'claude-code');
  assert.ok(!undone.error, `an agent may take back an edit on an approved board: ${JSON.stringify(undone).slice(0, 200)}`);
  assert.equal(await brief(), originalBrief, 'the content came back');
  assert.equal(await approval(), 'draft', 'the approval did not');
  await agent('key', {key: 'z', meta: true, shift: true}, 'claude-code');
  await sleep(200);
  assert.equal(await brief(), 'Changed by the agent again', 'its redo');
  await agent('key', {key: 'z', meta: true}, 'claude-code');
  await sleep(200);
  assert.equal(await brief(), originalBrief);
  assert.equal(await approval(), 'draft', 'and its undo after the redo, content only');
});

check('the export window\'s Approve now approves only the board it showed (0.2.5 H2)', async () => {
  assert.equal(await approval(), 'draft');
  await personPresses('export');
  await sleep(300);
  await setBrief('Changed while the window was open');
  const drawn = () => evaluate(`document.querySelector('#modal-root [data-action="approve-export"]')?.dataset.shown ?? ''`);
  const stale = await drawn();
  await pressOn('#modal-root [data-action="approve-export"]');
  assert.equal(await approval(), 'draft', 'the board changed after the window drew it, so the press approves nothing');
  // The press is handled after a wait or two; on a busy machine 300 ms is not always enough for the window to be drawn
  // again, and a second press on the window still drawn over the old board is rightly refused (Fable's run, 9724b9f).
  await waitFor(async () => { const now = await drawn(); return now && now !== stale; }, 'the window drawn again over the board as it is');
  await pressOn('#modal-root [data-action="approve-export"]');
  await waitFor(async () => (await approval()) === 'approved', 'drawn again, the next press approves what is shown');
  await key('Escape', 'Escape', 27);
});

/* 0.3-R fix 1 #4: an edit in the inspector redraws the canvas alone; the card follows it, so the person's first press approves. */
check('right after the person edits a title, Approve direction approves with one press', async () => {
  for (let i = 0; i < 3 && await evaluate('document.querySelector("#modal-root").children.length'); i++) { await evaluate('document.querySelector("#modal-root [data-action=close-modal]")?.click(), true'); await sleep(300); }
  assert.equal(await evaluate('document.querySelector("#modal-root").children.length'), 0, 'no dialog is open');
  const id = await evaluate(`document.querySelector('.space-frame.active [data-block-id]').dataset.blockId`);
  await personPresses('select', {id}); await sleep(400);
  assert.equal(await evaluate(`(() => { const t = document.querySelector('[data-field="title"]'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return document.activeElement === t; })()`), true);
  await send('Input.insertText', {text: ' edited'});
  await evaluate('document.activeElement.blur(), true');
  await sleep(300);
  assert.equal(await approval(), 'draft');
  await pressOn('.review-card [data-action="approve"]');
  assert.equal(await approval(), 'approved', 'one press');
});

check('off the editor no board is open: a rename on Home stays, and nothing an agent does writes the copy left in memory back', async () => {
  assert.equal(await approval(), 'approved');
  const contract = await agent('contract', {}, 'claude-code');
  const id = contract.project.project_id, name = contract.project.name;
  const page = contract.pages[0].page_id;
  const stored = () => evaluate(`(() => { const e = JSON.parse(localStorage.getItem('aphrodite-project-library-v1')).entries.find(e => e.project.id === ${JSON.stringify(id)}); return e && {name: e.project.name, approved: e.project.approvedFingerprint ?? null, last: e.project.ledger?.changes.at(-1) ?? null}; })()`);
  await sleep(5_200);
  const refused = await agent('act', {action: 'hub-delete-confirm', data: {id}}, 'claude-code');
  assert.equal(refused.status, 409, `Home's delete is not run from the editor: ${JSON.stringify(refused)}`);
  // 0.3-R fix 1 #5: nor Home's open, which would switch boards under the person.
  assert.equal((await agent('act', {action: 'hub-open', data: {id}}, 'claude-code')).status, 409, 'Home\'s open is not run from the editor');
  assert.ok(await stored(), 'the board is still in the library');
  await personPresses('home');
  await waitFor(() => evaluate('document.querySelector("#app").dataset.screen === "home"'), 'Home');
  await personPresses('hub-rename', {id});
  await sleep(250);
  assert.equal(await personSubmits('#hub-rename-form', {name: 'Renamed on Home'}), true);
  await sleep(400);
  let entry = await stored();
  assert.equal(entry.name, 'Renamed on Home');
  assert.equal(entry.approved, null, 'renamed, it is a draft');
  assert.equal(entry.last.source, 'home:rename', 'and the rename is in that board\'s ledger');
  assert.match(entry.last.reason, /Approval cleared/);
  await sleep(5_200);
  for (const [kind, payload] of [['act', {action: 'page', data: {id: page}}], ['act', {action: 'export'}], ['command', {query: 'undo'}], ['apply', {reason: WHY, ops: [{op: 'frame', preset: 'mobile'}]}]]) {
    const r = await agent(kind, payload, 'claude-code');
    assert.ok(r.error, `${kind} ${JSON.stringify(payload)} on Home reaches no board: ${JSON.stringify(r).slice(0, 200)}`);
  }
  await sleep(300);
  assert.equal(await evaluate('document.querySelector("#modal-root").children.length'), 0, 'no window of the board was opened on Home');
  entry = await stored();
  assert.deepEqual([entry.name, entry.approved], ['Renamed on Home', null], 'the library holds what the person did');
  await personPresses('hub-rename', {id});
  await sleep(250);
  assert.equal(await personSubmits('#hub-rename-form', {name}), true);
  await sleep(400);
  assert.equal((await stored()).approved, null, 'the name put back brings no approval back');
  await personPresses('hub-open', {id});
  await waitFor(() => evaluate('document.querySelector("#app").dataset.screen === "editor"'), 'the board open again');
  assert.equal(await approval(), 'draft');
});

check('disconnecting forgets the name, and the next request asks again', async () => {
  await personPresses('agent-disconnect');
  await sleep(200);
  assert.equal(await evaluate(`localStorage.getItem('aphrodite-allowed-agents')`), null, 'nothing is remembered');
  await restart();
  assert.equal(await writes('claude-code'), 'off');
  const asked = await agent('connect', {}, 'claude-code');
  assert.equal(asked.status, 'asked', JSON.stringify(asked));
});

check('the person can disconnect one agent and keep another', async () => {
  await press('ask-allow');
  await sleep(150);
  await agent('connect', {}, 'astra');
  await sleep(150);
  await press('ask-allow');
  await sleep(150);
  assert.equal(await writes('astra'), 'on');
  await personPresses('agent-forget', {name: 'astra'});
  await sleep(150);
  assert.equal(await writes('astra'), 'off', 'astra is out');
  assert.equal(await writes('claude-code'), 'on', 'claude-code stays');
  await personPresses('agent-disconnect');
});


await runChecks(checks, close);
