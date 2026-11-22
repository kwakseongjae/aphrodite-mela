/**
 * Which screen an action belongs to, one name at a time.
 *
 * Off the editor there is no open board: the copy left in memory is not what the person sees, so an
 * action that reads or writes `project` runs in the editor only. Home's actions change the library
 * entry a card points at, and that entry may be the board open in the editor, so they run on Home
 * only. Everything else (the library as a whole, the app, language, connection, windows, updates)
 * runs anywhere, and so does any action not named here: the rule guards the open board and nothing
 * more. A prefix is never enough: disk-backup and disk-reload are drawn in the editor's save banner, and the
 * missing-folder notice, with disk-start-fresh, is drawn on whichever screen is open (it writes the library as a
 * whole, not the board in memory).
 */
export const editorActions: ReadonlySet<string> = new Set(['add','add-page','add-section','agent','analyze-reference','apply-asset','apply-local','apply-omd','apply-sample','apply-vibe','approve','approve-export','approve-human-only','assemble-focus','assembly-brief','assembly-empty','assembly-end','assembly-log','assembly-review','asset-category','autofill','block-image','brief','brief-preset','choose-direction','choose-system','collection-image','collection-image-clear','collection-image-demo','commands','compare-directions','component-explorer','copy-prompt','delegation-return','delete-block','delete-page','demo-reference','design-md','dock-group','dock-hand','dock-select','download-bundle','duplicate-block','duplicate-page','editor-mode','explorer-add','explorer-group','explorer-inspect','explorer-kind-pick','explorer-pin','explorer-reset','explorer-variant-pick','export','export-tab','font-choose','import-md','insert-root','inspection-add','inspection-back','local-delete','local-delete-confirm','local-import','local-refresh','local-reveal','local-scope','moa-recipe','move-down','move-up','new-frame','page','page-menu','pin-frame','pointer-lab','preview','project','proposal-accept','proposal-apply','proposal-back','proposal-blue','proposal-discard','proposal-export','proposal-full','proposal-green','proposal-keep','propose-directions','redo','reference','reference-add-image','reference-add-link','reference-delete','reference-lookup','reference-open','reference-promote','reference-scope','remove-reference','review-reference','save-design','save-project','select','shelf-add','shelf-inspect','shelf-page','shelf-remove','systems','tab','theme-review','tidy-frames','undo','upload-reference','vibe-back','vibe-image','vibe-retry-replace','zoom-100','zoom-fit','zoom-frame','zoom-in','zoom-out']);
export const homeActions: ReadonlySet<string> = new Set(['hub-delete','hub-delete-confirm','hub-pin','hub-move','hub-archive','hub-duplicate','hub-rename','ws-switch','ws-new','ws-settings','ws-pick-color','ws-pick-emoji','ws-pick-image','ws-clear-image','ws-delete','ws-delete-confirm']);
export function actionScreen(action: string): 'home' | 'editor' | 'any' {
  return editorActions.has(action) ? 'editor' : homeActions.has(action) ? 'home' : 'any';
}
