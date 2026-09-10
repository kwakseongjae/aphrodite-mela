import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_LANGUAGE_KEY,readUiLanguage,detectUiLanguage,saveUiLanguage,setContentLanguage,languageSettingsHtml} from '../src/i18n';
import {initialProject,fingerprint,isApproved,parseProject,makeBlock} from '../src/model';
import {workspaceHome,projectCards} from '../src/workspace/home';
import {upsertProject,type Library} from '../src/workspace/library';
import {vibeLanguageFormHtml,localizedVibePreviewHtml} from '../src/design/vibe-language-form';
import {planVibe} from '../src/design/vibe';
test('device UI preference is separate from project and safely handles invalid storage',()=>{
 const data=new Map<string,string>();const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
 const p=initialProject();p.approvedFingerprint=fingerprint(p);const before=JSON.stringify(p);
 assert.equal(readUiLanguage(storage),'en');saveUiLanguage(storage,'ko');assert.equal(readUiLanguage(storage),'ko');
 assert.equal(JSON.stringify(p),before);assert.equal(isApproved(p),true);
 data.set(UI_LANGUAGE_KEY,'fr');assert.equal(readUiLanguage(storage),'en');
 assert.equal(readUiLanguage({getItem(){throw new Error('unavailable');}}),'en');
 assert.throws(()=>saveUiLanguage({setItem(){throw new Error('full');}},'en'),/full/);
 assert.match(languageSettingsHtml('ko'),/앱 조작 언어/);assert.doesNotMatch(languageSettingsHtml('ko'),/name="contentLanguage"/);
});
test('content preference can change with no fill operation; content preserved and approval invalidated',()=>{
 const p=initialProject();p.approvedFingerprint=fingerprint(p);const snapshot=JSON.stringify(p),pages=JSON.stringify(p.pages);
 setContentLanguage(p,'ko');assert.equal(p.contentLanguage,'ko');assert.equal(JSON.stringify(p.pages),pages);assert.equal(isApproved(p),false);
 assert.equal(isApproved(parseProject(snapshot)),true);
 assert.match(languageSettingsHtml('en','ko'),/name="contentLanguage"/);
});
test('home and project cards translate controls but preserve user names and previews',()=>{
 const p=initialProject();p.name='Preview <script>';p.pages[0].blocks=[];
 const library=upsertProject({version:1,entries:[]} as Library,p),before=JSON.stringify(library);
 const ko=workspaceHome(library,'recent','','',false,'ko');
 assert.match(ko,/전체</span>/);assert.match(ko,/프로젝트 가져오기/);assert.match(ko,/Preview &lt;script&gt;/);
 assert.doesNotMatch(ko,/>Import project/);assert.match(projectCards(library,'recent','', 'ko'),/>이름 변경</);
 assert.match(projectCards(library,'recent','Preview','en'),/>Rename</);
 assert.equal(JSON.stringify(library),before);
});
test('Get Vibe uses independent UI and sample languages and escapes reviewed changes',()=>{
 const enUi=vibeLanguageFormHtml(false,'ko','en');assert.match(enUi,/value="ko" selected/);assert.match(enUi,/Fill headings/);assert.doesNotMatch(enUi,/제목·더미/);
 const koUi=vibeLanguageFormHtml(true,'en','ko');assert.match(koUi,/value="en" selected/);assert.match(koUi,/이미지 교체/);
 const b=makeBlock('hero');b.title='<reviewed>';
 const plan=planVibe([b],'lighting',{copy:true,images:false,replace:true,language:'en'});
 assert.match(localizedVibePreviewHtml(plan,'ko'),/&lt;reviewed&gt;/);assert.match(localizedVibePreviewHtml(plan,'en'),/field changes/);
});

test('first-run UI language follows the OS locale only until a choice is saved',()=>{const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};assert.equal(detectUiLanguage('ko-KR'),'ko');assert.equal(detectUiLanguage('ko'),'ko');assert.equal(detectUiLanguage('en-US'),'en');assert.equal(detectUiLanguage(undefined),'en');assert.equal(readUiLanguage(storage,'ko'),'ko');saveUiLanguage(storage,'en');assert.equal(readUiLanguage(storage,'ko'),'en');});
