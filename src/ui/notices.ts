/**
 * Where a notice goes (0.3-G2b). There are four places and no fifth:
 *
 * - toast: a line at the foot of the window that leaves after it has been read. What finished, with Undo when it
 *   can be undone; what was refused, with the reason (src/design/toasts.ts).
 * - card: one card in one place that stays until the person decides. The new version (src/update-notice.ts).
 * - dialog: what would lose work if it were left alone. The folder the boards live in is gone, the disk is full,
 *   the saved copy changed under this window. It opens without a press, so it starts on what loses nothing.
 * - mark: how things stand now, small, beside Preview and Export. "Not saved" opens the dialog again; "Connected"
 *   says who may edit, how many changes they made, and holds the person's Disconnect.
 *
 * A screen that could not be drawn is the one sheet in the middle, for when nothing else can be trusted.
 * Agent mode keeps its strip over the screen until it goes with agent mode (src/main.ts agentBannerHtml).
 */
import {icon} from '../design/icon';

export const NOTICE_PLACES = ['toast', 'card', 'dialog', 'mark'] as const;
export type NoticePlace = (typeof NOTICE_PLACES)[number];

/** What stopped the boards from being saved. A vanished folder, or a store that could not be read, is found when the
 *  app opens; the others when a save fails. */
export type Trouble =
  | {kind: 'vanished'; path: string; boards: number; replaced?: boolean}
  | {kind: 'full' | 'conflict' | 'failed' | 'unread'; detail: string};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The error a failed save came back with, read for what it means to the person. The store answers a folder that
 * went missing while the window was open the same way it answers another window's save (src-tauri/src/workspace.rs
 * save_at: the revision it finds is not the one this window wrote), so a conflict covers both and says so.
 */
export function troubleKind(error: string): 'full' | 'conflict' | 'failed' {
  if (/no space left|os error 28|ENOSPC|disk (is )?full/i.test(error)) return 'full';
  if (/another window changed/i.test(error)) return 'conflict';
  return 'failed';
}

type Choice = {action: string; icon: string; name: string; why: string; first?: boolean};
const choice = (c: Choice) =>
  '<button type="button" class="ui-option notice-choice' + (c.first ? ' is-on' : '') + '" data-action="' + c.action + '"' + (c.first ? ' data-first-focus' : '') + '>'
  + '<span class="ui-option-icon">' + icon(c.icon, 'ui-icon') + '</span><span class="notice-choice-text"><span class="ui-option-name">' + c.name + '</span><span class="ui-option-why">' + c.why + '</span></span>'
  + icon('chevron-right', 'ui-icon ui-icon-sm') + '</button>';
const safe = (title: string, lines: string[]) =>
  '<div class="ui-banner ui-banner-ok notice-safe">' + icon('circle-check', 'ui-icon ui-icon-sm') + '<div class="ui-banner-body"><p class="ui-banner-title">' + title + '</p>'
  + lines.map(l => '<p class="ui-banner-text">' + l + '</p>').join('') + '</div></div>';
const foot = (note: string, later: string, first: boolean) =>
  '<div class="ui-modal-foot ui-modal-foot-plain notice-foot"><span class="ui-modal-foot-note">' + note + '</span>'
  + '<button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="close-modal"' + (first ? ' data-first-focus' : '') + '>' + later + '</button></div>';
const details = (summary: string, text: string) =>
  '<details class="ui-notice-details"><summary>' + summary + '</summary><pre class="ui-mono">' + esc(text) + '</pre></details>';

/**
 * The dialog for one trouble, as a title, a line under it and a body. The body says what is safe as the code makes
 * it so, offers only what the app can do now, and puts what loses nothing first. Where the person is decides what
 * there is to keep: off the editor no board is open, so the open board is not offered as a file.
 */
