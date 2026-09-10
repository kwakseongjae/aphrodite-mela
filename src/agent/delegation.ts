import {esc} from '../html';
import {fingerprint,type Project} from '../model';

export const DELEGATION_KEY='aphrodite-delegation-v1';

export type DelegationScope={approve:false; deletePages:boolean; changeSystem:boolean; export:boolean};
export type Delegation={
  id:string;
  projectId:string;
  startedAt:string;
  endedAt?:string;
  scope:DelegationScope;
  operator:string;
  intent:string;
  startFingerprint:string;
  endFingerprint?:string;
  receipts:number;
  outcome?:'returned'|'ended-by-agent'|'timeout';
};

const OUTCOMES=new Set<NonNullable<Delegation['outcome']>>(['returned','ended-by-agent','timeout']);

function defaultScope(partial?:Partial<DelegationScope>):DelegationScope{
  return {
    approve:false,
    deletePages:partial?.deletePages??false,
    changeSystem:partial?.changeSystem??true,
    export:partial?.export??true,
  };
}

function isActive(d:Delegation|undefined):d is Delegation{
  return !!d && !d.endedAt && !d.outcome;
}

function isDelegation(value:unknown):value is Delegation{
  if(!value||typeof value!=='object')return false;
  const d=value as Delegation;
  if(typeof d.id!=='string'||!d.id||typeof d.projectId!=='string'||!d.projectId)return false;
  if(typeof d.startedAt!=='string'||!d.startedAt)return false;
  if(d.endedAt!==undefined&&typeof d.endedAt!=='string')return false;
  if(!d.scope||d.scope.approve!==false||typeof d.scope.deletePages!=='boolean'||typeof d.scope.changeSystem!=='boolean'||typeof d.scope.export!=='boolean')return false;
  if(typeof d.operator!=='string'||d.operator.length>100)return false;
  if(typeof d.intent!=='string'||d.intent.length>1200)return false;
  if(typeof d.startFingerprint!=='string')return false;
  if(d.endFingerprint!==undefined&&typeof d.endFingerprint!=='string')return false;
  if(!Number.isInteger(d.receipts)||d.receipts<0)return false;
  if(d.outcome!==undefined&&!OUTCOMES.has(d.outcome))return false;
  return true;
}

export function startDelegation(project:Project,input:{operator:string;intent:string;scope?:Partial<DelegationScope>},now?:string):Delegation{
  if(typeof input.operator!=='string'||input.operator.length>100)throw new Error('operator must be 100 characters or fewer');
  if(typeof input.intent!=='string'||input.intent.length>1200)throw new Error('intent must be 1200 characters or fewer');
  return {
    id:crypto.randomUUID(),
    projectId:project.id,
    startedAt:now??new Date().toISOString(),
    scope:defaultScope(input.scope),
    operator:input.operator,
    intent:input.intent,
    startFingerprint:fingerprint(project),
    receipts:0,
  };
}

export function endDelegation(d:Delegation,project:Project,outcome:Delegation['outcome'],receipts:number,now?:string):Delegation{
  return {
    ...d,
    endedAt:now??new Date().toISOString(),
    endFingerprint:fingerprint(project),
    receipts,
    outcome,
  };
}

export function isBlockedWhileDelegated(d:Delegation|undefined,action:string):boolean{
  if(!isActive(d))return false;
  if(action==='approve')return true;
  if(action==='page-delete'||action==='delete-page')return !d.scope.deletePages;
  if(action==='choose-system'||action==='systems'||action==='import-md')return !d.scope.changeSystem;
  if(action==='export'||action==='download-bundle'||action==='save-project')return !d.scope.export;
  return false;
}

function elapsedLabel(startedAt:string,fromMs=Date.now()):string{
  const start=Date.parse(startedAt);
  const total=Math.max(0,Math.floor(((Number.isFinite(start)?fromMs-start:0))/1000));
  const h=Math.floor(total/3600);
  const m=Math.floor((total%3600)/60);
  const s=total%60;
  if(h)return `${h}h ${m}m`;
  if(m)return `${m}m ${s}s`;
  return `${s}s`;
}

