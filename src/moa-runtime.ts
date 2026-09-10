/** Self-contained runtime, serialized into offline exports. Changes are preview-session only. */
export function installMoaRuntime(doc:Pick<Document,'querySelectorAll'|'createElement'|'addEventListener'>){
 const shells=()=>Array.from(doc.querySelectorAll<HTMLElement>('[data-app-frame="app-shell"]'));
 const cards=(shell:Element)=>Array.from(shell.querySelectorAll<HTMLButtonElement>('[data-moa-task]'));
 const checks=new Map<string,boolean[]>();
 function filter(shell:HTMLElement){
  const q=(shell.querySelector<HTMLInputElement>('[data-moa-search]')?.value??'').trim().toLocaleLowerCase();
  const status=shell.querySelector<HTMLSelectElement>('[data-moa-filter]')?.value??'';
  const all=cards(shell);let visible=0;
  all.forEach(c=>{const show=(c.textContent??'').toLocaleLowerCase().includes(q)&&(!status||c.dataset.status===status);c.closest<HTMLElement>('[data-node-id]')!.hidden=!show;if(show)visible++;});
  shell.querySelectorAll<HTMLElement>('[data-moa-count]').forEach(n=>n.textContent=String(all.filter(c=>c.dataset.status===n.dataset.moaCount).length));
  const result=shell.querySelector('[data-moa-results]');if(result)result.textContent=`${visible}개 작업 · 전체 ${all.length}개 · 샘플 데이터`;
 }
 function detail(shell:HTMLElement,card:HTMLButtonElement){
  cards(shell).forEach(c=>c.setAttribute('aria-pressed',String(c===card)));
  shell.dataset.selectedTask=card.dataset.moaTask;shell.dataset.detailOpen='true';
  const panel=shell.querySelector<HTMLElement>('[data-moa-detail-body]');if(!panel)return;
  panel.replaceChildren();
  const text=(tag:string,value:string,cls='')=>{const n=doc.createElement(tag);n.textContent=value;n.className=cls;panel.append(n);return n;};
  text('span',card.querySelector('.moa-tag')?.textContent??'','moa-tag purple');
  text('h2',card.querySelector('h3')?.textContent??'작업');
  text('small',`MOA-${card.dataset.moaTask!.slice(0,6).toUpperCase()}`,'moa-task-id');
  for(const [label,field,values] of [['상태','status',['진행 중','검토 대기','완료']],['담당자','owner',['지연','현승','민경']]] as const){
   const row=doc.createElement('label');row.className='moa-property';row.append(label);const select=doc.createElement('select');select.setAttribute('aria-label',`작업 ${label}`);select.dataset.moaProperty=field;
   const options=[...new Set([card.dataset[field]??'',...values])];for(const value of options){const o=doc.createElement('option');o.textContent=o.value=value;select.append(o);}select.value=card.dataset[field]??'';row.append(select);panel.append(row);
  }
  text('p',`우선순위　${card.dataset.priority}`,'moa-property');text('h4','설명');text('p',card.dataset.description??'','moa-description');
  const state=checks.get(card.dataset.moaTask!)??[true,false,false];checks.set(card.dataset.moaTask!,state);
  text('h4',`체크리스트　${state.filter(Boolean).length}/3`);
  ['현재 흐름 분석','핵심 화면 정리','팀 리뷰 요청'].forEach((label,i)=>{const row=doc.createElement('label');row.className='moa-check';const input=doc.createElement('input');input.type='checkbox';input.checked=state[i];input.dataset.moaCheck=String(i);row.append(input,label);panel.append(row);});
  text('h4','활동');text('p','팀 리뷰를 준비하고 있어요. 변경 사항은 이 미리보기 세션에서만 유지됩니다.','moa-description');
 }
 const selected=(s:HTMLElement)=>cards(s).find(c=>c.dataset.moaTask===s.dataset.selectedTask);
 shells().forEach(shell=>{filter(shell);const first=cards(shell).find(c=>c.querySelector('h3')?.textContent==='온보딩 플로우 설계')??cards(shell)[0];if(first)detail(shell,first);});
 doc.addEventListener('input',ev=>{const t=ev.target as HTMLElement;if(!t.matches('[data-moa-search]'))return;const s=t.closest<HTMLElement>('[data-app-frame="app-shell"]');if(s)filter(s);});
 doc.addEventListener('change',ev=>{const t=ev.target as HTMLInputElement,s=t.closest<HTMLElement>('[data-app-frame="app-shell"]');if(!s)return;
  if(t.matches('[data-moa-filter]')){filter(s);return;}const card=selected(s);if(!card)return;
  if(t.dataset.moaProperty){const field=t.dataset.moaProperty;if(field!=='status'&&field!=='owner')return;card.dataset[field]=t.value;const target=card.querySelector(`[data-moa-${field}]`);if(target)target.textContent=field==='owner'?t.value.slice(0,1):t.value;filter(s);}
  if(t.dataset.moaCheck!==undefined){const state=checks.get(card.dataset.moaTask!);if(state){state[Number(t.dataset.moaCheck)]=t.checked;const heading=s.querySelectorAll('.moa-detail h4')[1];if(heading)heading.textContent=`체크리스트　${state.filter(Boolean).length}/3`;}}
 });
 doc.addEventListener('click',ev=>{const t=ev.target as HTMLElement,s=t.closest<HTMLElement>('[data-app-frame="app-shell"]');if(!s)return;
  const card=t.closest<HTMLButtonElement>('[data-moa-task]');if(card){detail(s,card);return;}
  const view=t.closest<HTMLElement>('[data-moa-view]');if(view){s.dataset.view=view.dataset.moaView;s.querySelectorAll('[data-moa-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===view)));}
  if(t.closest('[data-moa-close]'))s.dataset.detailOpen='false';
 });
}
