/**
 * Agent channel. While Agent mode is on, humans are locked out of the UI (see the input gate in main.ts)
 * and the agent drives the app through commands: over the loopback HTTP bridge in the desktop app
 * (forwarded here as `agent:command` events) or through `window.aphroditeAgent` in a browser build.
 * Commands are executed as programmatic DOM events, which the gate lets through (they are not `isTrusted`).
 */
export type AgentCommand=
  |{kind:'state'}
  |{kind:'contract';format?:'concise'|'detailed';pageId?:string}
  |{kind:'tokens'}
  |{kind:'render';pageId?:string;width?:number;height?:number}
  |{kind:'guide'}
  |{kind:'connect'}
  |{kind:'ui';action:'command'|'click'|'type'|'key';payload:Record<string,unknown>}
  |{kind:'components'}
  |{kind:'apply';ops:unknown[];pageId?:string}
  |{kind:'act';action:string;data:Record<string,string>}
  |{kind:'click';selector:string}
  |{kind:'type';selector:string;text:string;submit?:boolean}
  |{kind:'key';key:string;code?:string;meta?:boolean;shift?:boolean;ctrl?:boolean;alt?:boolean}
  |{kind:'command';query:string}
  |{kind:'edit';field:EditableField;text:string;blockId?:string}
  |{kind:'library';action:LibraryAction;id?:string;name?:string;base64?:string;scope?:'project'|'global'}
  |{kind:'references'}
  |{kind:'taste'}
  |{kind:'keep';url?:string;title?:string;note?:string;tags?:string[];scope?:'project'|'global'}
  |{kind:'end'};

export const libraryActions=['list','delete','import'] as const;
export type LibraryAction=typeof libraryActions[number];

export const editableFields=['title','text','label','eyebrow','description'] as const;
export type EditableField=typeof editableFields[number];

