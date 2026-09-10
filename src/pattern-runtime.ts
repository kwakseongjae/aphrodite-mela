/** Same bounded prototype behavior for live canvas, preview and exported HTML. No network/storage. */
export function installPatternRuntime(root: Pick<Document,'addEventListener'>) {
  const filter = (event: Event) => {
    const target=event.target;
    if (!(target instanceof Element) || !target.matches('[data-kit-search],[data-kit-filter]')) return;
    const kit=target.closest('.kit-table'); if (!kit) return;
    const search=(kit.querySelector<HTMLInputElement>('[data-kit-search]')?.value ?? '').trim().toLocaleLowerCase();
    const status=kit.querySelector<HTMLSelectElement>('[data-kit-filter]')?.value ?? '';
    let count=0;
    kit.querySelectorAll<HTMLElement>('[data-kit-row]').forEach(row=> { row.hidden=!(row.textContent?.toLocaleLowerCase().includes(search) && (!status || row.dataset.status===status)); if(!row.hidden) count++; });
    const empty=kit.querySelector<HTMLElement>('[data-kit-no-results]'); if(empty) empty.hidden=count>0;
  };
  root.addEventListener('input',filter); root.addEventListener('change',filter);
  root.addEventListener('click',event=> { const target=event.target; if(!(target instanceof Element)) return; const button=target.closest<HTMLButtonElement>('[data-kit-action]'); if(!button || button.disabled) return; const result=button.parentElement?.querySelector<HTMLElement>('.kit-action-result'); if(result) result.hidden=false; });
}
