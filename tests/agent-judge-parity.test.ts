import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  judge,leaseHeld,mayWrite,normalizeCaller,HUMAN,HUMAN_IDLE_MS,LEASE_IDLE_MS,HUMAN_ONLY_KIND,HUMAN_ONLY_ERROR,DOOR_KIND,DOOR_ERROR,ANYONE,
  type Authority,type Mode,type Verdict,
} from '../src/agent/authority';

/**
 * 0.3-2 step 1 moves the permission rule from three hard-coded kind lists onto the command table's
 * grades. Nothing an agent meets may change: this is the rule exactly as 0.3-1b shipped it, copied
 * line for line, and every verdict the new one gives is held against it — every kind the gate can be
 * asked about, in every mode, with every kind of holder, every allowed list and every sort of caller.
 */
const readKindsBefore=['state','contract','tokens','components','images','render','references','taste','changes'];
const askKindsBefore=['guide','connect'];
const writeKindsBefore=['apply','system','export','edit','act','click','type','key','command','library','ui','keep','unkeep'];
const isReadBefore=(kind:string)=>readKindsBefore.includes(kind);
const isAskBefore=(kind:string)=>askKindsBefore.includes(kind);
const isWriteBefore=(kind:string)=>writeKindsBefore.includes(kind);

function judgeBefore(kind:string,caller:string,a:Authority):Verdict{
  if(kind===HUMAN_ONLY_KIND)return {allow:false,status:403,error:HUMAN_ONLY_ERROR};
  if(kind===DOOR_KIND)return {allow:false,status:403,error:DOOR_ERROR};
  if(isReadBefore(kind)||isAskBefore(kind))return {allow:true,hold:a.holder};
  if(kind==='end'){
    return a.mode==='design'
      ?{allow:false,status:409,error:'nothing to end: Agent mode is not running.'}
      :{allow:true,hold:null};
  }
  if(!isWriteBefore(kind))return {allow:false,status:403,error:`unknown command kind "${kind}".`};
  if(a.mode==='delegated')return {allow:true,hold:a.holder};
  if(a.mode==='design'){
    return {
      allow:false,
      status:423,
      error:'writing is off. Ask the person to turn on Connected mode — the switch in the home top row, or Help → Agent connection with a project open — or to start Agent mode to hand the screen over. Reading works without either.',
    };
  }
  const who=normalizeCaller(caller);
  if(!mayWrite(who,a.allowed)){
    return {
      allow:false,
      status:423,
      error:`writing is off for ${who}: the person has let other agents in, not this one. Call aphrodite_request_connection once and let them answer. Reading works without it.`,
    };
  }
  const held=leaseHeld(a);
  if(!held||held.label===who)return {allow:true,hold:{label:who,since:a.now}};
  if(held.label===HUMAN){
    return {allow:false,status:409,error:'the person is using the screen right now. Wait a few seconds and try again.'};
  }
  return {allow:false,status:409,error:`the screen is held by ${held.label}. Wait for it to finish, or ask the person to hand it over.`};
}

const NOW=1_700_000_000_000;
/** Every route's kind, the gate's own names for a library list and for the two refusals, and kinds that do not exist. */
const kinds=[
  'state','contract','changes','tokens','render','guide','connect','ui','components','apply','act','click','type','key','command',
  'edit','library','references','taste','keep','unkeep','system','export','end',
  'images',HUMAN_ONLY_KIND,DOOR_KIND,
  'approve-export','approve-human-only','agent-connect-toggle','Apply','screenshot','choose-system','','unknown',
];
const modes:Mode[]=['design','connected','delegated'];
const holders=[
  null,
  {label:'claude-code',since:NOW},
  {label:'astra',since:NOW},
  {label:'astra',since:NOW-LEASE_IDLE_MS-1},
  {label:HUMAN,since:NOW},
  {label:HUMAN,since:NOW-HUMAN_IDLE_MS-1},
];
const alloweds:(readonly string[]|undefined)[]=[undefined,[],[ANYONE],['claude-code'],['astra'],['claude-code','astra']];
const callers=['claude-code','astra','','human','Claude Code!',' -x- '];

test('the grade-driven rule gives every verdict the kind lists gave, word for word',()=>{
  let compared=0;
  for(const kind of kinds)for(const mode of modes)for(const holder of holders)for(const allowed of alloweds)for(const caller of callers){
    const a:Authority={mode,holder,now:NOW,...(allowed?{allowed}:{})};
    assert.deepEqual(judge(kind,caller,a),judgeBefore(kind,caller,a),`${JSON.stringify(kind)} by ${JSON.stringify(caller)} in ${mode}, holder ${holder?.label??'none'}@${holder?NOW-holder.since:'-'}, allowed ${JSON.stringify(allowed)}`);
    compared++;
  }
  assert.equal(compared,kinds.length*modes.length*holders.length*alloweds.length*callers.length);
});

test('approving and answering for the door stay refused with their own words, in every mode',()=>{
  for(const mode of modes)for(const holder of holders){
    const a:Authority={mode,holder,now:NOW,allowed:[ANYONE]};
    assert.deepEqual(judge(HUMAN_ONLY_KIND,'claude-code',a),{allow:false,status:403,error:HUMAN_ONLY_ERROR});
    assert.deepEqual(judge(DOOR_KIND,'claude-code',a),{allow:false,status:403,error:DOOR_ERROR});
  }
});
