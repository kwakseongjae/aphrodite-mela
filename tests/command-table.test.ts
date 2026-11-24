import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personOnlyRow,commands,grades,surfaceNames,commandById,gradeOfKind,kindsOfGrade,loopbackRoutes,mcpTools,type Row} from '../src/agent/commands.mjs';
import {tools,toolByName} from '../mcp/aphrodite-mcp/tools.mjs';
import {parseAgentCommand} from '../src/agent/bridge';
import {judge,gateFor,isRead,isWrite,isAsk,readKinds,askKinds,writeKinds,HUMAN_ONLY_KIND,DOOR_KIND,type Authority} from '../src/agent/authority';

/**
 * 0.3-2: one command = one row of src/agent/commands.mjs. These tests hold the table to its own rules
 * and hold every generated list to the table, so a command cannot be added, renamed or regraded in
 * one place and quietly left behind in another.
 */
const NOW=1_700_000_000_000;
const agentRs=readFileSync(new URL('../src-tauri/src/agent.rs',import.meta.url),'utf8');

test('every row is well formed',()=>{
  const ids=commands.map(r=>r.id);
  assert.equal(new Set(ids).size,ids.length,'ids are unique');
  for(const row of commands){
    assert.match(row.id,/^(read|edit|outside|choose|human|chrome|screen)\.[a-z][a-z-]*$/,`${row.id} is named <family>.<name>`);
    assert.ok(row.label.en.trim()&&row.label.ko.trim(),`${row.id} has an English and a Korean label`);
    assert.ok(grades.includes(row.grade),`${row.id} has a known grade`);
    assert.ok(['required','optional','none'].includes(row.reason),row.id);
    assert.ok(['checked','none'].includes(row.revision),row.id);
    assert.ok(['transport','person-only'].includes(row.author),row.id);
    assert.equal(row.input?.type,'object',`${row.id} takes an object`);
    assert.deepEqual(Object.keys(row.surfaces).sort(),[...surfaceNames].sort(),`${row.id} says yes or no for every surface`);
    assert.ok(Object.values(row.surfaces).some(Boolean),`${row.id} is reachable somewhere`);
    assert.equal(commandById[row.id],row);
  }
});

test('only an edit (and approving) writes to the ledger, and every edit that is not a screen verb names its source',()=>{
  for(const row of commands){
    // Approving writes the approval into the project: a change in the ledger, the person's alone.
    if(row.grade==='edit'&&!row.resolves||row.id==='human.approve'){
      assert.ok(row.ledger&&row.ledger.sources.length>0,`${row.id} is an edit and names the ledger source it writes`);
      for(const s of row.ledger.sources)assert.match(s,/^[a-z]+(:[a-z-]+)?$/,`${row.id} source ${s}`);
    }else{
      assert.equal(row.ledger,null,`${row.id} is ${row.resolves?'a screen verb: the row it reaches writes':'not an edit'}, so it writes no ledger source of its own`);
    }
    if(row.reason!=='none'||row.revision!=='none')assert.equal(row.grade,'edit',`${row.id}: reasons and revisions belong to edits`);
  }
});

/* 0.3-2b: an edit an agent makes by name says why and what it read; a screen verb may say why. */
test('every edit an agent makes by name needs a reason and checks the revision; act and command may carry a reason',()=>{
  for(const row of commands.filter(r=>r.grade==='edit'&&r.route&&!r.resolves)){
    assert.equal(row.reason,'required',`${row.id} needs a reason`);
    assert.equal(row.revision,'checked',`${row.id} checks the revision`);
    assert.ok((row.input.required as string[]|undefined)?.includes('reason'),`${row.id}'s schema says the reason is required`);
    assert.ok((row.input.properties as Record<string,unknown>).base_revision,`${row.id}'s schema takes base_revision`);
    assert.equal(row.ledger!.sources.filter(s=>s.startsWith('agent:')).length,1,`${row.id} names the one source an agent's call writes`);
  }
  for(const id of ['screen.act','screen.command','screen.ui']){
    assert.equal(commandById[id].reason,'optional',id);
    assert.ok((commandById[id].input.properties as Record<string,unknown>).reason,`${id}'s schema takes a reason`);
  }
  for(const id of ['screen.click','screen.type','screen.key'])assert.equal(commandById[id].reason,'none',id);
  for(const row of commands)for(const s of row.ledger?.sources??[])
    if(s.startsWith('agent:'))assert.ok(row.route&&!row.resolves,`${row.id}: only a row an agent reaches by name writes ${s}`);
});

