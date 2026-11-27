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
  | {kind: 'empty'; path: string}
  | {kind: 'full' | 'conflict' | 'failed' | 'unread'; detail: string; retries?: boolean};

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
export type TroubleFacts = {native?: boolean; reimport?: boolean; windowBoards?: number};
export function backupFormat(ko:boolean){
  return ko?'보드 가져오기가 읽는 형식의 파일이에요(승인은 다시 해야 해요).':'It is in the format Import board reads (approvals have to be given again).';
}

export function troubleDialog(t: Trouble, where: 'home' | 'editor' | 'page', ko: boolean, o: TroubleFacts = {}): {title: string; subtitle: string; body: string} {
  // A page seen on its own covers the editor: the board is open there too, and its mark sits beside Edit in the app.
  const board = where !== 'home';
  // What the app knows and can do here: the browser build reads no disk, so it never offers a reload (src/main.ts reloadFromDisk).
  const native = o.native ?? true;
  const T = (en: string, k: string) => (ko ? k : en);
  const later = T('Later', '나중에');
  const reopen = where === 'home'
    ? T('Closing this leaves a mark at the bottom left, which opens it again.', '닫아도 왼쪽 아래의 표시에서 다시 열 수 있어요.')
    : where === 'page'
      ? T('Closing this leaves a mark beside Edit in the app, which opens it again.', '닫아도 "앱에서 편집" 옆의 표시에서 다시 열 수 있어요.')
      : T('Closing this leaves a mark beside Preview, which opens it again.', '닫아도 미리보기 옆의 표시에서 다시 열 수 있어요.');
  if (t.kind === 'vanished') {
    const n = t.boards;
    return {
      title: T('We can’t find the folder your boards are kept in.', '보드를 모아 둔 폴더를 찾을 수 없어요.'),
      subtitle: T('The app has deleted nothing. If you moved the folder, put it back and look again.', '앱은 아무것도 지우지 않았어요. 폴더를 옮기셨다면 제자리에 돌려놓고 다시 찾아 주세요.'),
      body: safe(
        T('Last time, ' + n + ' board' + (n === 1 ? ' was' : 's were') + ' kept in this folder.', '마지막으로 열었을 때 이 폴더에 보드 ' + n + '개가 있었어요.'),
        [T('Where we looked', '찾던 곳') + ' <code class="ui-mono">' + esc(t.path) + '</code>',
         t.replaced
           ? T('This window has since saved into a new folder in the same place. The old folder has not been found.', '그 뒤로 이 창은 같은 자리에 새 폴더를 만들어 저장하고 있어요. 예전 폴더는 아직 찾지 못했어요.')
           : T('A change saved now starts a new folder in the same place, so it is safer to look for the old one first.', '지금 무언가를 저장하면 같은 자리에 새 폴더가 생겨요. 예전 폴더를 먼저 찾는 편이 안전해요.')],
      )
        + '<div class="ui-notice-choices">'
        + choice({action: 'disk-reload', icon: 'folder-open', name: T('Look for the folder again', '폴더 다시 찾기'), why: T('Press this once the folder is back where it was, or once the drive it was on is plugged in.', '폴더를 제자리에 돌려놓았거나, 폴더가 있던 디스크를 다시 꽂았다면 눌러 주세요.')})
        + choice({action: 'disk-start-fresh', icon: 'plus', name: T('Start fresh', '새로 시작하기'), why: t.replaced
          ? T('This saves what this window holds in the folder this window made in that place. The app does not delete the old folder. You are asked once more.', '이 창에 있는 것을 이 창이 그 자리에 만든 폴더에 저장해요. 예전 폴더는 앱이 지우지 않아요. 누르면 한 번 더 물어요.')
          : o.windowBoards === undefined
          ? T('This saves what this window holds in a new folder in that place. The app does not delete the old folder. You are asked once more.', '이 창에 있는 것을 그 자리에 새 폴더로 저장해요. 예전 폴더는 앱이 지우지 않아요. 누르면 한 번 더 물어요.')
          : T('This saves what this window holds (' + o.windowBoards + ' board' + (o.windowBoards === 1 ? '' : 's') + ') in a new folder in that place. The app does not delete the old folder. You are asked once more.', '이 창에 있는 것(보드 ' + o.windowBoards + '개)을 그 자리에 새 폴더로 저장해요. 예전 폴더는 앱이 지우지 않아요. 누르면 한 번 더 물어요.')})
        + '</div>' + foot(reopen, later, true),
    };
  }
  const recovery = choice({action: 'hub-recovery', icon: 'hard-drive', name: T('Save the files on disk as they are', '디스크에 있는 파일을 그대로 저장'), why: native
      ? T('This copies the list of boards saved on disk, and the save before it if there is one, untouched, into one file. Pictures and videos placed on the board by themselves, and pictures from the image library, are separate files and are not in it.', '디스크에 저장된 보드 목록과, 있다면 그 직전 저장본을 손대지 않고 파일 하나로 받아요. 보드에 따로 놓은 그림·영상과 이미지 라이브러리의 그림은 별도 파일이라 들어 있지 않아요.')
      : T('This copies the boards this browser keeps, untouched, into one file. Pictures and videos placed on the board by themselves, and pictures from the image library, are separate files and are not in it.', '이 브라우저가 보관한 보드를 손대지 않고 파일 하나로 받아요. 보드에 따로 놓은 그림·영상과 이미지 라이브러리의 그림은 별도 파일이라 들어 있지 않아요.'), first: t.kind === 'unread'});
  const reload = choice({action: 'disk-reload', icon: 'rotate-cw', name: T('Reload from disk', '디스크에서 다시 불러오기'),
    why: 'retries' in t && t.retries
      ? T('This goes back to what was last saved on disk. Unsaved changes are thrown away, and you are asked first.', '디스크에 저장된 마지막 상태로 돌아가요. 저장하지 못한 변경은 버려지고, 그 전에 한 번 더 물어요.')
      : t.kind === 'full'
      ? T('Once there is room again, this opens what is saved on disk, and the next change tries saving again. Changes that were not saved are thrown away, and you are asked first.', '공간을 비운 뒤에 누르면 디스크에 저장된 것을 다시 열고, 다음 변경부터 다시 저장해 봐요. 저장하지 못한 변경은 버려지고, 그 전에 한 번 더 물어요.')
      : t.kind === 'unread'
        ? T('This reads the stored boards again. If they still cannot be read, this window goes on saving nothing.', '저장된 보드를 다시 읽어요. 여전히 읽지 못하면 이 창은 계속 아무것도 저장하지 않아요.')
        : T('This opens what is saved on disk, and the next change tries saving again. Changes that were not saved are thrown away, and you are asked first.', '디스크에 저장된 것을 다시 열고, 다음 변경부터 다시 저장해 봐요. 저장하지 못한 변경은 버려지고, 그 전에 한 번 더 물어요.')});
  const reloads = native ? reload : '';
  if (t.kind === 'empty') return {
    title: T('There is no copy of this window’s boards on disk.', '디스크에 이 창의 보드를 저장한 사본이 없어요.'),
    subtitle: T('Looking again found nothing saved where they are kept. Keep what you did as a file before you close the window.', '다시 찾아봤지만 보드를 두는 곳에 저장된 것이 없었어요. 창을 닫기 전에 한 일을 파일로 받아 두세요.'),
    body: safe(T('What you did is still in this window.', '지금까지 한 일은 이 창에 그대로 있어요.'), [T('Where we looked', '찾던 곳') + ' <code class="ui-mono">' + esc(t.path) + '</code>'])
      + '<div class="ui-notice-choices">'
      + (board ? choice({action: 'disk-backup', icon: 'download', name: T('Save this board as a backup file', '이 보드를 백업 파일로 저장'), why: T('This saves the open board, as it is on screen, as one .json file.', '화면에 열린 그대로의 보드를 .json 파일 하나로 받아요.'), first: true}) : '')
      + choice({action: 'hub-backup', icon: 'archive', name: T('Save every board as a backup file', '모든 보드를 백업 파일로 저장'), why: T('This saves every board in this window, as it is now, as one file to keep. It is not a file Import board opens.', '이 창의 모든 보드를 지금 그대로 파일 하나로 받아 둬요. 보드 가져오기로 여는 파일은 아니에요.'), first: !board})
      + (native ? choice({action: 'disk-reload', icon: 'folder-open', name: T('Look for the folder again', '폴더 다시 찾기'), why: T('Press this once the folder is back where it was. What this window holds is thrown away by that, and you are asked first.', '폴더를 제자리에 돌려놓았다면 눌러 주세요. 그러면 이 창의 일은 버려지고, 그 전에 한 번 더 물어요.')}) : '')
      + '</div>' + foot(reopen, later, false),
  };
  if (t.kind === 'unread') return {
    title: T('The saved boards could not be read.', '저장된 보드를 읽지 못했어요.'),
    subtitle: T('So that nothing is written over them, this window saves nothing until they can be read.', '그 위에 덮어쓰지 않도록, 읽을 수 있을 때까지 이 창은 아무것도 저장하지 않아요.'),
    body: safe(T('This window has written nothing over the stored boards.', '이 창은 저장된 보드 위에 아무것도 쓰지 않았어요.'), [T('Keep a copy of them before trying anything else.', '다른 것을 해 보기 전에 그 파일을 먼저 받아 두세요.')])
      + '<div class="ui-notice-choices">' + recovery + reloads + '</div>'
      + details(T('Details for a report', '알릴 때 붙일 자세한 내용'), t.detail)
      + foot(reopen, later, false),
  };
  const head = {
    full: [T('The disk the boards are saved on is out of space, so the last change was not saved.', '보드를 저장하는 디스크의 공간이 가득 차서 마지막 변경을 저장하지 못했어요.'),
      T('This window has stopped saving, and saves no more boards to disk until you reload.', '이 창은 저장을 멈췄고, 다시 불러오기 전까지는 보드를 디스크에 더 저장하지 않아요.')],
    conflict: [T('The saved copy changed under this window, so saving stopped.', '저장된 보드가 이 창이 알던 것과 달라져서 저장을 멈췄어요.'),
      T('A second window may have saved, or the folder may have moved. So that neither overwrites the other, this window saves no more boards to disk until you reload.', '다른 창이 저장했거나 저장 폴더가 옮겨졌을 수 있어요. 서로 덮어쓰지 않도록, 다시 불러오기 전까지 이 창은 보드를 디스크에 더 저장하지 않아요.')],
    failed: [T('The boards could not be saved to disk.', '보드를 디스크에 저장하지 못했어요.'),
      T('This window has stopped saving, and saves no more boards to disk until you reload.', '이 창은 저장을 멈췄고, 다시 불러오기 전까지는 보드를 디스크에 더 저장하지 않아요.')],
  }[t.kind as 'full' | 'conflict' | 'failed'];
  // Refused before it reached the disk (a board too big to save, say): nothing has stopped, and the next change tries again.
  if (t.retries) head[1] = T('The next change tries saving again. Until one is saved, what you did since is only in this window.', '다음 변경 때 다시 저장해 봐요. 저장되기 전까지 그동안 한 일은 이 창에만 있어요.');
  const keep = board
    ? choice({action: 'disk-backup', icon: 'download', name: T('Save this board as a backup file', '이 보드를 백업 파일로 저장'), why: T('This saves the open board, as it is on screen, as one .json file. Pictures and videos placed on the board by themselves, and pictures from the image library, are separate files and are not in it.', '화면에 열린 그대로의 보드를 .json 파일 하나로 받아요. 보드에 따로 놓은 그림·영상과 이미지 라이브러리의 그림은 별도 파일이라 들어 있지 않아요.')
      + '<span data-backup-format>' + (o.reimport ? ' ' + backupFormat(ko) : '') + '</span>', first: true})
    : '';
  const all = choice({action: 'hub-backup', icon: 'archive', name: T('Save every board as a backup file', '모든 보드를 백업 파일로 저장'), why: T('This saves every board in this window, with the changes the disk did not take, as one file to keep. Pictures and videos placed on the board by themselves, and pictures from the image library, are separate files and are not in it. It is not a file Import board opens.', '이 창의 모든 보드를, 디스크가 받지 못한 변경까지 파일 하나로 받아 둬요. 보드에 따로 놓은 그림·영상과 이미지 라이브러리의 그림은 별도 파일이라 들어 있지 않아요. 보드 가져오기로 여는 파일은 아니에요.'), first: !board});
  return {
    title: head[0],
    subtitle: head[1],
    body: safe(T('What you did is still in this window.', '지금까지 한 일은 이 창에 그대로 있어요.'),
      [T('The changes since the last save are not on disk. Keep them as a file before you close the window or reload.', '마지막 저장 뒤의 변경은 디스크에 없어요. 창을 닫거나 다시 불러오기 전에 파일로 받아 두세요.')])
      + '<div class="ui-notice-choices">' + keep + all + (where === 'home' ? recovery : '') + reloads + '</div>'
      + details(T('Details for a report', '알릴 때 붙일 자세한 내용'), t.detail)
      + foot(reopen, later, false),
  };
}

