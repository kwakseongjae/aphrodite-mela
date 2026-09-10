import {catalog,makeBlock,type BlockKind} from '../model';
import {providers,supportsProvider,type Provider} from '../providers';
import {patternVariants} from '../patterns';

export function implementations(kind:BlockKind){
 return (Object.keys(providers) as Provider[]).filter(p=>supportsProvider(p,kind)).map(provider=>({provider,...providers[provider],variants:patternVariants(kind),theme:provider==='seed'||provider==='astryx'?'native':'project'}));
}
export function explorerBlock(kind:BlockKind,provider:string,variant:string){
 if(!catalog.some(c=>c.kind===kind)||!supportsProvider(provider,kind)||!patternVariants(kind).includes(variant))throw new Error('Unsupported catalog selection');
 const block=makeBlock(kind);block.provider=provider;block.variant=variant;return block;
}
export const catalogMime='application/aphrodite-catalog+json';
export type CatalogChoice={kind:BlockKind;provider:string;variant:string};
export function parseCatalogChoice(raw:string):CatalogChoice|null{
 try{const v=JSON.parse(raw);if(!v||typeof v.kind!=='string'||typeof v.provider!=='string'||typeof v.variant!=='string')return null;
 if(!catalog.some(c=>c.kind===v.kind)||!supportsProvider(v.provider,v.kind)||!patternVariants(v.kind).includes(v.variant))return null;
 return {kind:v.kind,provider:v.provider,variant:v.variant};}catch{return null;}
}
export const catalogGroups=['Layout','Navigation','Input','Feedback','Content & data','App recipes'] as const;
export function catalogGroup(kind:BlockKind){
 if(String(kind).startsWith('moa'))return 'App recipes';
 if(['frame','hero','features','products'].includes(kind))return 'Layout';
 if(['navigation','footer','tabs','breadcrumb','pagination','stepper','sidebar'].includes(kind))return 'Navigation';
 if(['button','input','select','checkbox','switch','textarea','slider','toggle'].includes(kind))return 'Input';
 if(['notice','progress'].includes(kind))return 'Feedback';
 return 'Content & data';
}
export function catalogPreviewSize(kind:BlockKind){
 if(['tabs','accordion','stepper','skeleton','cards','table','stats','calendar'].includes(kind))return 'data' as const;
 if(['button','input','select','checkbox','switch','textarea','slider','toggle','badge','avatar','chips','progress','breadcrumb','pagination','notice'].includes(kind))return 'control' as const;
 return 'layout' as const;
}
