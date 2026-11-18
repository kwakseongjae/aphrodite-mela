/**
 * Reading the app's own stylesheets (src/ui) in tests: what a sheet declares, which selector reaches which
 * element, and which declaration wins there.
 *
 * Not a CSS engine. It knows enough of one to answer "what does this part draw in this state" for the
 * selectors src/ui writes: compounds, the four combinators, :not(), :is(), :where(), :has() (as a flag on
 * the element, compared as written), pseudo-elements, !important and @media blocks. A selector it cannot
 * read throws, so a new kind of selector fails a test rather than being skipped.
 */

export const strip=(css:string)=>css.replace(/\/\*[\s\S]*?\*\//g,'');

export type Rule={selector:string,decls:Record<string,{value:string,important:boolean}>,order:number,media:string};

/** Every style rule, one per selector in its list, in source order. @font-face and @keyframes select nothing. */
export function rules(css:string):Rule[]{
  const out:Rule[]=[];let order=0;
  const walk=(text:string,media:string)=>{
    let i=0;
    while(i<text.length){
      const open=text.indexOf('{',i);
      if(open<0)break;
      const prelude=text.slice(i,open).trim();
      let depth=1,j=open+1;
      for(;j<text.length&&depth;j++){if(text[j]==='{')depth++;else if(text[j]==='}')depth--;}
      const body=text.slice(open+1,j-1);
      i=j;
      if(/^@(media|supports|container)\b/.test(prelude)){walk(body,prelude.replace(/\s+/g,' '));continue;}
      if(prelude.startsWith('@'))continue;
      const decls:Rule['decls']={};
      for(const d of body.split(';')){
        const c=d.indexOf(':');if(c<0)continue;
        const prop=d.slice(0,c).trim().toLowerCase(),raw=d.slice(c+1).trim();
        if(!prop)continue;
        const important=/!\s*important$/i.test(raw);
        decls[prop]={value:raw.replace(/!\s*important$/i,'').trim(),important};
      }
      order++;
      for(const selector of splitList(prelude))out.push({selector,decls,order,media});
    }
  };
  walk(strip(css),'');
  return out;
}

/** A selector list split at its top-level commas. */
export function splitList(text:string){
  const out:string[]=[];let depth=0,cur='';
  for(const ch of text){
    if(ch==='('||ch==='[')depth++;
    if(ch===')'||ch===']')depth--;
    if(ch===','&&depth===0){out.push(cur.trim());cur='';continue;}
    cur+=ch;
  }
  if(cur.trim())out.push(cur.trim());
  return out;
}

export type Pseudo={name:string,arg?:string};
export type Compound={tag?:string,ids:string[],classes:string[],attrs:[string,string|undefined][],pseudos:Pseudo[],element?:string};
export type Complex={compounds:Compound[],combinators:string[]};

const simple=/^(?:\.([\w-]+)|#([\w-]+)|\[\s*([\w-]+)\s*(?:=\s*["']?([^"'\]]*)["']?\s*)?\]|::([\w-]+)|:([\w-]+)(?:\(((?:[^()]|\([^()]*\))*)\))?)/;
const legacyElements=new Set(['before','after','first-line','first-letter']);

export function compound(text:string):Compound{
  const c:Compound={ids:[],classes:[],attrs:[],pseudos:[]};
  let rest=text;
  const tag=rest.match(/^(\*|[a-zA-Z][\w-]*)/);
  if(tag){c.tag=tag[1].toLowerCase();rest=rest.slice(tag[0].length);}
  while(rest){
    const m=rest.match(simple);
    if(!m)throw new Error('cannot read "'+text+'" at "'+rest+'"');
    if(m[1])c.classes.push(m[1]);
    else if(m[2])c.ids.push(m[2]);
    else if(m[3])c.attrs.push([m[3],m[4]]);
    else if(m[5])c.element=m[5];
    else if(m[6]&&legacyElements.has(m[6]))c.element=m[6];
    else c.pseudos.push({name:m[6].toLowerCase(),arg:m[7]?.trim()});
    rest=rest.slice(m[0].length);
  }
  return c;
}

/** A complex selector as compounds and the combinators between them (" ", ">", "+", "~"). */
export function complex(text:string):Complex{
  const compounds:string[]=[],combinators:string[]=[];let depth=0,cur='',pending='';
  const flush=()=>{if(cur){if(compounds.length)combinators.push(pending||' ');compounds.push(cur);cur='';pending='';}};
  for(const ch of text.trim()){
    if(ch==='('||ch==='[')depth++;
    if(ch===')'||ch===']')depth--;
    if(depth===0&&/[\s>+~]/.test(ch)){flush();if(ch!==' '&&ch!=='\n'&&ch!=='\t')pending=ch;continue;}
    cur+=ch;
  }
  flush();
  if(!compounds.length)throw new Error('empty selector "'+text+'"');
  return {compounds:compounds.map(compound),combinators};
}

type Spec=[number,number,number];
const add=(a:Spec,b:Spec):Spec=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const more=(a:Spec,b:Spec)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
function compoundSpec(c:Compound):Spec{
  let s:Spec=[c.ids.length,c.classes.length+c.attrs.length,(c.tag&&c.tag!=='*'?1:0)+(c.element?1:0)];
  for(const p of c.pseudos){
    if(p.name==='where')continue;
    if(['not','is','has'].includes(p.name)){
      const best=splitList(p.arg??'').map(a=>specificity(a.replace(/^[>+~]\s*/,''))).sort(more).at(-1)??[0,0,0];
      s=add(s,best as Spec);
    }else s=add(s,[0,1,0]);
  }
  return s;
}
export function specificity(selector:string):Spec{
  return complex(selector).compounds.map(compoundSpec).reduce(add,[0,0,0]);
}

/** One element of a made-up document: what a selector can see of it. A pseudo-element is a child of its host. */
export type El={tag?:string,classes:Set<string>,attrs:Map<string,string>,states:Set<string>,element?:string,prev?:El[]};
export const el=(classes:string[]=[],states:string[]=[],attrs:[string,string][]=[]):El=>({classes:new Set(classes),attrs:new Map(attrs),states:new Set(states)});
export const clone=(e:El):El=>({...e,classes:new Set(e.classes),attrs:new Map(e.attrs),states:new Set(e.states),prev:e.prev?.map(clone)});

const norm=(s:string)=>s.replace(/\s+/g,' ').replace(/\s*([>+~])\s*/g,'$1 ').trim();
/** How a :has() argument is stored on an element: whitespace-normalised, as written. */
export const hasFlag=(arg:string)=>'has('+norm(arg)+')';

function matchCompound(c:Compound,e:El):boolean{
  if(c.tag&&c.tag!=='*'&&e.tag!==c.tag)return false;
  if(c.ids.length)return false;
  if(!c.classes.every(k=>e.classes.has(k)))return false;
  if(!c.attrs.every(([n,v])=>e.attrs.has(n)&&(v===undefined||e.attrs.get(n)===v)))return false;
  for(const p of c.pseudos){
    if(p.name==='not'||p.name==='is'||p.name==='where'){
      const any=splitList(p.arg??'').some(a=>{const x=complex(a);if(x.compounds.length>1)throw new Error(':'+p.name+'('+a+') holds a combinator');return matchCompound(x.compounds[0],e);});
      if(p.name==='not'?any:!any)return false;
    }else if(p.name==='has'){if(!e.states.has(hasFlag(p.arg??'')))return false;}
    else if(!e.states.has(p.name))return false;
  }
  return true;
}

/** Whether a selector reaches the last element of a chain (the document from the root down to it). */
export function matches(selector:string|Complex,chain:El[]):boolean{
  const cx=typeof selector==='string'?complex(selector):selector;
  const from=(k:number,parents:El[],e:El):boolean=>{
    const c=cx.compounds[k];
    if(c.element){
      if(e.element!==c.element)return false;
      const host=parents.at(-1);
      if(!host||!matchCompound({...c,element:undefined},host))return false;
      parents=parents.slice(0,-1);e=host;
    }else if(e.element||!matchCompound(c,e))return false;
    if(k===0)return true;
    const comb=cx.combinators[k-1];
    if(comb==='>'){const p=parents.at(-1);return !!p&&from(k-1,parents.slice(0,-1),p);}
    if(comb===' '){for(let j=parents.length-1;j>=0;j--)if(from(k-1,parents.slice(0,j),parents[j]))return true;return false;}
    return (e.prev??[]).some(s=>from(k-1,parents,s));
  };
  return from(cx.compounds.length-1,chain.slice(0,-1),chain.at(-1)!);
}

/** Longhands and shorthands read as one property: the later winner sets it either way. */
const family:Record<string,string[]>={
  background:['background','background-color'],
  border:['border','border-color','border-top','border-right','border-bottom','border-left'],
};

/** The rule whose value for prop wins on the last element of the chain, as the cascade picks it. */
export function winner(all:Rule[],chain:El[],prop:string,media:string[]=[]):Rule&{prop:string}|undefined{
  let best:{r:Rule,prop:string,spec:Spec}|undefined;
  for(const r of all){
    if(r.media&&!media.includes(r.media))continue;
    const p=(family[prop]??[prop]).filter(n=>n in r.decls).at(-1);
    if(!p||!matches(r.selector,chain))continue;
    const spec=specificity(r.selector);
    const imp=r.decls[p].important,bimp=best?.r.decls[best.prop].important;
    if(!best||(imp&&!bimp)||(imp===bimp&&(more(spec,best.spec)>0||(more(spec,best.spec)===0&&r.order>=best.r.order))))best={r,prop:p,spec};
  }
  return best&&{...best.r,prop:best.prop};
}
export const value=(all:Rule[],chain:El[],prop:string,media:string[]=[])=>{const w=winner(all,chain,prop,media);return w?.decls[w.prop].value;};

/**
 * The classes of a sheet sorted into parts, variants and children, from how they are named and used.
 * A class named after another (ui-pill-ok after ui-pill) is a variant when the two share a compound
 * somewhere (.ui-pill.ui-pill-ok), and otherwise a child drawn inside it (ui-row-meta inside ui-row).
 * The button colours never share a compound with .ui-btn, and ui-icon-btn is a part of its own though it
 * is named after ui-icon: those are named here.
 */
const namedVariants=['ui-btn-primary','ui-btn-secondary','ui-btn-quiet','ui-btn-danger'];
const namedParts=['ui-icon-btn'];
export function classes(all:Rule[]){
  const every=new Set<string>(),together=new Set<string>(),inside=new Map<string,Set<string>>();
  for(const r of all){
    const cx=complex(r.selector);
    cx.compounds.forEach((c,k)=>{
      c.classes.forEach(a=>{every.add(a);c.classes.forEach(b=>{if(a!==b)together.add(a+' '+b);});});
      if(k===cx.compounds.length-1)for(let j=0;j<k;j++)if(cx.combinators[j]===' '||cx.combinators[j]==='>')
        for(const anc of cx.compounds[j].classes.filter(a=>a.startsWith('ui-')))for(const own of c.classes.filter(o=>o.startsWith('ui-'))){if(!inside.has(anc))inside.set(anc,new Set());inside.get(anc)!.add(own);}
    });
  }
  const named=(k:string)=>[...every].filter(p=>k.startsWith(p+'-')).sort((a,b)=>b.length-a.length)[0];
  const variantOf=new Map<string,string>(),childOf=new Map<string,string>();
  for(const k of every){
    if(!k.startsWith('ui-')||namedParts.includes(k))continue;
    const p=named(k);if(!p)continue;
    if(together.has(k+' '+p)||namedVariants.includes(k))variantOf.set(k,p);else childOf.set(k,p);
  }
  const children=(k:string)=>new Set([...[...childOf].filter(([,p])=>p===k).map(([c])=>c),...(inside.get(k)??[])]);
  return {variantOf,childOf,children};
}

/**
 * The made-up documents the sheet describes: one per selector (each compound an element with exactly
 * what the compound asks of it), the chain extended up to the part a child is named after, and each
 * child the sheet draws inside a part added under every state of that part. Variants carry their base
 * class, as markup does (class="ui-btn ui-btn-primary").
 */
export function scenarios(all:Rule[]){
  const fam=classes(all);
  const out=new Map<string,El[]>();
  const base=(e:El)=>{for(const k of [...e.classes])for(let v=fam.variantOf.get(k);v;v=fam.variantOf.get(v))e.classes.add(v);return e;};
  const key=(chain:El[])=>JSON.stringify(chain.map(e=>[e.element,[...e.classes].sort(),[...e.attrs].sort(),[...e.states].sort(),e.prev?.map(p=>[...p.classes,...p.states].sort())]));
  const put=(chain:El[])=>{out.set(key(chain),chain);};
  for(const r of all){
    const cx=complex(r.selector);
    let parents:El[]=[],cur:El|undefined;
    cx.compounds.forEach((c,k)=>{
      const e=base(el(c.classes,c.pseudos.filter(p=>!['not','is','where'].includes(p.name)).map(p=>p.name==='has'?hasFlag(p.arg??''):p.name),c.attrs.map(([n,v])=>[n,v??''])));
      if(c.tag&&c.tag!=='*')e.tag=c.tag;
      if(cur){const comb=cx.combinators[k-1];if(comb==='+'||comb==='~')e.prev=[cur];else parents=[...parents,cur];}
      cur=e;
    });
    const last=cx.compounds.at(-1)!;
    let chain=[...parents,cur!];
    if(last.element){const pe=el();pe.element=last.element;chain=[...chain,pe];}
    for(let top=chain[0],p=[...top.classes].map(k=>fam.childOf.get(k)).find(Boolean);p;top=chain[0],p=[...top.classes].map(k=>fam.childOf.get(k)).find(Boolean))
      chain=[base(el([p])),...chain];
    put(chain);
    if(!last.element)for(const k of chain.at(-1)!.classes)for(const c of fam.children(k))put([...chain.map(clone),base(el([c]))]);
  }
  return [...out.values()];
}

export const disabled=(chain:El[])=>chain.some(e=>e.states.has('disabled')||e.classes.has('is-disabled')||[...e.states].some(s=>s.startsWith('has(')&&s.includes('disabled')));
export const describe=(chain:El[])=>chain.map(e=>(e.element?'::'+e.element:'')+[...e.classes].map(c=>'.'+c).join('')+[...e.attrs].map(([n,v])=>'['+n+'="'+v+'"]').join('')+[...e.states].map(s=>':'+s).join('')+(e.prev?' (after '+e.prev.map(p=>[...p.classes].map(c=>'.'+c).join('')+[...p.states].map(s=>':'+s).join('')).join()+')':'')).join(' > ');
