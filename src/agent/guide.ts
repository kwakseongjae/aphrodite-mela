/**
 * The guide an agent reads before touching anything.
 *
 * It lives in the app rather than in the client so there is one copy of it, and so it can say what is
 * true right now — which project is open, whether the door is open, who is holding the screen. An
 * agent that starts here should not have to guess at any of the rest.
 */
import {mcpTools} from './commands.mjs';

export type GuideStatus = {
  mode: 'design' | 'connected' | 'delegated';
  holder: string | null;
  projectName: string;
  pageCount: number;
  approved: boolean;
  canWrite: boolean;
  askedRecently: boolean;
  /** Omitted means the editor is open. Home is said explicitly. */
  screen?: 'home' | 'editor';
};

import {playbook} from './playbook.mjs';
export {playbook};

/**
 * Every tool, by name and what it is for, generated from the command table (commands.mjs) so the
 * guide can never name a tool that does not exist or leave out one that does.
 */
export const toolList = [
  '## Tools',
  ...mcpTools().map(tool => `- \`${tool.name}\` — ${tool.title}`),
].join('\n');

/** The guide plus what is true at this moment. */
export function guideFor(status: GuideStatus): string {
  const lines = [
    playbook,
    '',
    toolList,
    '',
    '## Right now',
    ...(status.screen === 'home'
      ? ['- The window is on Home, the list of projects. No page is open.']
      : [`- Project: ${status.projectName} · ${status.pageCount} page${status.pageCount === 1 ? '' : 's'}${status.approved ? ' · approved' : ' · draft'}`]),
    `- Mode: ${status.mode}${status.holder ? ` · the screen is held by ${status.holder}` : ''}`,
  ];
  if (status.canWrite) {
    lines.push('- You may change the design. Send a whole change in one call.');
  } else if (status.askedRecently) {
    lines.push('- Editing is closed and a request is already on their screen. Tell the person what you want to do; do not ask again.');
  } else {
    lines.push('- Editing is closed. Call `aphrodite_request_connection` once, then tell the person what you would like to change.');
  }
  return lines.join('\n');
}

/** How long a refusal keeps the refused agent from asking again. A request still waiting has no clock. */
export const ASK_COOLDOWN_MS = 5 * 60 * 1000;

/** `id` names one request, so an answer given to the dialog on screen can only ever land on that request. */
export type AskState = {by: string; at: number; answered: 'pending' | 'allowed' | 'declined'; id?: string} | null;
export type AskOutcome =
  | {status: 'already-open'; message: string}
  | {status: 'asked'; message: string}
  | {status: 'waiting'; message: string}
  | {status: 'declined'; message: string};

/**
 * What to do with a request to connect. Pure, so the rule about how often an agent may ask is
 * testable and cannot drift: one prompt at a time, and a refusal holds for a while. `mode` is the
 * door as this caller meets it: connected only if the person has let this name (or anyone) in.
 */
export function considerAsk(caller: string, mode: GuideStatus['mode'], state: AskState, now: number): AskOutcome {
  if (mode !== 'design') {
    return {status: 'already-open', message: mode === 'delegated'
      ? 'Agent mode is on: you already have the screen. Go ahead, and end it with the end command when you are done.'
      : 'Connected mode is already on. You may change the design.'};
  }
  // An answered "yes" is spent: if the person later closed the door, asking again is fair. Only a
  // request still waiting, or one just refused, holds an agent back. A waiting one holds until the
  // person answers it, however long that takes: replacing it would put another name under their Allow.
  if (state?.answered === 'pending') {
    return {status: 'waiting', message: 'A request is already on their screen. Tell the person what you want to do rather than asking again.'};
  }
  if (state && now - state.at < ASK_COOLDOWN_MS && state.answered === 'declined' && state.by === caller) {
    return {status: 'declined', message: 'The person declined a moment ago. Do not ask again — tell them what you would like to change and let them decide.'};
  }
  return {status: 'asked', message: `Asked. The person now sees a request from "${caller}" and can allow it with one click. Tell them what you would like to change while they decide.`};
}

/**
 * Who the person has let in, remembered by name. It used to be one switch that lapsed after twelve
 * hours, so a person who had already said yes was asked again every morning. Now an agent they allow
 * is remembered — across restarts, with no clock — until they disconnect it, and only they can (see
 * `doorActions` in authority.ts). The banner stays up the whole time and ⌘Z undoes any edit.
 */
export const ALLOWED_KEY = 'aphrodite-allowed-agents';
/** Where the twelve-hour switch kept its deadline. Read nowhere now; cleared on launch. */
export const LEGACY_CONNECT_KEY = 'aphrodite-connect-until';
