/**
 * Agent channel. While Agent mode is on, humans are locked out of the UI (see the input gate in main.ts)
 * and the agent drives the app through commands: over the loopback HTTP bridge in the desktop app
 * (forwarded here as `agent:command` events) or through `window.aphroditeAgent` in a browser build.
 * Commands are executed as programmatic DOM events, which the gate lets through (they are not `isTrusted`).
 */
export type AgentCommand=
  |{kind:'state'}
  |{kind:'act';action:string;data:Record<string,string>}
  |{kind:'click';selector:string}
  |{kind:'type';selector:string;text:string;submit?:boolean}
  |{kind:'key';key:string;code?:string;meta?:boolean;shift?:boolean;ctrl?:boolean;alt?:boolean}
  |{kind:'command';query:string}
  |{kind:'edit';field:EditableField;text:string;blockId?:string}
  |{kind:'library';action:LibraryAction;id?:string;name?:string;base64?:string;scope?:'project'|'global'}
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
export function bridgeExamples(base:string,token:string):string{
  const auth=`-H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json'`;
  return [
    `curl -s ${base}/agent/state ${auth}`,
    `curl -s -X POST ${base}/agent/command ${auth} -d '{"query":"hero 추가"}'`,
    `curl -s -X POST ${base}/agent/act ${auth} -d '{"action":"add","data":{"kind":"cta"}}'`,
    `curl -s -X POST ${base}/agent/click ${auth} -d '{"selector":".space-frame.active [data-kind=hero]"}'`,
    `curl -s -X POST ${base}/agent/edit ${auth} -d '{"field":"title","text":"빛으로 완성하는 공간"}'`,
    `curl -s -X POST ${base}/agent/library ${auth} -d '{"action":"list"}'`,
    `curl -s -X POST ${base}/agent/library ${auth} -d '{"action":"import","scope":"project","name":"hero","base64":"<png bytes>"}'`,
    `curl -s -X POST ${base}/agent/library ${auth} -d '{"action":"delete","id":"0123456789abcdef"}'`,
    `curl -s -X POST ${base}/agent/key ${auth} -d '{"key":"1","shift":true}'`,
    `curl -s -X POST ${base}/agent/end ${auth}`,
  ].join('\n');
}
