import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — the MCP server is plain ESM, deliberately dependency-free
import {prompts,promptManifest,promptByName} from '../mcp/aphrodite-mcp/prompts.mjs';
// @ts-expect-error — same
import {tools} from '../mcp/aphrodite-mcp/tools.mjs';

type Prompt={name:string;title:string;description:string;arguments:{name:string;required:boolean}[];build:(a?:Record<string,string>)=>{role:string;content:{type:string;text:string}}[]};
const all=prompts as Prompt[];
const body=(p:Prompt,args?:Record<string,string>)=>p.build(args)[0].content.text;

test('a prompt is named for what a person wants, and says what it does',()=>{
  for(const p of all){
    assert.match(p.name,/^[a-z][a-z-]{1,20}$/,`${p.name} has to work as a slash command`);
    assert.ok(p.title&&p.description,`${p.name} needs a title and a description`);
    assert.ok(p.description.length<110,`${p.name}'s description is a menu line, not a paragraph`);
  }
  assert.equal(new Set(all.map(p=>p.name)).size,all.length,'two prompts share a name');
});

/** A prompt that names a tool that does not exist sends the agent looking for it. */
test('every tool a prompt names actually exists',()=>{
  const known=new Set((tools as {name:string}[]).map(t=>t.name));
  for(const p of all){
    for(const named of body(p).match(/aphrodite_[a-z_]+/g)??[]){
      assert.ok(known.has(named),`${p.name} points at ${named}, which is not a tool`);
    }
  }
});

test('an argument is used when given, and its absence is handled rather than interpolated',()=>{
  for(const p of all){
    for(const arg of p.arguments){
      const withIt=body(p,{[arg.name]:'MARKER-VALUE'});
      assert.match(withIt,/MARKER-VALUE/,`${p.name} ignores its own ${arg.name}`);
      const without=body(p,{});
      assert.doesNotMatch(without,/undefined|\[object/,`${p.name} leaks a missing ${arg.name} into the text`);
      assert.ok(without.length>80,`${p.name} still has to say something without ${arg.name}`);
    }
  }
});

/**
 * The two boundaries the whole product rests on. A prompt is the one place a person hands the agent
 * a whole workflow at once, which is exactly where "and then it approved it for me" would happen.
 */
test('no prompt asks for approval, and the one that could says who approves',()=>{
  for(const p of all){
    assert.doesNotMatch(body(p),/\bapprove the\b|\bapprove it\b(?!.*my click)/i,`${p.name} must not ask for approval`);
  }
  assert.match(body(promptByName.shape as Prompt),/my click/,'shape says whose decision it is');
  assert.match(body(promptByName.handoff as Prompt),/approved: false|DRAFT|draft/,'handoff has to be honest about a draft');
});

test('the manifest carries no plumbing a client should not see',()=>{
  for(const entry of promptManifest() as Record<string,unknown>[]){
    assert.ok(!('build' in entry),'the build function is not part of the protocol');
    assert.deepEqual(Object.keys(entry).sort(),['arguments','description','name','title']);
  }
});

/* The guard above only means something if it fails on a wrong name. */
test('the tool-name guard bites',()=>{
  const known=new Set((tools as {name:string}[]).map(t=>t.name));
  assert.ok(!known.has('aphrodite_approve_direction'),'there is no such tool, and there must not be');
  assert.throws(()=>{
    const pretend='Use `aphrodite_approve_direction` to finish.';
    for(const named of pretend.match(/aphrodite_[a-z_]+/g)??[]) assert.ok(known.has(named),named);
  });
});