const SAFE_SELECTOR=/^[\w\s.#\[\]="'\-:>(),*+~^$|]+$/;
const SAFE_ACTION=/^[a-z][a-z0-9-]{0,60}$/;

/** Validates a raw command (from HTTP or JS). Returns the typed command or a human-readable error. */
export function parseAgentCommand(kind:unknown,payload:unknown):{command:AgentCommand}|{error:string}{
  const p=(payload&&typeof payload==='object'?payload:{}) as Record<string,unknown>;
  const str=(v:unknown,max=4000)=>typeof v==='string'&&v.length<=max?v:undefined;
  switch(kind){
    case 'state':return {command:{kind:'state'}};
    case 'end':return {command:{kind:'end'}};
    case 'tokens':return {command:{kind:'tokens'}};
    case 'render':{
      const pageId=str(p.pageId,200);
      if(p.pageId!==undefined&&(!pageId||!/^[a-zA-Z0-9_-]{1,200}$/.test(pageId)))return {error:'render pageId must be a page id from the contract'};
      const raw=p.width===undefined?undefined:Number(p.width);
      if(raw!==undefined&&(!Number.isFinite(raw)||raw<240||raw>2000))return {error:'render width must be between 240 and 2000'};
      const tall=p.height===undefined?undefined:Number(p.height);
      if(tall!==undefined&&(!Number.isFinite(tall)||tall<320||tall>6000))return {error:'render height must be between 320 and 6000'};
      return {command:{kind:'render',...(pageId?{pageId}:{}),...(raw?{width:raw}:{}),...(tall?{height:tall}:{})}};
    }
    case 'guide':return {command:{kind:'guide'}};
    case 'connect':return {command:{kind:'connect'}};
    case 'ui':{
      // One door onto the interface for things the semantic tools do not cover. The individual verbs
      // are validated by their own parsers below, so nothing loosens by going through here.
      const action=str(p.action,10);
      if(action!=='command'&&action!=='click'&&action!=='type'&&action!=='key')return {error:'ui action must be one of command|click|type|key'};
      const inner=parseAgentCommand(action,p);
      if('error' in inner)return inner;
      return {command:{kind:'ui',action,payload:p}};
    }
    case 'components':return {command:{kind:'components'}};
    case 'contract':{
      const format=p.format===undefined||p.format==='concise'?'concise' as const:p.format==='detailed'?'detailed' as const:undefined;
      if(!format)return {error:'contract format must be "concise" or "detailed"'};
      const pageId=str(p.pageId,200);
      if(p.pageId!==undefined&&(!pageId||!/^[a-zA-Z0-9_-]{1,200}$/.test(pageId)))return {error:'contract pageId must be a page id from the contract'};
      return {command:{kind:'contract',format,...(pageId?{pageId}:{})}};
    }
    case 'apply':{
      // The ops themselves are validated by parseOps, which owns the vocabulary and its error text.
      if(!Array.isArray(p.ops))return {error:'apply needs "ops": [{"op":"add","component_kind":"hero"}]'};
      const pageId=str(p.page_id??p.pageId,200);
      return {command:{kind:'apply',ops:p.ops,...(pageId?{pageId}:{})}};
    }
    case 'act':{
      const action=str(p.action,80);
      if(!action||!SAFE_ACTION.test(action))return {error:'act needs "action" (kebab-case data-action name)'};
      const data:Record<string,string>={};
      if(p.data&&typeof p.data==='object')for(const [k,v] of Object.entries(p.data as Record<string,unknown>)){if(!/^[a-zA-Z][\w-]{0,40}$/.test(k))return {error:`bad data key "${k}"`};const s=str(v,2000);if(s===undefined)return {error:`data.${k} must be a string`};data[k]=s;}
      return {command:{kind:'act',action,data}};
    }
    case 'click':{
      const selector=str(p.selector,500);
      if(!selector||!SAFE_SELECTOR.test(selector))return {error:'click needs a CSS "selector"'};
      return {command:{kind:'click',selector}};
    }
    case 'type':{
      const selector=str(p.selector,500),text=str(p.text,20000);
      if(!selector||!SAFE_SELECTOR.test(selector))return {error:'type needs a CSS "selector"'};
      if(text===undefined)return {error:'type needs "text"'};
      return {command:{kind:'type',selector,text,submit:p.submit===true}};
    }
    case 'key':{
      const key=str(p.key,40);
      if(!key)return {error:'key needs "key" (e.g. "Escape", "k", "1")'};
      return {command:{kind:'key',key,code:str(p.code,40),meta:p.meta===true,shift:p.shift===true,ctrl:p.ctrl===true,alt:p.alt===true}};
    }
    case 'command':{
      const query=str(p.query,200);
      if(!query||!query.trim())return {error:'command needs "query" (palette search text)'};
      return {command:{kind:'command',query:query.trim()}};
    }
    case 'references': return {command:{kind:'references'}};
    case 'taste': return {command:{kind:'taste'}};
    /* Keeping what an agent found is a write: the archive is the person's, and something arriving in
       it without their say-so is exactly what the door is for. */
    case 'keep':{
      const url=str(p.url,2000)??'';
      const title=str(p.title,300)??'';
      const note=str(p.note,4000)??'';
      if(url&&!/^https?:\/\//i.test(url))return {error:'keep needs an http or https "url", or no url at all'};
      if(!url&&!title&&!note)return {error:'keep needs a "url", a "title" or a "note" — something to keep'};
      const rawTags=Array.isArray(p.tags)?p.tags:[];
      const tags=rawTags.filter((t):t is string=>typeof t==='string').map(t=>t.trim().slice(0,40)).filter(Boolean).slice(0,12);
      const scope=p.scope==='global'?'global' as const:'project' as const;
      return {command:{kind:'keep',url,title,note,tags,scope}};
    }
    case 'library':{
      const action=(str(p.action,10)??'list') as LibraryAction;
      if(!libraryActions.includes(action))return {error:`library action must be one of ${libraryActions.join('|')}`};
      const scope=p.scope==='project'?'project' as const:p.scope===undefined||p.scope==='global'?'global' as const:undefined;
      if(!scope)return {error:'library scope must be "project" or "global"'};
      if(action==='delete'){
        const id=str(p.id,64);
        if(!id||!/^[0-9a-f]{16}$/.test(id))return {error:'delete needs the 16-character image "id"'};
        return {command:{kind:'library',action,id,scope}};
      }
      if(action==='import'){
        const name=str(p.name,120),base64=str(p.base64,20_000_000);
        if(!name)return {error:'import needs a "name"'};
        if(!base64||!/^[A-Za-z0-9+/=\s]+$/.test(base64))return {error:'import needs base64 image bytes in "base64"'};
        return {command:{kind:'library',action,name,base64,scope}};
      }
      return {command:{kind:'library',action,scope}};
    }
    case 'edit':{
      const field=str(p.field,20) as EditableField|undefined,text=str(p.text,20000);
      if(!field||!editableFields.includes(field))return {error:`edit needs "field" (${editableFields.join('|')})`};
      if(text===undefined)return {error:'edit needs "text"'};
      const blockId=str(p.blockId,200);
      if(blockId!==undefined&&!/^[a-zA-Z0-9_-]{1,200}$/.test(blockId))return {error:'bad blockId'};
      return {command:{kind:'edit',field,text,...(blockId?{blockId}:{})}};
    }
    default:return {error:`unknown command kind "${String(kind)}"`};
  }
}

/** Keys the human may still press while locked: the hatch that ends Agent mode. */
export function isHumanHatch(e:{key:string;code?:string;metaKey:boolean;shiftKey:boolean}):boolean{
  return e.metaKey&&e.shiftKey&&(e.code==='KeyA'||e.key.toLowerCase()==='a');
}

/** Curl examples shown in the console so a shell-capable agent can start immediately. */
/**
 * Copy-paste lines for the channel, written so the screen never holds the secret. The token rotates
 * every launch and is loopback-only, but it was rendered in full in the agent console — where a
 * demo, a stream or a screenshot carries it out of the room. These read it out of the endpoint file
 * at run time instead, which is what docs/AGENT-CHANNEL.md already told people to do.
 */
export function bridgeExamples(base:string,endpointFile:string):string{
  const auth="-H \"Authorization: Bearer $T\" -H 'Content-Type: application/json'";
  return [
    `E='${endpointFile}'`,
    `B=$(python3 -c "import json;print(json.load(open('$E'))['base'])")`,
    `T=$(python3 -c "import json;print(json.load(open('$E'))['token'])")`,
    '',
    `curl -s $B/agent/state ${auth}`,
    `curl -s -X POST $B/agent/command ${auth} -d '{"query":"hero 추가"}'`,
    `curl -s -X POST $B/agent/act ${auth} -d '{"action":"add","data":{"kind":"cta"}}'`,
    `curl -s -X POST $B/agent/click ${auth} -d '{"selector":".space-frame.active [data-kind=hero]"}'`,
    `curl -s -X POST $B/agent/edit ${auth} -d '{"field":"title","text":"빛으로 완성하는 공간"}'`,
    `curl -s -X POST $B/agent/library ${auth} -d '{"action":"list"}'`,
    `curl -s -X POST $B/agent/library ${auth} -d '{"action":"import","scope":"project","name":"hero","base64":"<png bytes>"}'`,
    `curl -s -X POST $B/agent/library ${auth} -d '{"action":"delete","id":"0123456789abcdef"}'`,
    `curl -s -X POST $B/agent/key ${auth} -d '{"key":"1","shift":true}'`,
    `curl -s -X POST $B/agent/end ${auth}`,
  ].join('\n');
}
