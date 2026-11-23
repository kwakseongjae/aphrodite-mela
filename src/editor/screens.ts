/**
 * Which screen an action belongs to, one name at a time (0.3-R, from 0.2.5's table). Asked of an agent's command only.
 *
 * The person presses what a screen draws, and an action the app calls itself runs where it is called; what keeps either
 * off a board that is not open is `commit`, `history` and `persist`, which do nothing off the editor (src/main.ts).
 * Off the editor no board is open: the copy left in memory is not what the person sees, so an action that reads or
 * writes `project` runs in the editor only. Home's actions change the library entry a card points at, which may be the
 * board open in the editor, so they run on Home only. Everything else (the library as a whole, the app, language,
 * the connection, windows, updates) runs anywhere, and so does any action not named here: the rule guards the open
 * board and nothing more. A prefix is never enough: disk-backup and disk-reload are drawn in the editor's save banner.
 */
export const editorActions: ReadonlySet<string> = new Set(['add','add-page','add-section','agent','analyze-reference','apply-asset','apply-local','apply-omd','apply-sample','apply-vibe','approve','approve-export','approve-human-only','assemble-focus','assembly-brief','assembly-empty','assembly-end','assembly-log','assembly-review','asset-category','autofill','block-image','brief','brief-preset','choose-direction','choose-system','collection-image','collection-image-clear','collection-image-demo','commands','compare-directions','component-explorer','copy-prompt','delegation-return','delete-block','delete-page','demo-reference','design-md','dock-group','dock-hand','dock-select','download-board-file','download-bundle','download-page-html','duplicate-block','duplicate-page','editor-mode','explorer-add','explorer-group','explorer-inspect','explorer-kind-pick','explorer-pin','explorer-reset','explorer-variant-pick','export','export-tab','font-choose','font-install','font-picker','import-md','insert-root','inspection-add','inspection-back','local-delete','local-delete-confirm','local-import','local-refresh','local-reveal','local-scope','moa-recipe','move-down','move-up','new-frame','page','page-menu','page-view','page-view-close','page-view-edit','pin-frame','pointer-lab','preview','project','proposal-accept','proposal-apply','proposal-back','proposal-blue','proposal-discard','proposal-export','proposal-full','proposal-green','proposal-keep','propose-directions','redo','reference','reference-add-image','reference-add-link','reference-delete','reference-lookup','reference-open','reference-promote','reference-scope','remove-reference','review-reference','save-design','save-project','select','shelf-add','shelf-inspect','shelf-page','shelf-remove','systems','tab','theme-review','tidy-frames','undo','upload-reference','vibe-back','vibe-image','vibe-retry-replace','zoom-100','zoom-fit','zoom-frame','zoom-in','zoom-out']);
export const homeActions: ReadonlySet<string> = new Set(['hub-archive','hub-delete','hub-delete-confirm','hub-duplicate','hub-move','hub-pin','hub-rename','ws-clear-image','ws-delete','ws-delete-confirm','ws-new','ws-pick-color','ws-pick-emoji','ws-pick-image','ws-settings','ws-switch']);
export function actionScreen(action: string): 'home' | 'editor' | 'any' {
  return editorActions.has(action) ? 'editor' : homeActions.has(action) ? 'home' : 'any';
}
/** Whether an agent's command may run `action` on `screen`. */
export function screenRefuses(action: string | undefined, screen: 'home' | 'editor'): boolean {
  const where = action ? actionScreen(action) : 'any';
  return where !== 'any' && where !== screen;
}