export function troubleDialog(t: Trouble, where: 'home' | 'editor', ko: boolean): {title: string; subtitle: string; body: string} {
  const T = (en: string, k: string) => (ko ? k : en);
  const later = T('Later', '나중에');
  const reopen = where === 'home'
    ? T('Closing this leaves a mark at the bottom left, which opens it again.', '닫아도 왼쪽 아래의 표시에서 다시 열 수 있어요.')
    : T('Closing this leaves a mark beside Preview, which opens it again.', '닫아도 미리보기 옆의 표시에서 다시 열 수 있어요.');
  if (t.kind === 'vanished') {
    const n = t.boards;
    return {
      title: T('We can’t find the folder your boards are kept in.', '보드를 모아 둔 폴더를 찾을 수 없어요.'),
      subtitle: T('Nothing has been deleted. If you moved the folder, put it back and look again.', '아무것도 지우지 않았어요. 폴더를 옮기셨다면 제자리에 돌려놓고 다시 찾아 주세요.'),
      body: safe(
        T('Last time, ' + n + ' board' + (n === 1 ? ' was' : 's were') + ' kept in this folder.', '마지막으로 열었을 때 이 폴더에 보드 ' + n + '개가 있었어요.'),
        [T('Where we looked', '찾던 곳') + ' <code class="ui-mono">' + esc(t.path) + '</code>',
         t.replaced
           ? T('This window has since saved into a new folder in the same place. The old folder has not been found.', '그 뒤로 이 창은 같은 자리에 새 폴더를 만들어 저장하고 있어요. 예전 폴더는 아직 찾지 못했어요.')
           : T('A change saved now starts a new folder in the same place, so it is safer to look for the old one first.', '지금 무언가를 저장하면 같은 자리에 새 폴더가 생겨요. 예전 폴더를 먼저 찾는 편이 안전해요.')],
      )
        + '<div class="ui-notice-choices">'
        + choice({action: 'disk-reload', icon: 'folder-open', name: T('Look for the folder again', '폴더 다시 찾기'), why: T('Press this once the folder is back where it was, or the drive it was on is plugged in.', '폴더를 제자리에 돌려놓았거나, 폴더가 있던 디스크를 다시 꽂았다면 눌러 주세요.')})
        + choice({action: 'disk-start-fresh', icon: 'plus', name: T('Start fresh', '새로 시작하기'), why: T('Saves a new, empty library here and leaves the old folder untouched wherever it is. You are asked once more.', '빈 보관함을 새로 저장해요. 예전 폴더는 지우지 않고 있는 자리에 그대로 둬요. 누르면 한 번 더 물어요.')})
        + '</div>' + foot(reopen, later, true),
    };
  }
  const recovery = choice({action: 'hub-recovery', icon: 'hard-drive', name: T('Save the files on disk as they are', '디스크에 있는 파일을 그대로 저장'), why: T('Copies what is stored now, untouched, so it can be recovered.', '지금 저장돼 있는 것을 손대지 않고 그대로 받아 둬요. 복구할 때 써요.'), first: t.kind === 'unread'});
  const reload = choice({action: 'disk-reload', icon: 'rotate-cw', name: T('Reload from disk', '디스크에서 다시 불러오기'),
    why: t.kind === 'full'
      ? T('Once there is room again, this opens the saved copy and saving starts again. Changes that were not saved are thrown away.', '공간을 비운 뒤에 누르면 저장된 것을 다시 열고 저장도 다시 시작해요. 저장하지 못한 변경은 버려져요.')
      : t.kind === 'unread'
        ? T('Reads the stored boards again. If they still cannot be read, this window keeps not saving.', '저장된 보드를 다시 읽어요. 여전히 읽지 못하면 이 창은 계속 저장하지 않아요.')
        : T('Opens the saved copy and saving starts again. Changes that were not saved are thrown away.', '저장된 것을 다시 열고 저장도 다시 시작해요. 저장하지 못한 변경은 버려져요.')});
  if (t.kind === 'unread') return {
    title: T('The saved boards could not be read.', '저장된 보드를 읽지 못했어요.'),
    subtitle: T('So that nothing is written over them, this window saves nothing until they can be read.', '그 위에 덮어쓰지 않도록, 읽을 수 있을 때까지 이 창은 아무것도 저장하지 않아요.'),
    body: safe(T('The stored files are left as they were.', '저장된 파일은 그대로 두었어요.'), [T('Keep a copy of them before trying anything else.', '다른 것을 해 보기 전에 그 파일을 먼저 받아 두세요.')])
      + '<div class="ui-notice-choices">' + recovery + reload + '</div>'
      + details(T('Details for a report', '알릴 때 붙일 자세한 내용'), t.detail)
      + foot(reopen, later, false),
  };
  const head = {
    full: [T('Your Mac is out of space, so the last change was not saved.', '이 Mac의 저장 공간이 가득 차서 마지막 변경을 저장하지 못했어요.'),
      T('This window has stopped saving, and writes nothing more until you reload.', '이 창은 저장을 멈췄고, 다시 불러오기 전까지는 디스크에 더 쓰지 않아요.')],
    conflict: [T('The saved copy changed under this window, so saving stopped.', '저장된 보드가 이 창이 알던 것과 달라져서 저장을 멈췄어요.'),
      T('A second window may have saved, or the folder may have moved. So that neither overwrites the other, this window writes nothing more until you reload.', '다른 창이 저장했거나 저장 폴더가 옮겨졌을 수 있어요. 서로 덮어쓰지 않도록, 다시 불러오기 전까지 이 창은 더 쓰지 않아요.')],
    failed: [T('The boards could not be saved to disk.', '보드를 디스크에 저장하지 못했어요.'),
      T('This window has stopped saving, and writes nothing more until you reload.', '이 창은 저장을 멈췄고, 다시 불러오기 전까지는 디스크에 더 쓰지 않아요.')],
  }[t.kind as 'full' | 'conflict' | 'failed'];
  const keep = where === 'editor'
    ? choice({action: 'disk-backup', icon: 'download', name: T('Save this board as a backup file', '이 보드를 백업 파일로 저장'), why: T('Keeps the open board, as it is on screen, in one file you can import again.', '화면에 열린 그대로의 보드를 파일 하나로 받아 둬요. 다시 가져올 수 있어요.'), first: true})
    : '';
  const all = choice({action: 'hub-backup', icon: 'archive', name: T('Save every board as a backup file', '모든 보드를 백업 파일로 저장'), why: T('Keeps everything this window holds in one file, the changes that were not saved included.', '이 창에 있는 모든 보드를, 저장하지 못한 변경까지 파일 하나로 받아 둬요.'), first: where !== 'editor'});
  return {
    title: head[0],
    subtitle: head[1],
    body: safe(T('What you did is still in this window.', '지금까지 한 일은 이 창에 그대로 있어요.'),
      [T('It is not on disk yet. Keep it as a file before you close the window or reload.', '아직 디스크에는 없어요. 창을 닫거나 다시 불러오기 전에 파일로 받아 두세요.')])
      + '<div class="ui-notice-choices">' + keep + all + (where === 'home' ? recovery : '') + reload + '</div>'
      + details(T('Details for a report', '알릴 때 붙일 자세한 내용'), t.detail)
      + foot(reopen, later, false),
  };
}

