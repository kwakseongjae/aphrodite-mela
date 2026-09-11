import {test} from 'node:test';
import assert from 'node:assert/strict';
import {esc} from '../src/html';
import {
  DEFAULT_WORKSPACE_ID,MAX_WORKSPACES,WORKSPACE_COLORS,WORKSPACES_KEY,
  avatarContent,avatarStyle,createWorkspace,defaultBook,deleteWorkspace,
  readWorkspaces,renameWorkspace,sanitizeBook,setActiveWorkspace,setWorkspaceAvatar,
  validWorkspace,workspaceInitials,writeWorkspaces,type Workspace,type WorkspaceBook,
} from '../src/workspace/workspaces';

function memory(){const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};}
function ws(partial:Partial<Workspace>&Pick<Workspace,'id'|'name'>):Workspace{
  return {avatar:{kind:'color',value:'#123456'},createdAt:'2026-09-11T00:00:00.000Z',...partial};
}

test('default book is one Personal / 개인 workspace',()=>{
  const en=defaultBook('en'),ko=defaultBook('ko');
  assert.equal(en.version,1);assert.equal(en.workspaces.length,1);assert.equal(en.activeId,DEFAULT_WORKSPACE_ID);
  assert.equal(en.workspaces[0].id,DEFAULT_WORKSPACE_ID);assert.equal(en.workspaces[0].name,'Personal workspace');
  assert.deepEqual(en.workspaces[0].avatar,{kind:'color',value:'#3a4531'});
  assert.ok(Number.isFinite(Date.parse(en.workspaces[0].createdAt)));
  assert.equal(ko.workspaces[0].name,'개인 작업 공간');assert.equal(ko.activeId,DEFAULT_WORKSPACE_ID);
  assert.equal(WORKSPACE_COLORS.length,6);
});

test('sanitize drops junk, keeps good entries, and falls back',()=>{
  const good=ws({id:'studio',name:'Studio'});
  const book=sanitizeBook({version:1,activeId:'gone',workspaces:[
    good,{id:'bad'},null,'x',
    {id:'empty',name:'',avatar:{kind:'color',value:'#123456'},createdAt:'2026-09-11T00:00:00.000Z'},
    {id:'hex',name:'Hex',avatar:{kind:'color',value:'#fff'},createdAt:'2026-09-11T00:00:00.000Z'},
    {id:'ctrl',name:'Ctrl',avatar:{kind:'emoji',value:'a\nb'},createdAt:'2026-09-11T00:00:00.000Z'},
    {id:'long',name:'Long',avatar:{kind:'emoji',value:'👨‍👩‍👧'},createdAt:'2026-09-11T00:00:00.000Z'},
    {id:'ok2',name:'  Lab  ',avatar:{kind:'emoji',value:'🎨'},createdAt:'2026-09-11T00:00:00.000Z'},
    {id:'studio',name:'Duplicate',avatar:{kind:'color',value:'#abcdef'},createdAt:'2026-09-11T00:00:00.000Z'},
  ]},'en');
  assert.deepEqual(book.workspaces.map(w=>w.id),['studio','ok2']);
  assert.equal(book.workspaces[1].name,'Lab');
  assert.equal(book.activeId,'studio');
  const fallback=sanitizeBook({version:1,workspaces:[null,{id:1}]},'ko');
  assert.equal(fallback.workspaces[0].id,DEFAULT_WORKSPACE_ID);
  assert.equal(fallback.workspaces[0].name,'개인 작업 공간');
  assert.equal(sanitizeBook(undefined,'en').activeId,DEFAULT_WORKSPACE_ID);
  assert.equal(validWorkspace(good),true);
  assert.equal(validWorkspace({...good,avatar:{kind:'image',value:'https://x' as string}}),false);
});

test('create/rename/avatar/active/delete round-trip',()=>{
  let book=defaultBook('en');
  book=createWorkspace(book,'  Studio  ',{kind:'emoji',value:'🎨'});
  assert.equal(book.workspaces.length,2);
  assert.equal(book.workspaces[1].name,'Studio');
  assert.deepEqual(book.workspaces[1].avatar,{kind:'emoji',value:'🎨'});
  assert.equal(book.activeId,book.workspaces[1].id);
  const created=createWorkspace(defaultBook('en'),'Two');
  assert.deepEqual(created.workspaces[1].avatar,{kind:'color',value:WORKSPACE_COLORS[1]});
  const id=book.workspaces[1].id;
  book=renameWorkspace(book,id,'Lab');
  assert.equal(book.workspaces[1].name,'Lab');
  book=setWorkspaceAvatar(book,id,{kind:'color',value:'#abcdef'});
  assert.deepEqual(book.workspaces[1].avatar,{kind:'color',value:'#abcdef'});
  book=setActiveWorkspace(book,DEFAULT_WORKSPACE_ID);
  assert.equal(book.activeId,DEFAULT_WORKSPACE_ID);
  const snapshot=book;
  assert.equal(renameWorkspace(book,'missing','X'),book);
  assert.equal(setWorkspaceAvatar(book,'missing',{kind:'color',value:'#000000'}),book);
  assert.equal(setActiveWorkspace(book,'missing'),book);
  assert.equal(renameWorkspace(snapshot,'missing','X'),snapshot);
  const {book:next,movedTo}=deleteWorkspace(book,id);
  assert.equal(next.workspaces.length,1);
  assert.equal(movedTo,DEFAULT_WORKSPACE_ID);
  assert.equal(next.activeId,DEFAULT_WORKSPACE_ID);
});

