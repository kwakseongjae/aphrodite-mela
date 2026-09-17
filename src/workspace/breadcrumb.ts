/**
 * A note to ourselves about the folder we save into, kept somewhere else.
 *
 * Moving the data folder loses nothing — put it back and everything returns — but the app cannot
 * tell that from a first launch. `workspace_read` answers a missing file with
 * `{revision:0, data:null}`, which is the truth and is also exactly what a new install looks like.
 * So a person with eighteen projects opens the app and is welcomed as a stranger, and the reasonable
 * conclusion is that their work is gone.
 *
 * The fix is a breadcrumb: after a save we write down where we saved, at which revision, and how
 * much was in it. localStorage lives under `~/Library/WebKit`, a different root from
 * `app_data_dir()`, so it survives the data folder being moved — which is the whole reason it can
 * answer the question the data folder no longer can.
 *
 * It is deliberately not a backup and holds no project data. It holds enough to say "you had 18
 * projects here" and nothing anyone would mind losing.
 */
export type Breadcrumb = {
  /** Where the store was, as the app reported it — shown to the person so they can go look. */
  path: string;
  revision: number;
  entries: number;
  /** ISO day, so the notice can say when we last saw it. */
  at: string;
};

export const BREADCRUMB_KEY = 'aphrodite-disk-breadcrumb-v1';

type Slot = {getItem(key: string): string | null; setItem(key: string, value: string): void};

/** Never throws: a breadcrumb we cannot read is the same as not having one. */
export function readBreadcrumb(storage: Slot): Breadcrumb | undefined {
  try {
    const raw = storage.getItem(BREADCRUMB_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Breadcrumb>;
    if (typeof parsed?.path !== 'string' || typeof parsed?.entries !== 'number') return undefined;
    if (!Number.isFinite(parsed.entries) || parsed.entries < 0) return undefined;
    return {
      path: parsed.path,
      revision: Number.isFinite(parsed.revision) ? Number(parsed.revision) : 0,
      entries: parsed.entries,
      at: typeof parsed.at === 'string' ? parsed.at : '',
    };
  } catch {
    return undefined;
  }
}

/** Never throws either: a full disk must not take the app down on the way past a save. */
export function writeBreadcrumb(storage: Slot, crumb: Breadcrumb): void {
  try {
    storage.setItem(BREADCRUMB_KEY, JSON.stringify(crumb));
  } catch {
    /* a breadcrumb is a convenience; losing it costs a worse message, not data */
  }
}

/**
 * Has the store we remember gone missing?
 *
 * Only when the disk is genuinely empty *and* we remember saving something into it. An empty
 * breadcrumb — zero entries — is not worth a warning: nothing was there to lose, and a person who
 * opened the app once and never made anything should get the welcome, not an alarm.
 *
 * Returns the breadcrumb, because the notice wants to say what it remembers.
 */
export function storeVanished(
  disk: {data: string | null},
  crumb: Breadcrumb | undefined,
): Breadcrumb | undefined {
  if (disk.data !== null) return undefined;
  if (!crumb || crumb.entries < 1) return undefined;
  return crumb;
}

/** What to write down after a save landed. Pure so the counting is testable. */
export function crumbFor(path: string, revision: number, entries: number, now: Date): Breadcrumb {
  return {path, revision, entries, at: now.toISOString().slice(0, 10)};
}

/**
 * The notice, in the person's language.
 *
 * It says the path, because the fix is almost always "the folder moved" and they are the only one
 * who can put it back. It does not offer to rebuild anything: the one dangerous action here is
 * writing a fresh empty store over the situation, and that stays behind an explicit press.
 */
export function vanishedHtml(crumb: Breadcrumb, ko: boolean): string {
  const t = (en: string, kr: string) => (ko ? kr : en);
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const count = crumb.entries;
  return `<div class="folio-warning disk-vanished" role="alert">
    <div>
      <strong>${t('Your saved folder is not where it was.', '저장 폴더가 있던 자리에 없습니다.')}</strong>
      <p>${t(
        `Nothing has been deleted. Last time, ${count} project${count === 1 ? '' : 's'} were saved here:`,
        `아무것도 지워지지 않았습니다. 마지막에 이곳에 ${count}개의 프로젝트가 저장돼 있었습니다:`,
      )}</p>
      <code>${esc(crumb.path)}</code>
      <p>${t(
        'If you moved it, put it back and press Look again. Starting fresh will leave the old folder untouched wherever it is.',
        '옮기셨다면 제자리에 돌려놓고 다시 확인을 누르세요. 새로 시작해도 예전 폴더는 그대로 남습니다.',
      )}</p>
    </div>
    <div class="folio-warning-actions">
      <button data-action="disk-reload">${t('Look again', '다시 확인')}</button>
      <button data-action="disk-start-fresh" class="secondary-button">${t('Start fresh', '새로 시작')}</button>
    </div>
  </div>`;
}
