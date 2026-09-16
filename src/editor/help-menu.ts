import {esc} from '../html';
import type {Language} from '../i18n';

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
  const kbd=item.keys?`<kbd>${esc(item.keys)}</kbd>`:'';
  if(item.href)return `<a role="menuitem" href="${esc(item.href)}" target="_blank" rel="noopener">${label}${kbd}</a>`;
  return `<button type="button" role="menuitem"${item.action?` data-action="${esc(item.action)}"`:''}>${label}${kbd}</button>`;
}

/**
 * `className` lets the home screen render the same list inside its own dropdown chrome. The editor's
 * menu hangs upward from a corner button; home's hangs down from the top row, and reusing the
 * chrome that already works there is safer than a second set of positioning rules.
 */
export function helpMenuHtml(language:Language,items:readonly (HelpItem|'separator')[]=helpItems,className='help-menu'):string{
  const ko=language==='ko';
  return `<div class="${className}" role="menu">${items.map(item=>item==='separator'?'<div class="help-sep"></div>':helpRow(item,ko)).join('')}</div>`;
}
