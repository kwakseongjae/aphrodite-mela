import {makeBlock, type Block, type BlockKind} from '../model';
import {referenceDefaults} from './reference-defaults';
import {koreanVibeCopy,englishWorkspaceCopy} from './vibe-ko';
import {collectionRows} from './collection';

type Copy = {title:string;text:string;label:string;image?:string};
export type VibePack = {id:string;name:string;description:string;copy:Partial<Record<BlockKind,Copy>>};
export const vibePacks:VibePack[] = [
 {id:'lighting',name:'Editorial · Lighting',description:'레퍼런스 ⑤ · 조명 브랜드용 자체 작성 카피. 사진은 별도 업로드.',copy:{
 navigation:{title:'FORME',text:'Collection · Our story · Journal',label:'Explore'},
 hero:{title:'Light, made meaningful.',text:'Sculptural lighting for modern life. Designed to bring warmth, character and a deeper sense of home.',label:'Explore the collection',image:'/assets/lighting-hero.png'},
 products:{title:'Objects for everyday living.',text:'Arc pendant|$780\nHalo table|$620\nFold wall|$480',label:'THE COLLECTION'},
 features:{title:'Considered light. Everyday warmth.',text:'Sculptural forms|Explore silhouettes that give a room character.\nA warmer atmosphere|Find inspiration for everyday spaces.\nYour own perspective|Choose the light that feels like you.',label:'A DIFFERENT WAY TO LIVE'},
 cta:{title:'A softer light. A brighter everyday.',text:'Discover considered lighting for the spaces you call home.',label:'Find your light'},
 footer:{title:'FORME',text:'Timeless forms. Considered details.',label:'© 2026 FORME · Demo'},
 button:{title:'Explore the collection',text:'Prototype action — connect a destination before launch.',label:'Explore the collection'},
 input:{title:'Email address',text:'Receive occasional collection updates. Demo only.',label:'you@example.com'}
 }},
 {id:'commerce',name:'Commerce · Operations',description:'레퍼런스 ① · 지표·상품·운영 카피. 수치는 명시적인 데모.',copy:{
 stats:{title:'Store overview',text:'Revenue|$128,430|Demo · this month\nOrders|1,842|Demo orders\nConversion|3.84%|Demo rate',label:'DEMO DATA'},
 cards:{title:'Top products',text:'Stoneware dinner set|420 units · $29,358\nSculptural table lamp|312 units · $21,528\nEveryday tote|286 units · $10,296',label:'Product overview'},
 input:{title:'Search products',text:'Search this demo catalog.',label:'Product name'},
 button:{title:'Export report',text:'Demo report action; no real sales data.',label:'Export report'},
 notice:{title:'A strong month.',text:'Revenue is up 18.6% in this fictional dataset. Replace with verified data before publishing.',label:'DEMO INSIGHT'}
 }},
 {id:'workspace',name:'Workspace · Launch',description:'레퍼런스 ③ · 한글 업무·라벨·상태. 기존 보드의 구조는 유지.',copy:{
 table:{title:'출시 준비',text:'홈페이지 검토|지연|진행 중\n디자인 토큰 정리|민수|완료\n접근성 점검|서연|대기',label:'업무 검색'},
 cards:{title:'웹사이트 출시',text:'첫 화면 다듬기|카피와 계층 구조를 검토합니다.\n반응형 구현|모바일 읽기 순서를 확인합니다.\n최종 QA|키보드와 export를 검증합니다.',label:'팀 프로젝트'},
 input:{title:'프로젝트 이름',text:'팀원이 알아볼 수 있는 이름을 입력하세요.',label:'예: 웹사이트 출시'},
 button:{title:'검토 요청',text:'로컬 데모입니다. 팀원에게 메시지를 전송하지 않습니다.',label:'검토 요청'},
 notice:{title:'검토할 준비가 됐어요',text:'실제 사용자가 디자인을 확인한 뒤 다음 단계로 진행하세요.',label:'안내'}
 }},
 {id:'travel',name:'Travel · Stays',description:'레퍼런스 ④ · 숙소 카피. 지도·숙소 사진은 미확보로 남깁니다.',copy:{
 navigation:{title:'Wanderly',text:'Stays · Experiences · Saved',label:'Your account'},
 hero:{title:'Somewhere worth staying.',text:'Explore a considered collection of stays in Mallorca. Fictional inventory for visual review.',label:'Find a stay'},
 products:{title:'Stays in Mallorca',text:'Casa de la Calma|$245 / night\nThe Olive House|$189 / night\nCala Vista|$275 / night',label:'DEMO COLLECTION'},
 input:{title:'Destination',text:'Choose where your next trip begins.',label:'Mallorca, Spain'},
 button:{title:'Search stays',text:'Demo only — no live availability or booking.',label:'Search'}
 }}
];
export type VibeChange={id:string;field:'title'|'text'|'label'|'image';before:string;after:string};
export type VibePlan={packId:string;changes:VibeChange[];unsupported:string[];missingAssets:string[];missingImageSlots:{blockId:string;index:number}[];imagesRequested:boolean;language?:'en'|'ko'};
export function planVibe(blocks:Block[],packId:string,options:{copy:boolean;images:boolean;replace:boolean;image?:string;language?:'en'|'ko';brandName?:string}):VibePlan {
 const pack=vibePacks.find(p=>p.id===packId);if(!pack)throw new Error('Unknown vibe pack');
 const plan:VibePlan={packId,changes:[],unsupported:[],missingAssets:[],missingImageSlots:[],imagesRequested:options.images,language:options.language};
 for(const b of blocks){
  if(b.kind==='frame')continue;
  const original=pack.copy[b.kind];
  const localized=options.language==='ko'?koreanVibeCopy[packId]?.[b.kind]:options.language==='en'&&packId==='workspace'?englishWorkspaceCopy[b.kind]:undefined;
  const sample=original?{...original,...localized}:undefined,defaults=makeBlock(b.kind);
  if(sample&&options.brandName?.trim()&&['navigation','footer'].includes(b.kind)){
   sample.title=options.brandName.trim();
   if(b.kind==='footer')sample.label=`© 2026 ${options.brandName.trim()} · ${options.language==='ko'?'데모':'Demo'}`;
  }
  if(options.copy){if(!sample)plan.unsupported.push(b.id);else for(const field of ['title','text','label'] as const){
   const scaffold=!b.filled&&referenceDefaults[b.kind]?.[field]===b[field];
   if((options.replace||!b[field].trim()||b[field]===defaults[field]||scaffold)&&b[field]!==sample[field])plan.changes.push({id:b.id,field,before:b[field],after:sample[field]});
  }}
  if(options.images&&['hero','products'].includes(b.kind)&&(!b.image||options.replace)){
   const image=options.image||sample?.image;
   if(image&&image!==b.image)plan.changes.push({id:b.id,field:'image',before:b.image,after:image});
  }
  if(options.images&&['hero','products'].includes(b.kind)){
   const after={...b};for(const change of plan.changes.filter(c=>c.id===b.id))after[change.field]=change.after;
   const missing=after.kind==='products'?collectionRows(after).filter(row=>!row.image).map(row=>row.index):after.image?[]:[0];
   if(missing.length){plan.missingAssets.push(b.id);plan.missingImageSlots.push(...missing.map(index=>({blockId:b.id,index})));}
  }
 }
 return plan;
}
export function applyVibe(blocks:Block[],plan:VibePlan){
 // Validate all changes before the first write: a stale preview must never partially apply.
 for(const c of plan.changes)if(blocks.find(b=>b.id===c.id)?.[c.field]!==c.before)throw new Error('Vibe preview is stale. Preview again.');
 for(const c of plan.changes){const b=blocks.find(b=>b.id===c.id)!;b[c.field]=c.after;if(c.field!=='image')b.filled=true;}
}