/** Asked before a reload throws away what this window could not save. It starts on keeping it. */
export function reloadConfirm(ko: boolean): {title: string; subtitle: string; body: string} {
  const T = (en: string, k: string) => (ko ? k : en);
  return {
    title: T('Throw away the changes that were not saved, and reload?', '저장하지 못한 변경을 버리고 다시 불러올까요?'),
    subtitle: T('Reloading opens what is saved on disk, and the changes this window could not save are gone. Saving a backup file first keeps them.', '다시 불러오면 디스크에 저장된 것이 열리고, 이 창이 저장하지 못한 변경은 사라져요. 먼저 백업 파일로 받아 두면 남길 수 있어요.'),
    body: '<div class="ui-modal-foot ui-modal-foot-plain" data-reload-confirm><button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="close-modal" data-first-focus>' + T('Keep them', '그대로 두기') + '</button>'
      + '<button type="button" class="ui-btn ui-btn-danger ui-btn-md" data-action="disk-reload">' + T('Throw away and reload', '버리고 다시 불러오기') + '</button></div>',
  };
}

/** The card: one, in one place, the lower left, staying until the person decides. `kind` names what it tells (the new version). */
export function noticeCardHtml(kind: string, state: string, inner: string): string {
  return '<div class="' + kind + ' ui-card ui-notice-card" role="status" aria-live="polite" data-state="' + esc(state) + '">' + inner + '</div>';
}

/** The mark that says saving stopped, and opens the dialog again. Nothing when nothing is wrong. */
export function troubleMarkHtml(t: Trouble | undefined, ko: boolean): string {
  if (!t) return '';
  const label = t.kind === 'vanished' ? (ko ? '폴더를 찾을 수 없음' : 'Folder not found') : (ko ? '저장 안 됨' : 'Not saved');
  return '<button type="button" class="ui-btn ui-btn-secondary ui-btn-md ui-notice-mark notice-mark-trouble" data-action="notice-open" title="' + (ko ? '무슨 일인지 다시 보기' : 'See what happened') + '">'
    + '<span class="ui-dot ui-dot-warn" aria-hidden="true"></span><span>' + label + '</span></button>';
}

export type ConnectState = {who: string; holder: string; holderMark?: string; writes: number; allowed: string; channel: string};
/**
 * The mark that says an agent may edit. Who is let in and how many changes they made are on the mark; what that
 * means, the channel, and the person's own Disconnect (agent-disconnect, src/agent/authority.ts doorActions) open
 * under it. The data-connect-* hooks are what a write updates in place (src/main.ts bumpConnect).
 */