/** Asked before a reload throws away what this window could not save. It starts on keeping it. */
export function reloadConfirm(ko: boolean, generation: number): {title: string; subtitle: string; body: string} {
  const T = (en: string, k: string) => (ko ? k : en);
  return {
    title: T('Throw away the changes that were not saved, and reload?', '저장하지 못한 변경을 버리고 다시 불러올까요?'),
    subtitle: T('Reloading opens what is saved on disk, and the changes this window could not save are gone. Saving a backup file first keeps them.', '다시 불러오면 디스크에 저장된 것이 열리고, 이 창이 저장하지 못한 변경은 사라져요. 먼저 백업 파일로 받아 두면 남길 수 있어요.'),
    body: '<div class="ui-modal-foot ui-modal-foot-plain" data-reload-confirm><button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="close-modal" data-first-focus>' + T('Keep them', '그대로 두기') + '</button>'
      + '<button type="button" class="ui-btn ui-btn-danger ui-btn-md" data-action="disk-reload" data-discard-generation="' + generation + '">' + T('Throw away and reload', '버리고 다시 불러오기') + '</button></div>',
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

export type ConnectState = {holderMark?: string; writes: number; allowed: string; channel: string};
/**
 * The mark that says an agent may edit. Who is let in and how many changes they made are on the mark; what that
 * means, the channel, and the person's own Disconnect (agent-disconnect, src/agent/authority.ts doorActions) open
 * under it. The data-connect-* hooks are what a write updates in place (src/main.ts bumpConnect).
 */
export function connectMarkHtml(s: ConnectState, ko: boolean): string {
  const T = (en: string, k: string) => (ko ? k : en);
  const name = s.allowed || T('An agent', '에이전트');
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
    + '<p class="ui-modal-text">' + T('Try drawing it again. If it stops again, keep the boards as a file first.', '화면을 다시 그려 보세요. 또 멈추면 보드를 먼저 파일로 받아 두세요.') + '</p>'
    + '<div class="fatal-actions"><button type="button" class="ui-btn ui-btn-primary ui-btn-md" data-action="fatal-redraw">' + icon('rotate-cw', 'ui-icon ui-icon-sm') + T('Draw again', '다시 그리기') + '</button>'
    + (o.board ? '<button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="fatal-backup">' + icon('download', 'ui-icon ui-icon-sm') + T('Save this board as a file', '보드를 파일로 저장') + '</button>' : '')
    + '<button type="button" class="ui-btn ui-btn-secondary ui-btn-md" data-action="fatal-backup-all">' + icon('archive', 'ui-icon ui-icon-sm') + T('Save every board', '모든 보드 저장') + '</button></div>'
    + '<details class="ui-notice-details"><summary>' + T('Details for a report', '알릴 때 붙일 자세한 내용') + '</summary><pre class="ui-mono" data-fatal-detail><span data-fatal-cause>' + esc(detail) + '</span><span data-fatal-error></span></pre>'
    + '<button type="button" class="ui-btn ui-btn-quiet" data-action="fatal-copy">' + icon('copy', 'ui-icon ui-icon-sm') + T('Copy', '복사') + '</button></details>'
    + '<p class="ui-modal-text" role="status" data-fatal-status hidden></p>'
    + '<button type="button" class="ui-icon-btn fatal-close" data-action="fatal-close" aria-label="' + T('Close', '닫기') + '">' + icon('x', 'ui-icon') + '</button>'
    + '</div></section></div>';
}