test('what only the person may do is reachable only from the screen, by the person',()=>{
  const human=commands.filter(r=>r.grade==='human');
  assert.ok(human.length>=2);
  for(const row of human){
    assert.deepEqual(row.surfaces,{ui:true,mcp:false,loopback:false,inApp:false},`${row.id} is on no agent surface`);
    assert.equal(row.author,'person-only');
    assert.equal(row.route,undefined,`${row.id} has no route`);
    assert.equal(row.mcp,undefined,`${row.id} has no tool`);
  }
  assert.equal(gradeOfKind(HUMAN_ONLY_KIND),'human','approving is a human row');
  assert.equal(gradeOfKind(DOOR_KIND),'human','answering for the door is a human row');
  for(const name of ['approve','approve-export'])assert.ok(commandById['human.approve'].controls.some(c=>c.kind==='action'&&c.name===name),name);
  for(const name of ['ask-allow','ask-decline','agent-connect-toggle','agent-disconnect','agent-forget'])assert.ok(commandById['human.door'].controls.some(c=>c.kind==='action'&&c.name===name),name);
});

test('the interface around the design is offered to no agent surface',()=>{
  for(const row of commands.filter(r=>r.grade==='chrome')){
    assert.deepEqual(row.surfaces,{ui:true,mcp:false,loopback:false,inApp:false},row.id);
    assert.equal(row.author,'person-only');
  }
  // 0.3-P3-fix1: besides approving, the door and the chrome, three rows are the person's alone: files out and in (with links), and Edit in the app.
  // 0.3-R fix 1 and fix 2: and reloading the saved copy from disk or restarting the app, either of which can put an approved board back over a draft.
  assert.deepEqual(commands.filter(r=>r.author==='person-only'&&!['human','chrome'].includes(r.grade)).map(r=>r.id).sort(),['edit.page-view-edit','outside.disk-reload','outside.export-page','outside.import','outside.relaunch']);
});

test('a screen action only the person does is found by its name, and the chrome an agent may still act is not',()=>{
  for(const [action,row] of [['page-view-edit','edit.page-view-edit'],['download-page-html','outside.export-page'],['download-board-file','outside.export-page'],['import-project','outside.import'],[' Import-Project ','outside.import']])assert.equal(personOnlyRow(action),row,action);
  for(const action of ['zoom-fit','page-view','export','download-bundle','page',undefined,42])assert.equal(personOnlyRow(action),undefined,String(action));
  for(const row of ['edit.page-view-edit','outside.export-page','outside.import'])assert.deepEqual(commandById[row].surfaces,{ui:true,mcp:false,loopback:false,inApp:false},row);
});

test('a route, a tool and a surface flag say the same thing',()=>{
  for(const row of commands){
    assert.equal(!!row.route,row.surfaces.loopback,`${row.id}: a loopback row has a route and only it does`);
    assert.equal(!!row.mcp,row.surfaces.mcp,`${row.id}: an MCP row has a tool block and only it does`);
    if(row.mcp)assert.ok(row.surfaces.loopback,`${row.id}: every tool is a route onto the loopback channel`);
    if(row.route)assert.ok(row.kind,`${row.id}: a routed row names the kind the gate judges it as`);
    if(row.surfaces.inApp)assert.ok(row.mcp,`${row.id}: the in-app agent is offered MCP tools, so an in-app row is one`);
  }
});

/* The panel's agent (feat/chatgpt-in-app, src/ai/tools.ts) is offered the MCP tools minus its
   PANEL_EXCLUDED set: asking for the door, driving the interface, and changing the archive or deleting
   a picture are the person's to do. That set is this column now; nothing on main reads it yet. */
test('the in-app agent is offered every tool but the five the panel leaves out',()=>{
  const offered=commands.filter(r=>r.surfaces.inApp).map(r=>r.mcp!.name).sort();
  const left=commands.filter(r=>r.surfaces.mcp&&!r.surfaces.inApp).map(r=>r.mcp!.name).sort();
  assert.deepEqual(left,['aphrodite_delete_image','aphrodite_forget_reference','aphrodite_keep_reference','aphrodite_request_connection','aphrodite_use_interface']);
  assert.equal(offered.length,15);
  for(const row of commands.filter(r=>r.surfaces.inApp))assert.notEqual(row.grade,'human');
});

test('rows that share a gate kind agree on its grade',()=>{
  const byKind=new Map<string,string>();
  for(const row of commands.filter(r=>r.kind)){
    const seen=byKind.get(row.kind!);
    if(seen)assert.equal(row.grade,seen,`${row.id} grades "${row.kind}" differently from another row`);
    byKind.set(row.kind!,row.grade);
  }
});

