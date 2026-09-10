import type { Block } from './model';
import { patternSpecs } from './patterns';
import {moaHtml} from './moa-render';
const e = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const rows = (s: string) => s.split('\n').filter(Boolean).slice(0, 50).map(r => r.split('|'));
export function planningHtml(text: string, variant = 'week'): string {
  const data = rows(text);
  if (variant === 'agenda') return `<ul class="kit-agenda">${data.map(([day,task,status])=>`<li><b>${e(day)}</b><span>${e(task ?? '')}</span><small>${e(status ?? '')}</small></li>`).join('')}</ul>`;
  const groups = variant === 'board' ? [...new Set(data.map(r=>r[2] || '대기'))] : ['월','화','수','목','금'];
  return `<div class="kit-planner" style="--lanes:${Math.max(1, Math.min(groups.length, 5))}">${groups.map(group=>`<section class="kit-lane"><h3>${e(group)}</h3>${data.filter(r=>(variant === 'board' ? r[2] || '대기' : r[0])===group).map(([day,task,status])=>`<article><span class="kit-dot" aria-hidden="true"></span><span>${e(task ?? '')}</span><small>${e(variant==='board'?day:status ?? '')}</small></article>`).join('')}</section>`).join('')}</div>`;
}
export function patternHtml(b: Block): string {
  if(b.kind.startsWith('moa'))return moaHtml(b);
  const t=e(b.title), p=e(b.text), l=e(b.label), id=`kit-${e(b.id)}`, state=b.options?.state ?? 'default', variant=b.variant ?? 'default';
  const disabled=state==='disabled'||state==='loading';
  const header=`<header class="kit-header"><div><span class="kit-kicker">${l}</span><h2>${t}</h2></div></header>`;
  const wrap=(body:string)=>`<section class="kit kit-${b.kind}" data-state="${e(state)}" data-density="${b.options?.density ?? 'comfortable'}" style="--columns:${b.options?.columns ?? 3}">${body}</section>`;
  if (['cards','stats','table','calendar'].includes(b.kind) && state!=='default') return wrap(header+`<div class="kit-state" role="status" ${state==='loading'?'aria-busy="true"':''}><strong>${state==='loading'?'불러오는 중':state==='error'?'데이터를 불러오지 못했습니다':'표시할 항목이 없습니다'}</strong><p>${state==='error'?'잠시 후 다시 확인해주세요.':state==='empty'?'새 항목을 추가하면 여기에 표시됩니다.':'잠시 기다려주세요.'}</p>${state==='loading'?'<div class="kit-skeleton"></div><div class="kit-skeleton"></div>':''}</div>`);
  switch(b.kind) {
    case 'button': return wrap(`<button type="button" class="kit-action" aria-label="${t}" data-kit-action ${disabled?'disabled':''} ${state==='loading'?'aria-busy="true"':''}>${state==='loading'?'처리 중…':l}</button><p class="kit-action-result" role="status" hidden>${p}</p>`);
    case 'input': return wrap(`<label class="kit-field" for="${id}"><span>${t}</span><input id="${id}" type="${variant==='search'?'search':'text'}" placeholder="${l}" ${disabled?'disabled':''} ${state==='error'?'aria-invalid="true"':''} aria-describedby="${id}-help"><small id="${id}-help">${p}</small></label>`);
    case 'tabs': return wrap(`<fieldset class="kit-switch"><legend>${t}</legend>${rows(b.text).map(([label,content],i)=>`<div class="kit-switch-item"><input type="radio" id="${id}-${i}" name="${id}" ${i===0?'checked':''} ${disabled?'disabled':''}><label for="${id}-${i}">${e(label)}</label><div class="kit-switch-panel">${e(content??'')}</div></div>`).join('')}</fieldset>`);
    case 'cards': return wrap(header+`<div class="kit-grid">${rows(b.text).map(([name,description])=>`<article class="kit-card"><h3>${e(name)}</h3><p>${e(description??'')}</p></article>`).join('')}</div>`);
    case 'stats': return wrap(header+`<div class="kit-grid">${rows(b.text).map(([name,value,description])=>`<article class="kit-card"><h3>${e(name)}</h3><strong class="kit-metric">${e(value??'—')}</strong><small>${e(description??'')}</small></article>`).join('')}</div>`);
    case 'table': { const data=rows(b.text); const statuses=[...new Set(data.map(r=>r[2]??''))].filter(Boolean);
      return wrap(header+`<div class="kit-table-controls"><label>검색<input type="search" data-kit-search placeholder="${l}" aria-label="${t} 검색"></label><label>상태<select data-kit-filter aria-label="${t} 상태 필터"><option value="">전체</option>${statuses.map(s=>`<option>${e(s)}</option>`).join('')}</select></label></div><div class="kit-table-scroll"><table><caption>${t}</caption><thead><tr><th scope="col">업무</th><th scope="col">담당자</th><th scope="col">상태</th></tr></thead><tbody>${data.map(([task,owner,status])=>`<tr data-kit-row data-status="${e(status??'')}"><td>${e(task)}</td><td>${e(owner??'')}</td><td><span class="kit-chip">${e(status??'')}</span></td></tr>`).join('')}</tbody></table></div><p data-kit-no-results role="status" hidden>검색 결과가 없습니다.</p>`); }
    case 'calendar': return wrap(header+planningHtml(b.text,variant));
    case 'notice': return wrap(`<div role="status" class="kit-notice-body"><span class="kit-chip">${e(state==='loading'?'처리 중':state==='empty'?'항목 없음':({info:'안내',success:'완료',warning:'주의',error:'오류'}[variant]??b.label))}</span><div><h2>${t}</h2><p>${p}</p></div></div>`);
    default: return '';
  }
}
export const defaultPlanningText=patternSpecs.calendar.text;
