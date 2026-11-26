/**
 * 0.3-L4 ③: the export dialog on a board with a section page hands off; on a board without one its two ways out lead.
 * The same controls either way, read off the markup the way tests/surface-actions.test.ts reads every moved surface.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportBodyHtml, type ExportView} from '../src/editor/export-view.ts';
import {initialProject,isApproved} from '../src/model';
import {shownPage} from '../src/editor/starter';
import {parseBatch} from '../src/agent/ops';
import {runBatch} from '../src/agent/apply';
import {personAt,agentDispatch} from '../src/agent/dispatch';
import {exportPage,pageSource} from '../src/page-export';
import {buildPrompt,fileName} from '../src/export';
import {esc} from '../src/html';
import {editorActions,editorCalls,noop} from './support/editor-calls';
import {reachable} from './support/surfaces.ts';

const CARD = '<div class="export-page ui-card" data-export-page><input type="checkbox" data-export-scripts><button data-action="download-page-html">Download this page</button></div>';
const base: ExportView = {sections: true, ko: true, approved: false, shown: 'r2:1', view: 'prompt', code: 'Build it.', pageCard: '', pages: 2, boardExtension: 'aph', labels: {copyPrompt: 'Copy prompt', bundle: 'Download handoff .zip'}};

test('a board with a section page offers the handoff: approval, the three files to read, the board, the prompt and the zip', () => {
  assert.deepEqual(reachable(exportBodyHtml(base)), ['approve-export[shown=r2:1]', 'copy-prompt', 'download-board-file', 'download-bundle', 'export-tab[view=design]', 'export-tab[view=html]', 'export-tab[view=prompt]']);
  assert.match(exportBodyHtml(base), /data-export-carried hidden/, 'what goes out, and what the board came without, is said there');
});

test('a board without one offers the board file first and the open page as one HTML file, and none of the handoff', () => {
  const html = exportBodyHtml({...base, sections: false, pageCard: CARD});
  assert.deepEqual(reachable(html), ['download-board-file', 'download-page-html']);
  assert.match(html, /data-export-carried hidden/, 'the note on what the board came without stays');
  assert.match(html, /data-export-scripts/, 'the page keeps its scripts choice');
  assert.match(html, /class="ui-btn ui-btn-primary ui-btn-md" data-action="download-board-file"/, 'saving the board is the main answer');
  for (const gone of ['approve-export', 'export-tab', 'copy-prompt', 'download-bundle', 'export-code', 'PROMPT.md']) assert.ok(!html.includes(gone), gone);
});

test('with no page of its own in view, a board without a section page still offers its board file', () => {
  assert.deepEqual(reachable(exportBodyHtml({...base, sections: false})), ['download-board-file']);
});

test('everything the export dialog shows of a page is the page it means: the one the board shows, not a hidden open page', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const dialog = main.slice(main.indexOf('function exportModal('), main.indexOf("modalRoot.addEventListener('change'"));
  assert.match(dialog, /page = shownPage\(project\)/);
  assert.doesNotMatch(dialog, /currentPage\(|project\.pages\[0\]|project\.activePageId/);
});

test('a stale index.html tab returns to board export after an agent removes the last section page',async()=>{
  const project=initialProject(),person=personAt({isTrusted:true})!,agent=agentDispatch('test','mcp',{reason:'Keep the article'});
  let body='',exports=0;
  const tab={textContent:''},code={textContent:'',isConnected:true};
  const label=(en:string)=>en;
  const screen={...editorActions(project),uiLanguage:'en',ui:label,control:label,icon:noop,esc,shownPage,isApproved,
    shownState:()=>'',BOARD_FILE:{extension:'aph'},exportBodyHtml,buildPrompt,pageSource,fileName,frameHost:{},
    exportChoice:{scripts:true,videos:'out'},outgoing:()=>({host:{}}),exportPage:(...args:Parameters<typeof exportPage>)=>{exports++;return exportPage(...args);},
    showModal:(_title:string,_subtitle:string,html:string)=>{body=html;},modalRoot:{querySelector:(s:string)=>
      s.includes('export-tab')&&body.includes('class="export-tabs')?tab:s==='.export-code'&&body.includes('class="export-code')?code:null}};
  editorCalls(['function commit(','async function action(','function openExport(','function exportModal(','function pageExportHtml('],screen);
  const {commit,action}=screen as typeof screen & {commit:Function;action:Function};
  const active=project.activePageId;
  commit(()=>project.pages.push({id:'article',name:'Article',kind:'html',html:'<p>Article</p>',blocks:[]}),person,'edit.page-add');
  await action({dataset:{action:'export'}},person,true);
  assert.match(body,/data-action="export-tab" data-view="html"/);assert.equal(tab.textContent,'index.html');
  const parsed=parseBatch({reason:agent.reason,patch:[{op:'remove_page',page_id:active},{op:'set',on:'project',field:'activePageId',value:'article'}]});
  if('error' in parsed)throw new Error(parsed.error);
  commit(()=>{
    const result=runBatch(screen.project,parsed.batch,'');
    if(!result.ok)throw new Error(result.error);
    screen.project={...result.project,ledger:screen.project.ledger};
  },agent,'edit.apply',{source:'agent:apply'});
  assert.match(body,/data-action="export-tab" data-view="html"/,'the person still sees the old tab');
  await action({dataset:{action:'export-tab',view:'html'}},person,true);
  assert.equal(exports,0,'a tab the new dialog cannot display starts no HTML export');
  assert.deepEqual(reachable(body),['download-board-file','download-page-html[id=article]','field:export-videos']);
  assert.equal(screen.project.ledger?.changes.at(-1)?.source,'agent:apply');
});
