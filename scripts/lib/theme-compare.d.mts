/** What verify:theme reads in one theme: the section page's colours, the free pages' and catalog's pixels, the preview's document, the exported index.html and the app's paper. */
export type ThemeRead={design:string[];frames:string[];preview:string|null;code:string|null;catalog:string[];paper:string};
export function sameInBothThemes(seen:{light:ThemeRead;dark:ThemeRead}):void;
