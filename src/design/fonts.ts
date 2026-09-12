/**
 * Font stacks and a curated set of freely licensed families the app can install.
 * `sanitizeFamily` is a security boundary: the result is interpolated into a style attribute.
 */
export type FontCategory='serif'|'sans'|'mono';
export type FontChoice={family:string;category:FontCategory};
export type FreeFont={
  id:string;
  family:string;
  category:FontCategory;
  license:'OFL-1.1'|'Apache-2.0';
  licenseUrl:string;
  source:string;
  files:readonly {weight:number;url:string}[];
  en:string;
  ko:string;
  scripts:readonly ('latin'|'korean')[];
};

export const fallbackStacks:Record<FontCategory,string>={
  serif:"Georgia, 'Times New Roman', serif",
  sans:'Arial, Helvetica, sans-serif',
  mono:'ui-monospace, Menlo, monospace',
};

const FAMILY=/^[\p{L}\p{N} +._-]+$/u;
const OFL='OFL-1.1' as const;
const OFL_URL='https://openfontlicense.org/';

/** Accepts a CSS font family name; anything that could break out of a style attribute is refused. */
export function sanitizeFamily(value:unknown):string{
  if(typeof value!=='string')return '';
  const family=value.replace(/\s+/g,' ').trim();
  if(!family||family.length>60||!FAMILY.test(family))return '';
  return family;
}

export function fontStack(choice:{family?:string;category:FontCategory}):string{
  const family=sanitizeFamily(choice.family);
  const fallback=fallbackStacks[choice.category];
  return family?`'${family}', ${fallback}`:fallback;
}

const GH=(repo:string,path:string,ref='main')=>`https://github.com/${repo}/raw/${ref}/${path}`;

