import type {Block,Project} from '../model';
export type ComponentTheme={mode:'project'|'source'|'custom';accent?:string};
const defaults:Record<string,string>={own:'#344e41',mui:'#1976d2',shadcn:'#18181b'};
export function supportsComponentTheme(b:Pick<Block,'kind'|'provider'>){return b.kind==='button'&&Object.hasOwn(defaults,b.provider??'own');}
export function validComponentTheme(value:unknown,b:Pick<Block,'kind'|'provider'>):value is ComponentTheme{
 if(!supportsComponentTheme(b)||!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as ComponentTheme;
 return Object.keys(v).every(k=>k==='mode'||k==='accent')&&['project','source','custom'].includes(v.mode)&&(v.mode==='custom'?typeof v.accent==='string'&&/^#[a-f0-9]{6}$/i.test(v.accent):v.accent===undefined);
}
export function componentAccent(b:Block,projectAccent:string){
 if(!b.theme||!supportsComponentTheme(b))return projectAccent;
 return b.theme.mode==='custom'?b.theme.accent!:b.theme.mode==='source'?defaults[b.provider??'own']:projectAccent;
}
export function componentProject(b:Block,p:Project):Project{return b.theme?{...p,system:{...p.system,accent:componentAccent(b,p.system.accent)}}:p;}
export function primaryEffect(b:Block):'fill'|'text-border'|'border'|'neutral'{
 if(!['outline','ghost'].includes(b.variant??'solid'))return 'fill';
 if(b.provider==='mui')return 'text-border';
 if((b.provider??'own')==='own'&&b.variant==='outline')return 'border';
 return 'neutral';
}
