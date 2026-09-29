/**
 * P0 regression: approving a direction is the person's decision, and no agent command may make it.
 *
 * The MCP server tells every client "Approving a direction is the person's decision and no tool here can
 * do it", and `aphrodite_use_interface` adds "no combination of actions here can approve a direction".
 * Before 0.2.8 three doors disproved that: `act` with an approve* action, `click` on an approve button,
 * and the MCP interface tool routing either of those through `/agent/ui`.
 *
 * main.ts cannot be imported under `tsx --test` (it paints the DOM at load), so these tests drive the
 * pure pieces main.ts calls — the parser, the gate, the delegation lock — the way runAgentCommand and
 * action() wire them, and a few source checks pin that wiring in place. Symbols added by the fix are
 * loaded with a dynamic import so that, before it, each test fails on its own assertion.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAgentCommand,type AgentCommand} from '../src/agent/bridge';
import {judge,gateFor,type Authority,type Verdict} from '../src/agent/authority';
import {startDelegation,isBlockedWhileDelegated} from '../src/agent/delegation';
import {initialProject} from '../src/model';
import {tools} from '../mcp/aphrodite-mcp/tools.mjs';

const NOW=1_700_000_000_000;
const AGENT='claude-code';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const bridgeRs=readFileSync(new URL('../src-tauri/src/agent.rs',import.meta.url),'utf8');

/* Every authority state in which an agent may write at all. Design mode already refuses every write
   with 423, so it would prove nothing here. */
const states:[string,Authority][]=[
  ['Connected, the agent holds the lease',{mode:'connected',holder:{label:AGENT,since:NOW},now:NOW}],
  ['Connected, the lease is free',{mode:'connected',holder:null,now:NOW}],
  ['Agent mode (delegated)',{mode:'delegated',holder:{label:AGENT,since:NOW},now:NOW}],
];

/* The screen main.ts resolves a click against: selector -> data-action of the nearest [data-action]
   ancestor-or-self, which is what the document click handler runs. */
const screen:Record<string,string>={
  '[data-action=approve-export]':'approve-export',
  '[data-action="approve-export"]':'approve-export',
  '.export-status button':'approve-export',
  '.review-card button':'approve',
  '.review-card .approve-button span':'approve',
  '[data-action=add-section]':'add-section',
};
type Look={click:(selector:string)=>string|undefined;palette:(query:string)=>string|undefined};
const look:Look={click:selector=>screen[selector],palette:query=>/export/i.test(query)?'export':undefined};

type Reach=(c:AgentCommand,l:Look)=>string|undefined;
/** runAgentCommand's gate: judge what the command would run, not only the verb it arrived as. */
async function gate(kind:string,payload:unknown,a:Authority,l:Look=look):Promise<Verdict>{
  const parsed=parseAgentCommand(kind,payload);
  if('error' in parsed)throw new Error(`${kind} ${JSON.stringify(payload)} should parse: ${parsed.error}`);
  const bridge=await import('../src/agent/bridge') as Record<string,unknown>;
  const reaches=typeof bridge.reachedAction==='function'?(bridge.reachedAction as Reach)(parsed.command,l):undefined;
  return judge((gateFor as (c:AgentCommand,reaches?:string)=>string)(parsed.command,reaches),AGENT,a);
}

/* Path 3 is built from the MCP tool's own body, so the payload is the one a client really sends. */
const useInterface=tools.find(t=>t.name==='aphrodite_use_interface')!;
const viaMcp=(args:Record<string,unknown>)=>(useInterface as unknown as {body:(a:Record<string,unknown>)=>unknown}).body(args);

