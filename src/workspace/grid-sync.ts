/**
 * Keyed list reconciliation for the project grid. Filtering and sorting must feel like the cards
 * rearranging, not the page reloading: rebuilding innerHTML recreates every <img loading="lazy">,
 * which blanks and pops. Here existing nodes are moved, and only genuinely new cards are created.
 */
export type SyncOp=
  |{type:'keep';key:string}
  |{type:'move';key:string}
  |{type:'insert';key:string}
  |{type:'remove';key:string};

/**
 * Plans the moves from `oldKeys` to `newKeys`. Keys surviving in the same relative order are kept;
 * the rest are moved, inserted or removed. Duplicate keys in either list are ignored after the first.
 */
export function planSync(oldKeys:readonly string[],newKeys:readonly string[]):SyncOp[]{
  const dedupe=(keys:readonly string[])=>{const seen=new Set<string>();return keys.filter(k=>k&&!seen.has(k)&&(seen.add(k),true));};
  const before=dedupe(oldKeys),after=dedupe(newKeys);
  const survivors=new Set(after);
  const ops:SyncOp[]=before.filter(k=>!survivors.has(k)).map(key=>({type:'remove' as const,key}));
  const existing=new Set(before);
  // Longest increasing subsequence over the surviving keys: everything outside it has to move.
  const kept=before.filter(k=>survivors.has(k));
  const index=new Map(after.map((k,i)=>[k,i]));
  const positions=kept.map(k=>index.get(k)!);
  const parent=new Array<number>(positions.length).fill(-1);
  const tails:number[]=[];
  for(let i=0;i<positions.length;i++){
    let lo=0,hi=tails.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(positions[tails[mid]]<positions[i])lo=mid+1;else hi=mid;}
    if(lo>0)parent[i]=tails[lo-1];
    tails[lo]=i;
  }
  const stable=new Set<string>();
  for(let i=tails.length?tails[tails.length-1]:-1;i>=0;i=parent[i])stable.add(kept[i]);
  for(const key of after)ops.push(existing.has(key)?{type:stable.has(key)?'keep':'move',key}:{type:'insert',key});
  return ops;
}

/**
 * Applies `html` to `container` by key, reusing element nodes. Removed nodes are parked in `cache`
 * so toggling a filter back re-inserts the very same element, images already decoded.
 */
export function syncKeyedChildren(container:Element,html:string,keyAttr='data-project-id',cache?:Map<string,Element>):{kept:number;moved:number;inserted:number;removed:number}{
  const staging=container.ownerDocument.createElement('div');
  staging.innerHTML=html;
  const keyOf=(el:Element)=>el.getAttribute(keyAttr)??'';
  const incoming=new Map<string,Element>();
  for(const el of Array.from(staging.children))if(keyOf(el))incoming.set(keyOf(el),el);
  // Nothing keyed (an empty state, say): a plain swap is correct and cheap.
  if(!incoming.size){container.innerHTML=html;return {kept:0,moved:0,inserted:0,removed:0};}
  const current=new Map<string,Element>();
  for(const el of Array.from(container.children))if(keyOf(el))current.set(keyOf(el),el);
  const ops=planSync([...current.keys()],[...incoming.keys()]);
  const tally={kept:0,moved:0,inserted:0,removed:0};
  let anchor:Element|null=null;
  for(const op of ops){
    if(op.type==='remove'){const gone=current.get(op.key);if(gone){gone.remove();cache?.set(op.key,gone);}tally.removed++;continue;}
    const next=incoming.get(op.key)!;
    let node=current.get(op.key)??cache?.get(op.key);
    if(node&&!container.contains(node)){cache?.delete(op.key);mergeElement(node,next);node.classList.add('is-entering');tally.inserted++;}
    else if(!node){node=next;node.classList.add('is-entering');tally.inserted++;}
    else{
      mergeElement(node,next);
      if(op.type==='move')tally.moved++;else tally.kept++;
    }
    const after:Element|null=anchor?anchor.nextElementSibling:container.firstElementChild;
    if(node!==after)container.insertBefore(node,after);
    anchor=node;
  }
  while(anchor?.nextElementSibling)anchor.nextElementSibling.remove();
  return tally;
}

/** Copies attributes, and the subtree only when it really differs, so untouched images stay loaded. */
function mergeElement(node:Element,next:Element):void{
  for(const attr of Array.from(next.attributes))if(node.getAttribute(attr.name)!==attr.value)node.setAttribute(attr.name,attr.value);
  for(const attr of Array.from(node.attributes))if(!next.hasAttribute(attr.name)&&attr.name!=='class')node.removeAttribute(attr.name);
  if(node.innerHTML!==next.innerHTML)mergeChildren(node,next);
}

/** One level of structural reuse: same tag in the same slot keeps its node (and its decoded image). */
function mergeChildren(node:Element,next:Element):void{
  const oldKids=Array.from(node.children),newKids=Array.from(next.children);
  if(oldKids.length!==newKids.length||oldKids.some((el,i)=>el.tagName!==newKids[i].tagName)){node.innerHTML=next.innerHTML;return;}
  if(node.childNodes.length&&oldKids.length===0){node.textContent=next.textContent;return;}
  for(let i=0;i<oldKids.length;i++)mergeElement(oldKids[i],newKids[i]);
  const oldText=Array.from(node.childNodes).filter(n=>n.nodeType===3),newText=Array.from(next.childNodes).filter(n=>n.nodeType===3);
  if(oldText.length===newText.length)oldText.forEach((n,i)=>{if(n.textContent!==newText[i].textContent)n.textContent=newText[i].textContent;});
}
