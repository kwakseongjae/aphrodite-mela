const surfaces=['#canvas-scroll','.inspector','.library-content'] as const;
/** Preserve only existing editor surfaces; page navigation deliberately bypasses this helper. */
export function rerenderPreservingScroll(root:Pick<ParentNode,'querySelector'>,render:()=>void){
 const positions=surfaces.flatMap(selector=>{
  const el=root.querySelector<HTMLElement>(selector);return el?[{selector,left:el.scrollLeft,top:el.scrollTop}]:[];
 });
 render();
 for(const position of positions){const el=root.querySelector<HTMLElement>(position.selector);if(!el)continue;
  el.scrollLeft=position.left;el.scrollTop=position.top;el.dispatchEvent(new Event('scroll'));
 }
}
