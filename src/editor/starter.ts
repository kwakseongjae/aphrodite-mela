/**
 * 0.3-L4b: what a board shows of its pages. Every project is made with a section page, and the model keeps it (a project
 * always has a page). A new board marks that page (`Project.starter`, 0.3-L4-3 fix 1): while the mark holds it is not
 * drawn, not listed, and takes no place on the board, so a new board looks empty; the section tools show only once the
 * board has a section page to use them on. The mark is not design: the fingerprint, the revision, the ledger and undo
 * leave it out, as they leave out `leftOut`. A board without it (an older one, one received without it, the sample)
 * hides nothing.
 */
import {initialProject, type Page, type Project} from '../model';
import {clip} from '../text';
import type {Space} from './space';

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
/** The board as placing the next item reads it: every frame but the starter's, which is not there to the eye. */
export function placementSpace(project: Pick<Project, 'pages' | 'starter' | 'space'>): Space {
  const frames = {...(project.space?.frames ?? {})};
  for (const page of project.pages) if (isStarterPage(project, page)) delete frames[page.id];
  return {frames};
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/**
 * Where a change leaves the mark, `before` being the board as the change found it. A change that reaches the marked page
 * (a section, its name, its frame's size or place) or takes it away drops the mark, and it does not come back: an undo
 * of that change leaves the page showing. True when the mark was dropped.
 */
export function settleStarter(before: Pick<Project, 'pages' | 'space' | 'starter'>, after: Project): boolean {
  const id = before.starter;
  if (id === undefined) return false;
  const was = before.pages.find(p => p.id === id), now = after.pages.find(p => p.id === id), frame = before.space?.frames[id];
  if (was && now && same(was, now) && (frame === undefined || same(frame, after.space?.frames[id]))) return false;
  delete after.starter;
  return true;
}
