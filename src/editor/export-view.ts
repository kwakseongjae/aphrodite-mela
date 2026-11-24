import {icon} from '../design/icon';
import {esc} from '../html';

/**
 * The export dialog's body (0.3-L4 ③). A board with a section page hands off: the approval, PROMPT.md, DESIGN.md and the
 * handoff zip. A board without one (0.3-L4b: pictures, videos, pages an agent made) has nothing to hand off, so its two ways
 * out lead: the board as one file, and the page in view as one HTML file. The same controls either way; one set is not drawn.
 */
export type ExportView = {
  sections: boolean;
  ko: boolean;
  approved: boolean;
  /** data-shown for Approve now: the board the person sees, as main.ts reads it back. */
  shown: string;
  view: string;
  code: string;
  /** The open page's own card (main.ts pageExportHtml), or '' when the open page is a section page. */
  pageCard: string;
  pages: number;
  boardExtension: string;
  /** Labels main.ts writes through control(), so an agent's description of them matches. */
  labels: {copyPrompt: string; bundle: string};
};

export function exportBodyHtml(v: ExportView): string {
  const t = (en: string, ko: string) => v.ko ? ko : en;
  const carried = '<p class="ui-help export-carried" data-export-carried hidden></p>';
  const boardWhy = t('The whole board as it is, scripts running, for another Aphrodite to open', '보드 전체를 그대로, 스크립트가 도는 채로, 다른 Aphrodite에서 열 수 있게');
  const boardButton = (primary: boolean) => `<button class="ui-btn ${primary ? 'ui-btn-primary' : 'ui-btn-secondary'} ui-btn-md" data-action="download-board-file" title="${esc(boardWhy)}">${icon('archive', 'ui-icon ui-icon-sm')}<span>${t(`Save the board as .${v.boardExtension}`, `보드를 .${v.boardExtension}로 저장`)}</span></button>`;
  if (!v.sections) {
    const board = `<div class="export-board ui-card"><span class="ui-option-icon">${icon('archive', 'ui-icon ui-icon-sm')}</span><div><p class="ui-option-name">${t('Board file', '보드 파일')} <span class="ui-option-ext">.${esc(v.boardExtension)}</span></p><p class="ui-option-why">${t(`Every page, picture and video on this board, and where each one sits, in one file. Whoever receives it opens it in Aphrodite as it is.`, `이 보드의 페이지·그림·영상과 놓인 자리를 파일 하나로 담습니다. 받은 사람의 Aphrodite에서 그대로 열립니다.`)}</p></div></div>`;
    return `${carried}<div class="export-choices">${v.pageCard}${board}</div><div class="export-actions ui-modal-foot ui-modal-foot-plain"><span class="ui-modal-foot-note">${icon('hard-drive', 'ui-icon ui-icon-sm')}${t('Saved on this Mac', '이 Mac에 저장합니다')}</span>${boardButton(true)}</div>`;
  }
  const status = `<div class="export-status ui-banner ${v.approved ? 'ui-banner-ok approved' : 'ui-banner-warn'}">${icon(v.approved ? 'circle-check' : 'circle-dashed', 'ui-icon')}<div class="ui-banner-body"><span class="ui-banner-text">${v.approved ? t('Direction approved · Ready for handoff', '방향 승인됨 · 핸드오프 준비됨') : t('Draft export · 아직 디자인 방향을 승인하지 않았습니다.', '초안 내보내기 · 아직 디자인 방향을 승인하지 않았습니다.')}</span></div>${!v.approved ? `<div class="ui-banner-actions"><button class="ui-btn ui-btn-secondary" data-action="approve-export" data-shown="${esc(v.shown)}">${t('Approve now', '지금 승인')}</button></div>` : ''}</div>`;
  const tabs = `<div class="export-tabs ui-tabs" role="tablist">${['prompt', 'design', 'html'].map(tab => `<button class="ui-tab ${v.view === tab ? 'active' : ''}" role="tab" aria-selected="${v.view === tab}" data-action="export-tab" data-view="${tab}">${tab === 'prompt' ? 'PROMPT.md' : tab === 'design' ? 'DESIGN.md' : 'index.html'}</button>`).join('')}</div>`;
  const contents = `<div class="export-contents ui-help"><span>${icon('file-code-2', 'ui-icon ui-icon-sm')} ${v.pages} HTML ${t(v.pages > 1 ? 'pages' : 'page', '페이지')}</span><span>${icon('palette', 'ui-icon ui-icon-sm')} ${t('Design tokens', '디자인 토큰')}</span><span>${icon('image', 'ui-icon ui-icon-sm')} ${t('Local assets', '로컬 에셋')}</span><span>${icon('folder', 'ui-icon ui-icon-sm')} ${t('Editable project', '편집 가능한 프로젝트')}</span></div>`;
  return `${status}${carried}${tabs}<pre class="export-code ui-mono">${esc(v.code)}</pre>${v.pageCard}${contents}<p class="ui-help export-fine">HTML은 미리보기와 같은 렌더러로 생성됩니다. 모든 이미지를 함께 묶어 오프라인에서도 열 수 있습니다.</p><div class="export-actions ui-modal-foot ui-modal-foot-plain">${boardButton(false)}<button class="ui-btn ui-btn-secondary ui-btn-md" data-action="copy-prompt">${icon('copy', 'ui-icon ui-icon-sm')}<span>${esc(v.labels.copyPrompt)}</span></button><button class="ui-btn ui-btn-primary ui-btn-md" data-action="download-bundle">${icon('download', 'ui-icon ui-icon-sm')}<span>${esc(v.labels.bundle)}</span></button></div>`;
}