test('delete refuses the last workspace and reports movedTo as previous sibling',()=>{
  const one=defaultBook('en');
  assert.throws(()=>deleteWorkspace(one,DEFAULT_WORKSPACE_ID),{message:'The last workspace stays'});
  let book=createWorkspace(createWorkspace(one,'A'),'B');
  const ids=book.workspaces.map(w=>w.id);
  const dropped=deleteWorkspace(book,ids[2]);
  assert.equal(dropped.movedTo,ids[1]);
  assert.equal(dropped.book.activeId,ids[1]);
  assert.deepEqual(dropped.book.workspaces.map(w=>w.id),[ids[0],ids[1]]);
  const middle=deleteWorkspace(book,ids[1]);
  assert.equal(middle.movedTo,ids[0]);
  assert.equal(middle.book.activeId,ids[2]);
});

test('workspace limit and empty names throw',()=>{
  let book=defaultBook('en');
  for(let i=1;i<MAX_WORKSPACES;i++)book=createWorkspace(book,`W${i}`);
  assert.equal(book.workspaces.length,MAX_WORKSPACES);
  assert.throws(()=>createWorkspace(book,'overflow'),{message:'Workspace limit'});
  assert.throws(()=>createWorkspace(defaultBook('en'),'  '),{message:'Workspace needs a name'});
  assert.throws(()=>createWorkspace(defaultBook('en'),''),{message:'Workspace needs a name'});
  assert.throws(()=>renameWorkspace(defaultBook('en'),DEFAULT_WORKSPACE_ID,'x'.repeat(61)),{message:'Workspace name is too long'});
  assert.throws(()=>setWorkspaceAvatar(defaultBook('en'),DEFAULT_WORKSPACE_ID,{kind:'color',value:'red'}));
});

test('initials take the first character of the first two words',()=>{
  assert.equal(workspaceInitials('Personal workspace'),'PW');
  assert.equal(workspaceInitials('개인 작업 공간'),'개작');
  assert.equal(workspaceInitials('Light'),'L');
  assert.equal(workspaceInitials('  hello   world  '),'HW');
});

test('avatar style and content escape values that would break out of HTML',()=>{
  const color=ws({id:'c',name:'<img src=x>',avatar:{kind:'color',value:'#a83c50'}});
  assert.equal(avatarStyle(color),`background:${esc('#a83c50')};color:#fff`);
  assert.equal(avatarContent(color),esc('<S'));
  const quoted=ws({id:'q',name:'"Hi there'});
  assert.equal(avatarContent(quoted),esc('"T'));
  const emoji=ws({id:'e',name:'Safe',avatar:{kind:'emoji',value:'<>'}});
  assert.equal(avatarStyle(emoji),'background:#f0efe8');
  assert.equal(avatarContent(emoji),esc('<>'));
  const jab=ws({id:'j',name:'Safe',avatar:{kind:'emoji',value:'x"'}});
  assert.doesNotMatch(avatarContent(jab),/"/);
  assert.match(avatarContent(jab),/&quot;/);
  const img='data:image/png;base64,AAAA';
  const image=ws({id:'i',name:'Safe',avatar:{kind:'image',value:img}});
  assert.equal(avatarStyle(image),`background-image:url(${esc(img)});background-size:cover`);
  assert.equal(avatarContent(image),'');
});

test('readWorkspaces never throws and write swallows quota errors',()=>{
  const s=memory();
  assert.equal(readWorkspaces(s,'en').activeId,DEFAULT_WORKSPACE_ID);
  s.setItem(WORKSPACES_KEY,'{nope');
  assert.equal(readWorkspaces(s,'ko').workspaces[0].name,'개인 작업 공간');
  const book=createWorkspace(defaultBook('en'),'Studio');
  writeWorkspaces(s,book);
  assert.equal(readWorkspaces(s,'en').workspaces[1].name,'Studio');
  const fail={setItem:()=>{throw new Error('quota');}};
  assert.doesNotThrow(()=>writeWorkspaces(fail,book as WorkspaceBook));
});
