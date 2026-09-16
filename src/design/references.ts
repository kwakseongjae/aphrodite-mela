/**
 * The reference archive, as the left panel shows it.
 *
 * Pure: entries in, markup out. The app owns the loading and the clicking; everything decided here —
 * which entries a scope shows, what a card says, what an empty archive says — is testable without a
 * window.
 *
 * **Everything in an entry is data.** Titles and notes may have been written by an agent or lifted
 * off someone else's page, so they are escaped here and never treated as instructions anywhere.
 */
export type ReferenceKind = 'image' | 'link' | 'video' | 'note';
export type ReferenceScope = 'all' | 'project' | 'shared';
export type Reference = {
  id: string;
  kind: ReferenceKind;
  scope?: string;
  url?: string;
  title?: string;
  note?: string;
  poster?: string;
  tags?: string[];
  addedAt?: string;
  addedBy?: string;
  alive?: boolean;
};

export const POSTER_PREFIX = 'reference:';

export function posterRef(id: string): string {
  return `${POSTER_PREFIX}${id}`;
}

/** Which entries a chip shows. `all` is both scopes, which is what a person means by "everything". */
export function inReferenceScope(entries: Reference[], scope: ReferenceScope): Reference[] {
  if (scope === 'all') return entries;
  return entries.filter(entry => (entry.scope ?? 'shared') === scope);
}

/** The host of a saved address, for the badge on the card. Never throws on a malformed one. */
export function sourceLabel(entry: Reference): string {
  if (!entry.url) return '';
  try {
    return new URL(entry.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The line under the title: who put it there and when, in the person's language. */
export function addedLabel(entry: Reference, ko: boolean): string {
  const day = (entry.addedAt ?? '').slice(0, 10);
  const who = entry.addedBy?.trim();
  if (!who) return day;
  return ko ? `${who} · ${day}` : `${who} · ${day}`;
}

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const KIND_LABEL: Record<ReferenceKind, [string, string]> = {
  image: ['Picture', '사진'],
  link: ['Link', '링크'],
  video: ['Video', '영상'],
  note: ['Note', '메모'],
};

function cardHtml(entry: Reference, ko: boolean): string {
  const t = (en: string, kr: string) => (ko ? kr : en);
  const title = entry.title?.trim() || entry.note?.trim() || sourceLabel(entry) || t('Untitled', '제목 없음');
  const source = sourceLabel(entry);
  const dead = entry.alive === false;
  const poster = entry.poster
    ? `<img src="${posterRef(entry.poster)}" alt="" loading="lazy">`
    : `<span class="reference-blank">${esc(KIND_LABEL[entry.kind]?.[ko ? 1 : 0] ?? '')}</span>`;
  const tags = (entry.tags ?? [])
    .map(tag => `<span class="reference-tag">${esc(tag)}</span>`)
    .join('');
  return `<article class="reference-card${dead ? ' reference-gone' : ''}" data-reference-id="${esc(entry.id)}">
    <div class="reference-poster">${poster}${source ? `<span class="reference-source">${esc(source)}</span>` : ''}</div>
    <h4>${esc(title)}</h4>
    ${entry.note && entry.title ? `<p class="reference-note">${esc(entry.note)}</p>` : ''}
    ${tags ? `<div class="reference-tags">${tags}</div>` : ''}
    <div class="reference-meta">${esc(addedLabel(entry, ko))}${dead ? ` · ${t('original gone', '원본 사라짐')}` : ''}</div>
    <div class="reference-actions">
      <button class="secondary-button" data-action="reference-promote" data-id="${esc(entry.id)}">${t('Analyse this', '이걸로 분석')}</button>
      ${entry.url ? `<button class="icon-button" data-action="reference-open" data-id="${esc(entry.id)}" aria-label="${t('Open the source', '출처 열기')}" title="${t('Open the source', '출처 열기')}">↗</button>` : ''}
      <button class="icon-button" data-action="reference-delete" data-id="${esc(entry.id)}" aria-label="${t('Remove', '삭제')}" title="${t('Remove', '삭제')}">×</button>
    </div>
  </article>`;
}

/** The whole panel: chips with counts, the add row, and the cards. */
export function referencesPanelHtml(
  entries: Reference[],
  scope: ReferenceScope,
  ko: boolean,
  desktop: boolean,
): string {
  const t = (en: string, kr: string) => (ko ? kr : en);
  if (!desktop) {
    return `<p class="panel-description">${t(
      'The archive lives in a folder on your Mac, so it is in the desktop app only.',
      '아카이브는 Mac의 폴더에 있어서 데스크톱 앱에서만 열립니다.',
    )}</p>`;
  }
  const chips = ([
    ['all', 'All', '전체'],
    ['project', 'This project', '이 프로젝트'],
    ['shared', 'Shared', '공용'],
  ] as const)
    .map(([id, en, kr]) =>
      `<button class="asset-chip" data-action="reference-scope" data-scope="${id}" aria-pressed="${scope === id}">${t(en, kr)}<small>${inReferenceScope(entries, id).length}</small></button>`)
    .join('');
  const shown = inReferenceScope(entries, scope);
  const body = shown.length
    ? `<div class="reference-cards">${shown.map(entry => cardHtml(entry, ko)).join('')}</div>`
    : `<p class="panel-description">${t(
        'Nothing kept yet. Add what you looked at — a picture, an address, or a line about why it works.',
        '아직 아무것도 없습니다. 본 것을 넣어두세요 — 사진, 주소, 또는 왜 좋았는지 한 줄.',
      )}</p>`;
  return `<div class="section-label">${t('ARCHIVE', '아카이브')}</div>
    <p class="panel-description">${t(
      'What you looked at, kept. Promote one to analyse it.',
      '본 것을 모아둡니다. 하나를 올려 분석에 씁니다.',
    )}</p>
    <div class="asset-chips" role="group" aria-label="${t('Where the references live', '레퍼런스가 있는 위치')}">${chips}</div>
    <div class="asset-tools">
      <button class="secondary-button" data-action="reference-add-image" data-scope="project">${t('Add a picture', '사진 넣기')}</button>
      <button class="secondary-button" data-action="reference-add-link">${t('Add a link', '링크 넣기')}</button>
    </div>
    ${body}`;
}