test('every route parses, and the gate judges what it parses to as the row says',()=>{
  for(const row of commands.filter(r=>r.route)){
    const routeKind=row.route!.path.split('/').pop()!;
    const parsed=parseAgentCommand(routeKind,row.example);
    assert.ok('command' in parsed,`${row.id}: its example does not parse as ${routeKind}: ${'error' in parsed?parsed.error:''}`);
    if('command' in parsed)assert.equal(gateFor(parsed.command),row.kind,`${row.id} is judged as "${row.kind}"`);
  }
});

test('each grade meets the permission rule the way the grade says, with nobody at the door',()=>{
  const closed:Authority={mode:'design',holder:null,now:NOW};
  for(const row of commands.filter(r=>r.kind&&r.kind!=='end')){
    const v=judge(row.kind!,'claude-code',closed);
    if(row.grade==='read'||row.grade==='choose')assert.equal(v.allow,true,`${row.id} is allowed with the door closed`);
    else if(row.grade==='edit'||row.grade==='outside')assert.deepEqual([v.allow,!v.allow&&v.status],[false,423],`${row.id} waits for the door`);
    else if(row.grade==='human')assert.deepEqual([v.allow,!v.allow&&v.status],[false,403],`${row.id} is refused outright`);
    else assert.fail(`${row.id}: a ${row.grade} row has no gate kind`);
  }
  assert.deepEqual(kindsOfGrade('human').sort(),[DOOR_KIND,HUMAN_ONLY_KIND].sort());
});

test('the permission rule reads its kinds from the table’s grades, not from lists of its own',()=>{
  const same=(a:readonly string[],b:readonly string[])=>assert.deepEqual([...a].sort(),[...b].sort());
  same(readKinds,kindsOfGrade('read').filter(k=>k!=='end'));
  same(askKinds,kindsOfGrade('choose'));
  same(writeKinds,kindsOfGrade('edit','outside'));
  for(const row of commands.filter(r=>r.kind&&r.kind!=='end')){
    assert.equal(isRead(row.kind!),row.grade==='read',`${row.id} isRead`);
    assert.equal(isAsk(row.kind!),row.grade==='choose',`${row.id} isAsk`);
    assert.equal(isWrite(row.kind!),row.grade==='edit'||row.grade==='outside',`${row.id} isWrite`);
  }
  const source=readFileSync(new URL('../src/agent/authority.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/Kinds = \[/,'no hand-kept kind list is left to drift from the table');
});

test('the MCP tool list is the table’s projection, in the order a client is shown it',()=>{
  assert.deepEqual(tools,mcpTools());
  for(const tool of tools)assert.equal(toolByName[tool.name],tool);
  const orders=commands.filter(r=>r.mcp).map(r=>r.mcp!.order).sort((a,b)=>a-b);
  assert.deepEqual(orders,orders.map((_,i)=>i),'tool positions are 0..n-1, each once');
  const rowOf=(name:string)=>commands.find(r=>r.mcp?.name===name)!;
  for(const tool of tools){
    const row=rowOf(tool.name);
    assert.equal(tool.inputSchema,row.input,`${tool.name} takes the row's own schema`);
    assert.equal(tool.annotations.readOnlyHint,row.grade==='read',`${tool.name} is read-only exactly when its row is a read`);
  }
});

test('the bridge advertises exactly the table’s loopback routes, in the same order',()=>{
  const block=agentRs.slice(agentRs.indexOf('pub const ROUTES'),agentRs.indexOf('];',agentRs.indexOf('pub const ROUTES')));
  const routes=[...block.matchAll(/"((?:GET|POST) \/agent\/[a-z]+)"/g)].map(m=>m[1]);
  assert.deepEqual(routes,loopbackRoutes());
});

/** Row type is exported for the generated projections; keep it honest about optional parts. */
const _row:Row=commands[0];void _row;

test('an MCP tool hands the app the reason and the revision its row asks for',()=>{
  // The gate drives every surface through window.aphroditeAgent, past this body: the tool's own projection is held here.
  assert.ok(commands.some(r=>r.mcp&&r.reason==='required'),'some tool needs a reason');
  for(const row of commands.filter(r=>r.mcp&&r.reason!=='none')){
    const tool=toolByName[row.mcp!.name] as {name:string;body?:(args:Record<string,unknown>)=>Record<string,unknown>};
    assert.ok(tool.body,`${tool.name} sends a body`);
    const body=tool.body({...(row.example??{}),reason:'Why',base_revision:'1:a:b'});
    assert.equal(body.reason,'Why',`${tool.name} passes the reason on`);
    if(row.revision==='checked')assert.equal(body.base_revision,'1:a:b',`${tool.name} passes base_revision on`);
  }
});
