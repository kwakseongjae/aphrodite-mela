import type {Project} from './model';
export type Language='en'|'ko';
export const UI_LANGUAGE_KEY='aphrodite-ui-language';
export function isLanguage(value:unknown):value is Language{return value==='en'||value==='ko';}
export function readUiLanguage(storage:Pick<Storage,'getItem'>,fallback:Language='en'):Language{
 try{const value=storage.getItem(UI_LANGUAGE_KEY);return isLanguage(value)?value:fallback;}catch{return fallback;}
}
/** First-run default from the OS locale; an explicit saved choice always wins. */
export function detectUiLanguage(locale:string|undefined|null):Language{return (locale||'').toLowerCase().startsWith('ko')?'ko':'en';}
export function saveUiLanguage(storage:Pick<Storage,'setItem'>,value:Language){
 if(!isLanguage(value))throw new Error('Unsupported UI language');
 storage.setItem(UI_LANGUAGE_KEY,value);
}
/** Preference only: never translate reviewed fields, change IDs or synthesize approval. */
export function setContentLanguage(project:Project,value:Language){
 if(!isLanguage(value))throw new Error('Unsupported content language');
 project.contentLanguage=value;
}
export function languageSettingsHtml(ui:Language,content?:Language){
 const ko=ui==='ko';
 const options=(value:Language)=>`<option value="en" ${value==='en'?'selected':''}>English</option><option value="ko" ${value==='ko'?'selected':''}>한국어</option>`;
 return `<form id="language-settings-form"><label class="form-label">${ko?'앱 조작 언어':'App interface language'}<select name="uiLanguage" aria-label="${ko?'앱 조작 언어':'App interface language'}">${options(ui)}</select></label><p>${ko?'이 기기의 설정입니다. 프로젝트 내용과 승인 상태는 바뀌지 않습니다.':'A preference on this device. Project content and approval stay unchanged.'}</p>${content?`<label class="form-label">${ko?'이 프로젝트의 샘플 콘텐츠 언어':'Sample-content language for this project'}<select name="contentLanguage" aria-label="${ko?'샘플 콘텐츠 언어':'Sample-content language'}">${options(content)}</select></label><p>${ko?'새로운 Get Vibe 샘플과 기본 장식 문구에 적용됩니다. 기존 문구는 자동 번역하지 않습니다. 변경하면 방향 재검토가 필요하며 실행 취소할 수 있습니다.':'Used for new Get Vibe samples and default decorations. Existing copy is never translated automatically. A change requires direction review and can be undone.'}</p>`:''}<p class="fine-print">${ko?'번역 적용: 프로젝트 홈, 주요 조작 버튼, Get Vibe. 고급 편집기·진단 문구는 아직 일부 영어/한국어로 표시됩니다.':'Translated: project home, primary controls and Get Vibe. Some advanced editor and diagnostic text is still English/Korean.'}</p><button class="primary-button" type="submit">${ko?'언어 설정 저장':'Save language preferences'}</button></form>`;
}
// Only use at known application-control creation sites, never on document HTML.
const controls:Record<string,string>={
 'Undo':'실행 취소','Redo':'다시 실행','Preview':'미리보기','Export':'내보내기',
 'Reference':'레퍼런스','Manage project':'프로젝트 관리','Page options':'페이지 옵션',
 'Desktop viewport':'데스크탑 보기','Mobile viewport':'모바일 보기','Computer use guide':'에이전트 사용 안내',
 'Close':'닫기','Start from a brief':'브리프로 시작','All projects':'전체 프로젝트',
 'Saved to disk':'디스크에 저장됨','Not saved to disk':'디스크에 저장되지 않음',
 'Saved locally':'로컬에 저장됨','Unsaved':'저장되지 않음','Saving to disk…':'디스크에 저장 중…',
 'Unsaved · export a backup':'저장되지 않음 · 백업을 내보내세요',
 'Components':'컴포넌트','Layers':'레이어','Assets':'에셋','Draft':'초안','Approved':'승인됨',
};
export function controlText(label:string,language:Language){return language==='ko'?(controls[label]??label):label;}