export const freeFonts:readonly FreeFont[]=[
  {id:'pretendard',family:'Pretendard',category:'sans',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/orioncactus/pretendard',files:[
    {weight:400,url:GH('orioncactus/pretendard','packages/pretendard/dist/public/static/Pretendard-Regular.otf')},
    {weight:600,url:GH('orioncactus/pretendard','packages/pretendard/dist/public/static/Pretendard-SemiBold.otf')},
    {weight:700,url:GH('orioncactus/pretendard','packages/pretendard/dist/public/static/Pretendard-Bold.otf')},
  ],en:'A contemporary Korean UI sans that sits quietly on product pages.',ko:'현대적인 한글 UI 산스로, 제품 페이지에 조용히 앉는다.',scripts:['latin','korean']},
  {id:'noto-sans-kr',family:'Noto Sans KR',category:'sans',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/notofonts/noto-cjk',files:[
    {weight:400,url:GH('notofonts/noto-cjk','Sans/SubsetOTF/KR/NotoSansKR-Regular.otf')},
    {weight:700,url:GH('notofonts/noto-cjk','Sans/SubsetOTF/KR/NotoSansKR-Bold.otf')},
  ],en:'A neutral humanist Korean sans for UI and long reading together.',ko:'UI와 긴 글을 함께 버티는 중립적인 한글 산스.',scripts:['latin','korean']},
  {id:'noto-serif-kr',family:'Noto Serif KR',category:'serif',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/notofonts/noto-cjk',files:[
    {weight:400,url:GH('notofonts/noto-cjk','Serif/SubsetOTF/KR/NotoSerifKR-Regular.otf')},
    {weight:600,url:GH('notofonts/noto-cjk','Serif/SubsetOTF/KR/NotoSerifKR-SemiBold.otf')},
    {weight:700,url:GH('notofonts/noto-cjk','Serif/SubsetOTF/KR/NotoSerifKR-Bold.otf')},
  ],en:'A scholarly Korean serif with even colour for articles and essays.',ko:'논문과 에세이에 고른 회색을 주는 한글 세리프.',scripts:['latin','korean']},
  {id:'gowun-dodum',family:'Gowun Dodum',category:'sans',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/yangheeryu/Gowun-Dodum',files:[
    {weight:400,url:GH('yangheeryu/Gowun-Dodum','fonts/ttf/GowunDodum-Regular.ttf','master')},
  ],en:'A soft handwritten Korean sans with a warm, personal tone.',ko:'손맛 있는 부드러운 한글 돋움으로, 다정한 인상을 준다.',scripts:['latin','korean']},
  {id:'gowun-batang',family:'Gowun Batang',category:'serif',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/yangheeryu/Gowun-Batang',files:[
    {weight:400,url:GH('yangheeryu/Gowun-Batang','fonts/ttf/GowunBatang-Regular.ttf','master')},
    {weight:700,url:GH('yangheeryu/Gowun-Batang','fonts/ttf/GowunBatang-Bold.ttf','master')},
  ],en:'A pencil-written Korean serif, neat and friendly on editorial pages.',ko:'연필로 쓴 듯한 단정한 한글 바탕체로, 편집 페이지를 따뜻하게 한다.',scripts:['latin','korean']},
  {id:'ibm-plex-sans-kr',family:'IBM Plex Sans KR',category:'sans',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/IBM/plex',files:[
    {weight:400,url:GH('IBM/plex','packages/plex-sans-kr/fonts/complete/otf/IBMPlexSansKR-Regular.otf','master')},
    {weight:600,url:GH('IBM/plex','packages/plex-sans-kr/fonts/complete/otf/IBMPlexSansKR-SemiBold.otf','master')},
    {weight:700,url:GH('IBM/plex','packages/plex-sans-kr/fonts/complete/otf/IBMPlexSansKR-Bold.otf','master')},
  ],en:'A technical Korean sans with an engineered, corporate voice.',ko:'공학적 톤을 한글에 옮긴 제품·기업 산스.',scripts:['latin','korean']},
  {id:'nanum-myeongjo',family:'Nanum Myeongjo',category:'serif',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/google/fonts/tree/main/ofl/nanummyeongjo',files:[
    {weight:400,url:GH('google/fonts','ofl/nanummyeongjo/NanumMyeongjo-Regular.ttf')},
    {weight:700,url:GH('google/fonts','ofl/nanummyeongjo/NanumMyeongjo-Bold.ttf')},
  ],en:'A warm contemporary Korean myeongjo for essays and news.',ko:'따뜻한 현대 명조로, 에세이와 뉴스에 어울린다.',scripts:['latin','korean']},
  {id:'inter',family:'Inter',category:'sans',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/rsms/inter',files:[
    {weight:400,url:GH('rsms/inter','docs/font-files/InterVariable.ttf','master')},
  ],en:'A screen-first Latin sans with a tall x-height for dense UI.',ko:'화면용 라틴 산스. 높은 x-height로 밀집한 UI를 또렷하게 한다.',scripts:['latin']},
  {id:'source-serif-4',family:'Source Serif 4',category:'serif',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/adobe-fonts/source-serif',files:[
    {weight:400,url:GH('adobe-fonts/source-serif','TTF/SourceSerif4-Regular.ttf','release')},
    {weight:600,url:GH('adobe-fonts/source-serif','TTF/SourceSerif4-Semibold.ttf','release')},
    {weight:700,url:GH('adobe-fonts/source-serif','TTF/SourceSerif4-Bold.ttf','release')},
  ],en:'A literary Latin serif with optical sizes for headings and text.',ko:'제목과 본문을 함께 버티는 문학적인 라틴 세리프.',scripts:['latin']},
  {id:'ibm-plex-mono',family:'IBM Plex Mono',category:'mono',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/IBM/plex',files:[
    {weight:400,url:GH('IBM/plex','packages/plex-mono/fonts/complete/otf/IBMPlexMono-Regular.otf','master')},
    {weight:600,url:GH('IBM/plex','packages/plex-mono/fonts/complete/otf/IBMPlexMono-SemiBold.otf','master')},
    {weight:700,url:GH('IBM/plex','packages/plex-mono/fonts/complete/otf/IBMPlexMono-Bold.otf','master')},
  ],en:'An engineered monospace for code samples and data captions.',ko:'코드와 데이터 캡션을 위한 공학적 고정폭.',scripts:['latin']},
  {id:'jetbrains-mono',family:'JetBrains Mono',category:'mono',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/JetBrains/JetBrainsMono',files:[
    {weight:400,url:GH('JetBrains/JetBrainsMono','fonts/ttf/JetBrainsMono-Regular.ttf','master')},
    {weight:600,url:GH('JetBrains/JetBrainsMono','fonts/ttf/JetBrainsMono-SemiBold.ttf','master')},
    {weight:700,url:GH('JetBrains/JetBrainsMono','fonts/ttf/JetBrainsMono-Bold.ttf','master')},
  ],en:'A coding monospace with tall letters and clear punctuation.',ko:'키 큰 글자와 또렷한 기호로 코드를 읽게 하는 고정폭.',scripts:['latin']},
  {id:'space-grotesk',family:'Space Grotesk',category:'sans',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/floriankarsten/space-grotesk',files:[
    {weight:400,url:GH('floriankarsten/space-grotesk','fonts/ttf/static/SpaceGrotesk-Regular.ttf','master')},
    {weight:700,url:GH('floriankarsten/space-grotesk','fonts/ttf/static/SpaceGrotesk-Bold.ttf','master')},
  ],en:'A geometric Latin sans with a slightly technical, display edge.',ko:'기하학적이면서 디스플레이 기운이 있는 라틴 산스.',scripts:['latin']},
  {id:'fraunces',family:'Fraunces',category:'serif',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/undercasetype/fraunces',files:[
    {weight:400,url:GH('undercasetype/fraunces','fonts/ttf/Fraunces9pt-Regular.ttf','master')},
    {weight:600,url:GH('undercasetype/fraunces','fonts/ttf/Fraunces9pt-SemiBold.ttf','master')},
    {weight:700,url:GH('undercasetype/fraunces','fonts/ttf/Fraunces9pt-Bold.ttf','master')},
  ],en:'A soft old-style Latin serif with a wonky, editorial display voice.',ko:'살짝 일그러진 옛 양식의 라틴 세리프로, 편집 타이틀에 개성을 준다.',scripts:['latin']},
  {id:'libre-baskerville',family:'Libre Baskerville',category:'serif',license:OFL,licenseUrl:OFL_URL,source:'https://github.com/impallari/Libre-Baskerville',files:[
    {weight:400,url:GH('impallari/Libre-Baskerville','fonts/ttf/LibreBaskerville-Regular.ttf','master')},
    {weight:600,url:GH('impallari/Libre-Baskerville','fonts/ttf/LibreBaskerville-SemiBold.ttf','master')},
    {weight:700,url:GH('impallari/Libre-Baskerville','fonts/ttf/LibreBaskerville-Bold.ttf','master')},
  ],en:'A classic transitional Latin serif for long-form reading.',ko:'긴 글을 읽히게 하는 고전적인 라틴 세리프.',scripts:['latin']},
];

const INSTALLABLE=new Set(freeFonts.map(f=>f.id));
export function isInstallable(id:string):boolean{return INSTALLABLE.has(id);}

export function fontsFor(scripts:'all'|'latin'|'korean'):FreeFont[]{
  return scripts==='all'?[...freeFonts]:freeFonts.filter(f=>f.scripts.includes(scripts));
}

export function licenseNote(font:FreeFont,language:'en'|'ko'):string{
  return language==='ko'
    ?`${font.family}는 ${font.license} 라이선스이며, 설치하면 사용자 본인의 글꼴 폴더로 파일이 복사됩니다.`
    :`${font.family} is licensed under ${font.license} and installing copies the file into your own font folder.`;
}
