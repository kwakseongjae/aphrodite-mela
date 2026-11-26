import {esc} from '../html';
import {icon} from '../design/icon';
import type {Language} from '../i18n';
import {themeChoices,type ThemeChoice} from '../theme';

export type HelpItem={id:string;action?:string;href?:string;en:string;ko:string;keys?:string};

export const helpItems:readonly (HelpItem|'separator')[]=[
  {id:'commands',action:'commands',en:'Keyboard shortcuts & commands',ko:'키보드 단축키와 명령',keys:'⌘K'},
  {id:'tour-start',action:'tour-start',en:'Editor tour',ko:'에디터 둘러보기'},
  {id:'agent',action:'agent',en:'Computer-use guide',ko:'에이전트 사용 안내'},
  {id:'agent-connect',action:'agent-connect',en:'Agent connection',ko:'에이전트 연결'},
  {id:'taste',action:'taste',en:'What Aphrodite remembers about your taste',ko:'취향에 대해 기억하는 것'},
  'separator',
  {id:'brand-kit',action:'brand-kit',en:'Aphrodite Brand Kit',ko:'아프로디테 브랜드 키트'},
  {id:'release-notes',href:'https://github.com/kwakseongjae/aphrodite-mela/releases',en:'Release notes',ko:'릴리스 노트'},
  {id:'report-issue',href:'https://github.com/kwakseongjae/aphrodite-mela/issues',en:'Report an issue',ko:'문제 신고'},
  'separator',
  {id:'language-settings',action:'language-settings',en:'Language',ko:'언어'},
];

/**
 * What the home screen's menu leaves out, and why. The command palette and the editor tour need a
 * canvas. The assembly console describes the page you are editing, which on home is whichever project
 * happens to be in memory — worse than useless. The agent connection and the interface language each
 * have their own control in the top row already, and an entry that duplicates a visible control is
 * one more thing to read. What is left are the three that work the same from either screen.
 */
export const homeOnly=['commands','tour-start','agent-connect','agent','language-settings'];
export const homeHelpItems:readonly (HelpItem|'separator')[]=
  helpItems.filter(item=>item==='separator'||!homeOnly.includes(item.id));

function helpRow(item:HelpItem,ko:boolean):string{
  const label=esc(ko?item.ko:item.en);
  const kbd=item.keys?`<span class="ui-menu-key">${esc(item.keys)}</span>`:'';
  if(item.href)return `<a role="menuitem" class="ui-menu-item" href="${esc(item.href)}" target="_blank" rel="noopener"><span>${label}</span>${icon('arrow-up-right','ui-icon ui-icon-sm')}${kbd}</a>`;
  return `<button type="button" role="menuitem" class="ui-menu-item"${item.action?` data-action="${esc(item.action)}"`:''}><span>${label}</span>${kbd}</button>`;
}

/** The three looks, named the same wherever they are offered: home's theme menu, this menu and the command palette. */
export const themeLabel:Record<ThemeChoice,{en:string;ko:string}>={system:{en:'Match the system',ko:'시스템 설정 따르기'},light:{en:'Light',ko:'밝게'},dark:{en:'Dark',ko:'어둡게'}};
/** One press sets the whole app's look (main.ts setTheme); the rows sit in a group main.ts redraws in place when the choice changes. */
export function themeRows(choice:ThemeChoice,language:Language):string{
  return themeChoices.map(c=>`<button type="button" class="ui-menu-item" role="menuitemradio" aria-checked="${choice===c}" data-action="hub-theme" data-scheme="${c}"><span>${esc(themeLabel[c][language])}</span>${choice===c?icon('check','ui-icon ui-icon-sm'):''}</button>`).join('');
}

/**
 * `className` lets the home screen render the same list inside its own dropdown chrome. The editor's
 * menu hangs upward from a corner button; home's hangs down from the top row, and reusing the
 * chrome that already works there is safer than a second set of positioning rules.
 */
export function helpMenuHtml(language:Language,items:readonly (HelpItem|'separator')[]=helpItems,className='help-menu',theme?:ThemeChoice):string{
  const ko=language==='ko';
  const looks=theme?`<div class="help-sep ui-menu-sep"></div><div role="group" aria-labelledby="help-theme-label" data-theme-menu><p class="ui-menu-label" id="help-theme-label">${ko?'테마':'Theme'}</p>${themeRows(theme,language)}</div>`:'';
  return `<div class="${className} ui-menu" role="menu">${items.map(item=>item==='separator'?'<div class="help-sep ui-menu-sep"></div>':helpRow(item,ko)).join('')}${looks}</div>`;
}
