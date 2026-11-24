/**
 * 0.3-L4b: what a board shows of its pages. Every project is made with a section page, and the model keeps it (a project
 * always has a page; its fingerprint, revision, ledger and undo stay as they are). While that page is the untouched starter
 * it is not drawn, not listed, and takes no place on the board, so a new board looks empty; the section tools show only
 * once the board has a section page to use them on. Nothing here writes to the project.
 */
import type {Page, Project} from '../model';
import type {Space} from './space';

/**
 * The starter: the first page, a section page with no sections, that no change in the ledger has touched. A section page
 * whose last section was deleted was touched, and a frame made later is not the first page, so both are drawn. Only
 * opening a page (a view change) does not count. An old board with no ledger is read the same way.
 */
export function isStarterPage(project: Pick<Project, 'pages' | 'ledger'>, page: Page): boolean {
  if (page.id !== project.pages[0]?.id || page.kind !== undefined || page.blocks.length) return false;
  return !(project.ledger?.changes ?? []).some(c => !c.view && (c.anchors.truncated || c.anchors.pages.includes(page.id)));
}
/** The pages the board draws and lists, in page order. */
export function visiblePages(project: Pick<Project, 'pages' | 'ledger'>): Page[] {
  return project.pages.filter(p => !isStarterPage(project, p));
}
/** The one condition the section tools are shown on: a section page the person can see. */
export function hasSectionPage(project: Pick<Project, 'pages' | 'ledger'>): boolean {
  return visiblePages(project).some(p => p.kind === undefined);
}
/** The board as placing the next item reads it: every frame but the starter's, which is not there to the eye. */
export function placementSpace(project: Pick<Project, 'pages' | 'ledger' | 'space'>): Space {
  const frames = {...(project.space?.frames ?? {})};
  for (const page of project.pages) if (isStarterPage(project, page)) delete frames[page.id];
  return {frames};
}