export function delegationBannerHtml(d:Delegation,language:'en'|'ko'):string{
  const ko=language==='ko';
  const title=ko
    ?`에이전트가 조작 중 · ${d.operator} · ${elapsedLabel(d.startedAt)}`
    :`Agent is operating · ${d.operator} · ${elapsedLabel(d.startedAt)}`;
  const receipts=ko?'기록':'Receipts';
  const locked=ko?'방향 승인은 잠겨 있습니다.':'Approve is locked.';
  const reclaim=ko?'제어 회수':'Take control';
  return `<div class="delegation-banner" role="status"><strong>${esc(title)}</strong><p class="delegation-intent">${esc(d.intent)}</p><p>${esc(receipts)} <span data-delegation-receipts>${esc(String(d.receipts))}</span> · ${esc(locked)}</p><button type="button" data-action="delegation-return">${esc(reclaim)}</button></div>`;
}

export function delegationSummary(d:Delegation):string{
  const changed=!!d.endFingerprint&&d.endFingerprint!==d.startFingerprint;
  return [
    `operator: ${d.operator}`,
    `intent: ${d.intent}`,
    `started: ${d.startedAt}`,
    `ended: ${d.endedAt??'open'}`,
    `receipts: ${d.receipts}`,
    `fingerprint changed: ${changed?'yes':'no'}`,
    `outcome: ${d.outcome??'active'}`,
  ].join('\n');
}

export function readDelegation(storage:Pick<Storage,'getItem'>,projectId:string):Delegation|undefined{
  try{
    const raw=storage.getItem(DELEGATION_KEY);
    if(!raw)return undefined;
    const parsed=JSON.parse(raw) as unknown;
    if(!isDelegation(parsed))return undefined;
    // Active records for another project id are returned as-is; the caller decides.
    void projectId;
    return parsed;
  }catch{
    return undefined;
  }
}

export function writeDelegation(storage:Pick<Storage,'setItem'|'removeItem'>,d:Delegation|undefined):void{
  try{
    if(!d)storage.removeItem(DELEGATION_KEY);
    else storage.setItem(DELEGATION_KEY,JSON.stringify(d));
  }catch{/* quota / private mode */}
}

export type DelegationReceipt={seq:number;kind:string;at:string};
function clock(iso:string):string{const d=new Date(iso);return Number.isNaN(d.getTime())?iso.slice(11,19):d.toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});}
/** Side panel shown in place of the inspector while an agent holds the screen: who, what, scope, timeline, how to take control back. */
export function agentPanelHtml(d:Delegation,receipts:readonly DelegationReceipt[],language:'en'|'ko'):string{
  const ko=language==='ko';
  const scopeRows:[string,boolean][]=[
    [ko?'방향 승인':'Approve direction',false],
    [ko?'페이지 삭제':'Delete pages',d.scope.deletePages],
    [ko?'디자인 시스템 변경':'Change design system',d.scope.changeSystem],
    [ko?'내보내기 · 저장':'Export · save',d.scope.export],
  ];
  const scope=scopeRows.map(([label,allowed])=>`<li data-allowed="${allowed}">${esc(label)}<span>${allowed?(ko?'허용':'allowed'):(ko?'잠김':'locked')}</span></li>`).join('');
  const last=receipts.slice(-12).reverse();
  const timeline=last.length?last.map(r=>`<li><b>#${r.seq}</b> ${esc(r.kind)}<time>${esc(clock(r.at))}</time></li>`).join(''):`<li class="agent-panel-empty">${ko?'아직 기록이 없습니다.':'No receipts yet.'}</li>`;
  return `<div class="agent-panel" data-delegation-id="${esc(d.id)}"><header><span class="agent-panel-eyebrow">${ko?'에이전트 콘솔':'Agent console'}</span><h3>${esc(d.operator)}</h3><p>${esc(d.intent)}</p><dl><div><dt>${ko?'시작':'Started'}</dt><dd>${esc(clock(d.startedAt))} · ${esc(elapsedLabel(d.startedAt))}</dd></div><div><dt>${ko?'기록':'Receipts'}</dt><dd data-delegation-receipts>${receipts.length}</dd></div></dl></header><section><h4>${ko?'권한 범위':'Scope'}</h4><ul class="agent-panel-scope">${scope}</ul></section><section><h4>${ko?'타임라인':'Timeline'}</h4><ol class="agent-panel-timeline">${timeline}</ol></section><footer><button type="button" class="primary-button full-width" data-action="delegation-return">${ko?'제어 회수':'Take control back'}</button><p class="fine-print">${ko?'회수하면 실행 기록이 남고 디자인 모드로 돌아갑니다.':'Returning control records the run and switches back to Design mode.'}</p></footer></div>`;
}
