/**
 * The app's own look: light, dark, or whichever the Mac is in (owner 11/23). It is set once, on the
 * document root, and nothing below it sets another: src/ui/tokens.css answers `data-theme` there and,
 * with none, the Mac's prefers-color-scheme. The person's design is not the app's look and never
 * follows it (the page sheet, the frames and what is exported keep the design's own colours).
 *
 * public/theme.js reads the same choice before the first paint, so the window never flashes the other
 * theme; it cannot import this file, and tests/app-theme.test.ts runs both against every stored value.
 */
export type ThemeChoice='system'|'light'|'dark';
export const themeKey='aphrodite-theme';
/** Home's switch before 0.3-L5: Paper or Midnight, home only. */
const oldKey='aphrodite-paper-theme';
export const themeChoices:readonly ThemeChoice[]=['system','light','dark'];
export function isThemeChoice(value:unknown):value is ThemeChoice{return value==='system'||value==='light'||value==='dark';}

type Store=Pick<Storage,'getItem'>&Partial<Pick<Storage,'setItem'|'removeItem'>>;
/** The stored choice. An old Paper or Midnight is read as light or dark and, where the storage can be written, moved to the new name. */
export function readTheme(storage:Store):ThemeChoice{
  try{
    const value=storage.getItem(themeKey);
    if(isThemeChoice(value))return value;
    const old=storage.getItem(oldKey);
    const moved:ThemeChoice=old==='night'?'dark':old==='paper'?'light':'system';
    if(old!==null&&storage.setItem&&storage.removeItem){storage.setItem(themeKey,moved);storage.removeItem(oldKey);}
    return moved;
  }catch{return 'system';}
}
export function saveTheme(storage:Pick<Storage,'setItem'>,value:ThemeChoice){
  if(!isThemeChoice(value))throw new Error('Unsupported theme');
  storage.setItem(themeKey,value);
}
/** The theme on screen: the choice, or the Mac's when the choice is to follow it. */
export function shownTheme(choice:ThemeChoice,systemDark:boolean):'light'|'dark'{return choice==='system'?(systemDark?'dark':'light'):choice;}
/** Following the Mac is no attribute at all, so the stylesheet's own media query decides. */
export function applyTheme(root:Pick<Element,'setAttribute'|'removeAttribute'>,choice:ThemeChoice){
  if(choice==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',choice);
}

/** The desktop's half of a pick: one command that keeps it for the next launch and puts it on the main window only (src-tauri/src/look.rs). */
export function nativeLook(invoke:(command:string,args:Record<string,unknown>)=>Promise<unknown>,choice:ThemeChoice){return invoke('window_look',{look:choice});}
