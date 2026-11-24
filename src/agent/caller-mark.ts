import {icon} from '../design/icon';
import {describeCaller} from './callers';

/**
 * The mark beside a program's name (0.3-L4 ③): its maker's official logo, the file as it was received from their press
 * kit (public/brand/agents, owner 2026-11-19), never redrawn. Claude's spark for Claude programs, OpenAI's blossom for
 * Codex and ChatGPT, a plain terminal mark for anything else, which is only what that program says about itself.
 */
const logos: [test: (name: string) => boolean, src: string, blossom: boolean][] = [
  [name => name.startsWith('Claude'), '/brand/agents/claude-spark-clay.svg', false],
  [name => name === 'Codex' || name === 'ChatGPT', '/brand/agents/openai-blossom-black.svg', true],
];
export function callerMarkHtml(raw: string, small = false): string {
  const who = describeCaller(raw), hit = who.known ? logos.find(([test]) => test(who.name)) : undefined;
  const inner = hit ? `<img class="caller-logo${hit[2] ? ' caller-logo-blossom' : ''}" src="${hit[1]}" alt="" width="20" height="20" draggable="false">` : icon('terminal', 'ui-icon ui-icon-sm');
  return `<span class="caller-mark${small ? ' caller-mark-sm' : ' ui-connect-mark'}" aria-hidden="true">${inner}</span>`;
}
