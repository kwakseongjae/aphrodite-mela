/**
 * Bundled sample photography. Local files only: choosing one never leaves this Mac and never
 * calls a model. Every id here must also be allowed by `safeImage` in model.ts.
 */
export type SampleCategory='tech'|'office'|'coffee'|'fashion'|'books'|'hobby'|'food'|'interior';
export type SampleImage={id:string;category:SampleCategory;wide:boolean;en:string;ko:string};

export const sampleCategories:readonly {id:SampleCategory;en:string;ko:string}[]=[
  {id:'tech',en:'Devices',ko:'기기'},
  {id:'office',en:'Workspace',ko:'업무'},
  {id:'coffee',en:'Coffee',ko:'커피'},
  {id:'fashion',en:'Fashion',ko:'패션'},
  {id:'books',en:'Books',ko:'책'},
  {id:'hobby',en:'Objects',ko:'오브제'},
  {id:'food',en:'Food',ko:'음식'},
  {id:'interior',en:'Interior',ko:'공간'},
];

export const sampleImages:readonly SampleImage[]=[
  {id:'phone-desk',category:'tech',wide:true,en:'Phone on a desk',ko:'책상 위 스마트폰'},
  {id:'phone-hand',category:'tech',wide:false,en:'Phone in hand',ko:'손에 든 스마트폰'},
  {id:'laptop-open',category:'tech',wide:true,en:'Open laptop',ko:'노트북'},
  {id:'tablet-stylus',category:'tech',wide:false,en:'Tablet and stylus',ko:'태블릿과 스타일러스'},
  {id:'smartwatch',category:'tech',wide:false,en:'Smartwatch',ko:'스마트워치'},
  {id:'earbuds',category:'tech',wide:false,en:'Earbuds case',ko:'이어버드 케이스'},
  {id:'camera-film',category:'tech',wide:true,en:'Film camera',ko:'필름 카메라'},
  {id:'monitor-setup',category:'tech',wide:true,en:'Monitor setup',ko:'모니터 셋업'},
  {id:'keyboard-mech',category:'office',wide:true,en:'Mechanical keyboard',ko:'기계식 키보드'},
  {id:'mouse',category:'office',wide:false,en:'Wireless mouse',ko:'무선 마우스'},
  {id:'desk-overhead',category:'office',wide:true,en:'Desk from above',ko:'책상 위에서'},
  {id:'notebook-pen',category:'office',wide:false,en:'Notebook and pen',ko:'노트와 만년필'},
  {id:'desk-lamp',category:'office',wide:false,en:'Desk lamp',ko:'책상 조명'},
  {id:'cable-tray',category:'office',wide:false,en:'Cable organizer',ko:'케이블 정리함'},
  {id:'workspace-corner',category:'office',wide:true,en:'Workspace corner',ko:'작업 공간 한켠'},
  {id:'espresso-cup',category:'coffee',wide:false,en:'Espresso',ko:'에스프레소'},
  {id:'pour-over',category:'coffee',wide:true,en:'Pour over',ko:'핸드드립'},
  {id:'latte-art',category:'coffee',wide:false,en:'Latte art',ko:'라떼 아트'},
  {id:'coffee-beans',category:'coffee',wide:false,en:'Coffee beans',ko:'커피 원두'},
  {id:'cafe-counter',category:'coffee',wide:true,en:'Cafe counter',ko:'카페 카운터'},
  {id:'cold-brew',category:'coffee',wide:false,en:'Cold brew',ko:'콜드브루'},
  {id:'barista-pour',category:'coffee',wide:true,en:'Pouring milk',ko:'우유를 붓는 손'},
  {id:'knitwear-fold',category:'fashion',wide:true,en:'Folded knitwear',ko:'접어둔 니트'},
  {id:'sneakers',category:'fashion',wide:false,en:'Sneakers',ko:'스니커즈'},
  {id:'leather-bag',category:'fashion',wide:false,en:'Leather bag',ko:'가죽 가방'},
  {id:'coat-rack',category:'fashion',wide:true,en:'Coat on a rack',ko:'걸어둔 코트'},
  {id:'accessories-flat',category:'fashion',wide:true,en:'Accessories',ko:'액세서리'},
  {id:'denim-stack',category:'fashion',wide:false,en:'Denim',ko:'데님'},
  {id:'silk-scarf',category:'fashion',wide:false,en:'Silk scarf',ko:'실크 스카프'},
  {id:'jewellery-tray',category:'fashion',wide:false,en:'Jewellery',ko:'주얼리'},
  {id:'books-stack',category:'books',wide:false,en:'Stacked books',ko:'쌓인 책'},
  {id:'book-open',category:'books',wide:true,en:'Open book',ko:'펼친 책'},
  {id:'bookshelf',category:'books',wide:true,en:'Bookshelf',ko:'책장'},
  {id:'notebooks-set',category:'books',wide:false,en:'Notebooks',ko:'노트 세트'},
  {id:'magazine-spread',category:'books',wide:true,en:'Magazine',ko:'매거진'},
  {id:'pen-set',category:'books',wide:false,en:'Pen set',ko:'펜 세트'},
  {id:'figure-shelf',category:'hobby',wide:false,en:'Collectible figure',ko:'피규어'},
  {id:'camera-collection',category:'hobby',wide:true,en:'Camera collection',ko:'카메라 컬렉션'},
  {id:'plant-pot',category:'hobby',wide:false,en:'Potted plant',ko:'화분'},
  {id:'vinyl-record',category:'hobby',wide:true,en:'Vinyl record',ko:'LP 레코드'},
  {id:'board-game',category:'hobby',wide:true,en:'Board game',ko:'보드게임'},
  {id:'bakery-counter',category:'food',wide:true,en:'Bakery',ko:'베이커리'},
  {id:'brunch-plate',category:'food',wide:false,en:'Brunch plate',ko:'브런치'},
  {id:'fruit-bowl',category:'food',wide:false,en:'Fruit bowl',ko:'과일 볼'},
  {id:'wine-glass',category:'food',wide:false,en:'Wine',ko:'와인'},
  {id:'tableware',category:'food',wide:true,en:'Tableware',ko:'도자 식기'},
  {id:'living-room',category:'interior',wide:true,en:'Living room',ko:'거실'},
  {id:'retail-interior',category:'interior',wide:true,en:'Retail interior',ko:'리테일 매장'},
  {id:'bedroom',category:'interior',wide:true,en:'Bedroom',ko:'침실'},
  {id:'studio-space',category:'interior',wide:true,en:'Studio space',ko:'스튜디오'},
];

export const SAMPLE_DIR='/assets/samples/';
export function sampleSrc(id:string):string{return `${SAMPLE_DIR}${id}.webp`;}
/** True when `value` is one of the bundled sample paths. */
export function isSampleSrc(value:string):boolean{
  const id=value.startsWith(SAMPLE_DIR)&&value.endsWith('.webp')?value.slice(SAMPLE_DIR.length,-'.webp'.length):'';
  return !!id&&sampleImages.some(s=>s.id===id);
}
export function samplesIn(category:SampleCategory|'all'):SampleImage[]{
  return category==='all'?[...sampleImages]:sampleImages.filter(s=>s.category===category);
}