export function connectMarkHtml(s: ConnectState, ko: boolean): string {
  const T = (en: string, k: string) => (ko ? k : en);
  const name = s.holder || s.who || T('An agent', '에이전트');
  return '<details class="ui-notice-mark notice-mark-connect connect-mark"><summary class="ui-btn ui-btn-secondary ui-btn-md">'
    + '<span class="ui-dot ui-dot-ok" aria-hidden="true"></span><span class="connect-mark-logo" data-connect-mark>' + (s.holderMark ?? '') + '</span>'
    + '<b data-connect-who>' + esc(name) + '</b><span class="ui-row-meta">' + T('changes', '변경') + ' <b data-connect-writes>' + s.writes + '</b></span></summary>'
    + '<div class="ui-popover notice-pop" role="group" aria-label="' + T('Connected agent', '연결된 에이전트') + '">'
    + '<p class="ui-popover-title">' + T('An agent may edit alongside you.', '에이전트가 함께 고칠 수 있어요.') + '</p>'
    + '<p class="ui-popover-text">' + T('You keep the screen. ⌘Z takes back an agent’s change like your own.', '화면은 그대로 쓰시면 돼요. 에이전트가 고친 것도 ⌘Z로 되돌려요.') + '</p>'
    + '<dl class="ui-notice-facts"><dt>' + T('Allowed', '허용') + '</dt><dd>' + esc(s.allowed || T('none', '없음')) + '</dd><dt>' + T('Channel', '채널') + '</dt><dd><code class="ui-mono">' + esc(s.channel) + '</code></dd></dl>'
    + '<div class="ui-popover-foot"><button type="button" class="ui-btn ui-btn-secondary" data-action="agent-disconnect">' + icon('unplug', 'ui-icon ui-icon-sm') + T('Disconnect', '연결 끊기') + '</button></div></div></details>';
}

/**
 * The sheet for a screen that could not be drawn. It is built without the app's state, because the app may be what
 * broke: board says whether a board is open, so it can be offered as a file. The words the system gave are folded
 * away with a copy button, for a report.
 */
export function renderFailedHtml(detail: string, o: {ko: boolean; board: boolean}): string {
  const T = (en: string, k: string) => (o.ko ? k : en);
  return '<div class="ui-scrim fatal-scrim"><section class="ui-modal ui-modal-md fatal-sheet" role="alertdialog" aria-modal="true" aria-labelledby="fatal-title">'
    + '<div class="ui-modal-body"><span class="ui-option-icon fatal-icon">' + icon('circle-alert', 'ui-icon') + '</span>'
    + '<h2 id="fatal-title" class="ui-modal-title">' + T('The screen stopped drawing.', '화면을 그리다가 멈췄어요.') + '</h2>'
    + '<p class="ui-modal-text">' + T('Your boards are in this window as they were. Draw the screen again, and if it stops again, keep the boards as a file first.', '보드는 이 창에 그대로 있어요. 화면을 다시 그려 보시고, 또 멈추면 보드를 먼저 파일로 받아 두세요.') + '</p>'
    + '<div class="fatal-actions"><button type="button" class="ui-btn ui-btn-primary ui-btn-md" data-action="fatal-redraw">' + icon('rotate-cw', 'ui-icon ui-icon-sm') + T('Draw again', '다시 그리기') + '</button>'
    + (o.board ? '<button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="disk-backup">' + icon('download', 'ui-icon ui-icon-sm') + T('Save this board as a file', '보드를 파일로 저장') + '</button>' : '')
    + '<button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="hub-backup">' + icon('archive', 'ui-icon ui-icon-sm') + T('Save every board', '모든 보드 저장') + '</button></div>'
    + '<details class="ui-notice-details"><summary>' + T('Details for a report', '알릴 때 붙일 자세한 내용') + '</summary><pre class="ui-mono" data-fatal-detail>' + esc(detail) + '</pre>'
    + '<button type="button" class="ui-btn ui-btn-quiet" data-action="fatal-copy">' + icon('copy', 'ui-icon ui-icon-sm') + T('Copy', '복사') + '</button></details>'
    + '<button type="button" class="ui-icon-btn fatal-close" data-action="fatal-close" aria-label="' + T('Close', '닫기') + '">' + icon('x', 'ui-icon') + '</button>'
    + '</div></section></div>';
}
