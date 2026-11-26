/**
 * 0.3-L4b: what a board shows of its pages. Every project is made with a section page, and the model keeps it (a project
 * always has a page). A new board marks that page (`Project.starter`, 0.3-L4-3 fix 1): while the mark holds it is not
 * drawn, not listed, and takes no place on the board, so a new board looks empty; the section tools show only once the
 * board has a section page to use them on. The mark is not design: the fingerprint, the revision, the ledger and undo
 * leave it out, as they leave out `leftOut`. A board without it (an older one, one received without it, the sample)
 * hides nothing.
 */
import {currentPage, initialProject, MAX_PAGES, type Page, type Project} from '../model';
import {clip} from '../text';
import {frameWidth, nextFramePosition, type FrameLayout, type FramePreset, type Space} from './space';

/** A new board, as the new-project form makes one: its one section page empty, and marked. */
export function newBoard(name: string): Project {
  const p = initialProject();
  p.name = clip(name, 100); p.brief = ''; p.pages[0].blocks = [];
  p.starter = p.pages[0].id;
  return p;
}
/** The marked page, while it is still an empty section page. */
export function isStarterPage(project: Pick<Project, 'starter'>, page: Page): boolean {
  return project.starter === page.id && page.kind === undefined && !page.blocks.length;
}
/** The pages the board draws and lists, in page order. */
export function visiblePages(project: Pick<Project, 'pages' | 'starter'>): Page[] {
  return project.pages.filter(p => !isStarterPage(project, p));
}
/** The one condition the section tools are shown on: a section page the person can see. */
export function hasSectionPage(project: Pick<Project, 'pages' | 'starter'>): boolean {
  return visiblePages(project).some(p => p.kind === undefined);
}
/** What the screen means by "this page" (preview, export): the open page when it shows, else the first that does. The board's open page is left as it is. */
export function shownPage(project: Pick<Project, 'pages' | 'starter' | 'activePageId'>): Page {
  const open = currentPage(project as Project);
  return isStarterPage(project, open) ? visiblePages(project)[0] ?? open : open;
}
/** The page to open once the open one is gone: the first the board shows, else the first there is. */
export function firstShown(project: Pick<Project, 'pages' | 'starter'>): Page {
  return visiblePages(project)[0] ?? project.pages[0];
}
/** The board as placing the next item reads it: every frame but the starter's, which is not there to the eye. */
export function placementSpace(project: Pick<Project, 'pages' | 'starter' | 'space'>): Space {
  const frames: Space['frames'] = {};
  for (const page of visiblePages(project)) {
    const frame = project.space?.frames[page.id];
    if (frame) frames[page.id] = frame;
  }
  return {frames};
}
/** The person going to the hidden page (Edit in the app, a link to it on the board): it shows from then on. True when it was hidden. */
export function revealStarter(project: Pick<Project, 'starter'>, id: string): boolean {
  if (project.starter !== id) return false;
  delete project.starter;
  return true;
}
/** What a full board says (MAX_PAGES counts every page): while the hidden page holds one of the places, that too. */
export function fullBoard(project: Pick<Project, 'pages' | 'starter'>, ko: boolean): string {
  const t = (en: string, kr: string) => ko ? kr : en;
  const limit = t(`A project holds at most ${MAX_PAGES} pages and media items.`, `한 프로젝트에는 페이지와 미디어를 합쳐 ${MAX_PAGES}개까지 둘 수 있습니다.`);
  return project.pages.some(p => isStarterPage(project, p)) ? `${limit} ${t('One place is held by the empty page every new board starts with, which the board does not show.', '새 보드가 처음부터 가진 빈 페이지 하나가 보이지 않게 한 자리를 차지합니다.')}` : limit;
}
/** Where a new frame goes, whoever makes it: right of the frames the board shows, on their top row. */
export function placeFrame(project: Pick<Project, 'pages' | 'starter' | 'space'>, preset: FramePreset, width?: number): FrameLayout {
  return nextFramePosition(placementSpace(project), preset, width);
}
/** A frame for each page that has none yet (a page added, copied, drafted, a sample), placed as every new frame is. A frame a board already has stays where it is. */
export function placeNewFrames(project: Pick<Project, 'pages' | 'starter' | 'space'>): void {
  project.space ??= {frames: {}};
  for (const page of project.pages) if (!project.space.frames[page.id]) project.space.frames[page.id] = placeFrame(project, 'desktop');
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const box = (f: FrameLayout) => ({x: f.x, y: f.y, right: f.x + frameWidth(f), bottom: f.height === undefined ? Infinity : f.y + f.height});
/**
 * Where a change leaves the mark, `before` being the board as the change found it. A change that reaches the marked page
 * (a section, its name, its frame's size or place) or takes it away drops the mark, as does the person going to it (revealStarter), and it does not come back: an undo
 * of that change leaves the page showing. A page that shows where another frame already sits is put beside the frames,
 * in the same change. True when the mark was dropped.
 */
export function settleStarter(before: Pick<Project, 'pages' | 'space' | 'starter'>, after: Project): boolean {
  const id = before.starter;
  if (id === undefined) return false;
  const was = before.pages.find(p => p.id === id), now = after.pages.find(p => p.id === id), frame = before.space?.frames[id];
  if (after.starter === id && was && now && same(was, now) && (frame === undefined || same(frame, after.space?.frames[id]))) return false;
  delete after.starter;
  if (now) placeRevealed(after, id);
  return true;
}
/** A shown starter keeps a free spot even when history restores a layout from when it was hidden. */
export function placeRevealed(after: Project, id: string): void {
  const at = after.space?.frames[id];
  if (!at) return;
  const others = Object.fromEntries(Object.entries(after.space!.frames).filter(([k]) => k !== id)), mine = box(at);
  if (Object.values(others).some(f => { const o = box(f); return mine.x < o.right && o.x < mine.right && mine.y < o.bottom && o.y < mine.bottom; })) {
    const spot = nextFramePosition({frames: others}, at.preset as FramePreset, at.width);
    after.space!.frames[id] = {...at, x: spot.x, y: spot.y};
  }
}
