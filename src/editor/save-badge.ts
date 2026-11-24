import {icon} from '../design/icon';
import {esc} from '../html';

/**
 * The left panel's line on where the board is saved (0.3-L4 ③). render() draws it, and the desktop's write queue redraws
 * it when it answers (main.ts attachDiskQueue), finding it by `data-save-badge`: a write still on its way is "saving", one
 * refused, or a browser save that did not land, is "unsaved".
 */
export type SaveState = 'saved' | 'saving' | 'unsaved';

export function saveState(s: {saved: boolean; failed: boolean; native: boolean}): SaveState {
  return s.saved ? 'saved' : s.failed || !s.native ? 'unsaved' : 'saving';
}

/** `title` is the control label main.ts writes through control(), so an agent's description of it matches. */
export function saveBadgeHtml(state: SaveState, o: {native: boolean; ko: boolean; title: string}): string {
  const t = (en: string, ko: string) => o.ko ? ko : en;
  const text = state === 'saved' ? (o.native ? t('Saved on this Mac', '이 Mac에 저장됨') : t('Saved in this browser', '이 브라우저에 저장됨')) : state === 'saving' ? t('Saving to this Mac…', '이 Mac에 저장하는 중…') : t('Not saved yet', '아직 저장되지 않음');
  return `<span class="panel-save ui-side-sub${state === 'unsaved' ? ' warning' : ''}" data-save-badge="${state}" title="${esc(o.title)}">${icon(state === 'saved' ? 'check' : state === 'saving' ? 'circle-dashed' : 'circle-alert', 'ui-icon ui-icon-xs')}<span>${text}</span></span>`;
}