const approvals:[string,string,unknown][]=[
  ['path 1: act approve-export (POST /agent/act)','act',{action:'approve-export'}],
  ['path 1: act approve-human-only (POST /agent/act)','act',{action:'approve-human-only'}],
  ['path 1: act approve (POST /agent/act)','act',{action:'approve'}],
  ['path 2: click [data-action=approve-export] (POST /agent/click)','click',{selector:'[data-action=approve-export]'}],
  ['path 2: click the Approve direction button (POST /agent/click)','click',{selector:'.review-card button'}],
  ['path 2: click the label inside Approve direction (POST /agent/click)','click',{selector:'.review-card .approve-button span'}],
  ['path 3: MCP aphrodite_use_interface click approve-export (POST /agent/ui)','ui',viaMcp({action:'click',selector:'[data-action="approve-export"]'})],
  ['path 3: MCP aphrodite_use_interface click Approve direction (POST /agent/ui)','ui',viaMcp({action:'click',selector:'.review-card button'})],
];
for(const [name,kind,payload] of approvals)for(const [where,a] of states){
  test(`${name} is refused — ${where}`,async()=>{
    const v=await gate(kind,payload,a);
    assert.equal(v.allow,false,`${name} was allowed in ${where}`);
    if(!v.allow){
      assert.equal(v.status,403);
      assert.match(v.error,/person's decision/);
    }
  });
}

test('a palette entry that approved would be refused too (none exists today)',async()=>{
  for(const [where,a] of states){
    const v=await gate('command',{query:'approve'},a,{...look,palette:()=>'approve'});
    assert.equal(v.allow,false,where);
  }
});

test('Agent mode locks every approve variant, not only the one the banner names',()=>{
  const d=startDelegation(initialProject(),{operator:'Codex',intent:'assemble'});
  for(const action of ['approve','approve-export','approve-human-only'])assert.equal(isBlockedWhileDelegated(d,action),true,action);
});

/* Nothing else may get caught in the net: an agent keeps every door it had. */
const ordinary:[string,string,unknown][]=[
  ['act add-section','act',{action:'add-section'}],
  ['act export (opens the dialog; approving there is still a click)','act',{action:'export'}],
  ['click a section button','click',{selector:'[data-action=add-section]'}],
  ['MCP command "Export"','ui',viaMcp({action:'command',query:'Export'})],
  ['MCP key shift+1','ui',viaMcp({action:'key',key:'1',shift:true})],
];
for(const [name,kind,payload] of ordinary)test(`${name} still works for an agent that may write`,async()=>{
  for(const [where,a] of states){
    const v=await gate(kind,payload,a);
    assert.equal(v.allow,true,`${name} was refused in ${where}`);
  }
});

type Blocked=(action:string|undefined,origin:{trusted:boolean;agentHoldsScreen:boolean})=>boolean;
async function loadBlocked():Promise<Blocked>{
  const m=await import('../src/agent/authority') as Record<string,unknown>;
  assert.equal(typeof m.humanOnlyBlocked,'function','authority.ts exports humanOnlyBlocked');
  return m.humanOnlyBlocked as Blocked;
}

test("the person's own click still approves, from the review card and from Export",async()=>{
  const blocked=await loadBlocked();
  for(const action of ['approve','approve-export'])assert.equal(blocked(action,{trusted:true,agentHoldsScreen:false}),false,action);
});

test('a synthetic click or a made-up button cannot approve (el.click(), actViaButton)',async()=>{
  const blocked=await loadBlocked();
  for(const action of ['approve','approve-export','approve-human-only'])assert.equal(blocked(action,{trusted:false,agentHoldsScreen:false}),true,action);
});

test('while Agent mode holds the screen, approving waits for the person to take control back',async()=>{
  const blocked=await loadBlocked();
  for(const action of ['approve','approve-export'])assert.equal(blocked(action,{trusted:true,agentHoldsScreen:true}),true,action);
});

test('ordinary actions never need a person',async()=>{
  const blocked=await loadBlocked();
  for(const action of ['add-section','export','download-bundle','proposal-accept','page','undo',undefined])
    assert.equal(blocked(action,{trusted:false,agentHoldsScreen:true}),false,String(action));
});

test('every approve variant is human-only, including ones not written yet',async()=>{
  const m=await import('../src/agent/authority') as Record<string,unknown>;
  assert.equal(typeof m.isHumanOnlyAction,'function','authority.ts exports isHumanOnlyAction');
  const isHumanOnly=m.isHumanOnlyAction as (a:unknown)=>boolean;
  for(const a of ['approve','approve-export','approve-human-only','approve-and-export','Approve-Export'])assert.equal(isHumanOnly(a),true,a);
  for(const a of ['export','add-section','proposal-accept','',undefined,null,42])assert.equal(isHumanOnly(a),false,String(a));
});

test('a click is judged by the control it lands in, not the element it names',async()=>{
  const m=await import('../src/agent/bridge') as Record<string,unknown>;
  assert.equal(typeof m.actionUnder,'function','bridge.ts exports actionUnder');
  const actionUnder=m.actionUnder as (el:unknown)=>string|undefined;
  const button={dataset:{action:'approve'},closest:(s:string)=>s==='[data-action]'?button:null};
  const label={dataset:{},closest:(s:string)=>s==='[data-action]'?button:null};
  const loose={dataset:{},closest:()=>null};
  assert.equal(actionUnder(label),'approve');
  assert.equal(actionUnder(button),'approve');
  assert.equal(actionUnder(loose),undefined);
  assert.equal(actionUnder(null),undefined);
});

/* Wiring in main.ts, which the tests above cannot load. */
test('runAgentCommand judges what a command reaches before anything runs',()=>{
  const start=main.indexOf('async function runAgentCommand');
  assert.ok(start>0);
  const head=main.slice(start,main.indexOf('switch(c.kind)',start));
  assert.match(head,/judge\(gateFor\(c,\s*reachedAction\(c,/,'the verdict is asked about the reached action');
});

test('the gate reads a click off the live screen the way the click handler does',()=>{
  assert.match(main,/const agentLook=\{\n\s*click:\(selector:string\)=>\{try\{return actionUnder\(document\.querySelector<HTMLElement>\(selector\)\);/);
  assert.match(main,/palette:\(query:string\)=>\{try\{return filterCommands\(commandTable\(paletteContext\(\)\),query,uiLanguage\)\[0\]\?\.action;/);
});

test('the click listener tells action() whether a person clicked',()=>{
  assert.match(main,/void action\(control,\s*e\.isTrusted\)/);
});

test('action() refuses a human-only action no person started',()=>{
  const start=main.indexOf('async function action(');
  assert.ok(start>0);
  assert.match(main.slice(start,start+1500),/humanOnlyBlocked\(/);
});

test('actViaButton never passes itself off as the person',()=>{
  const line=main.split('\n').find(l=>l.startsWith('async function actViaButton'));
  assert.ok(line);
  assert.match(line,/await action\(btn,\s*false\)/);
});

test('approvedFingerprint is written in exactly one place in main.ts',()=>{
  const sets=main.match(/approvedFingerprint\s*=(?!=)/g)??[];
  assert.equal(sets.length,1,`found ${sets.length} assignments; every approval must pass the one guarded case`);
});

test('the MCP interface tool and every bridge route funnel into runAgentCommand',()=>{
  assert.equal(useInterface.route.path,'/agent/ui');
  for(const [path,kind] of [['/agent/ui','ui'],['/agent/act','act'],['/agent/click','click'],['/agent/command','command']])
    assert.ok(bridgeRs.includes(`(Method::Post, "${path}") => "${kind}"`),`${path} -> ${kind}`);
  assert.match(main,/'agent:command',async ev=>\{const result=await runAgentCommand\(/);
  assert.match(main,/aphroditeAgent=\{run:\(kind:unknown,payload\?:unknown,caller\?:string\)=>runAgentCommand\(/);
});
