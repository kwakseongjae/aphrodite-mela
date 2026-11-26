import {playbook, toolList} from '../../src/agent/playbook.mjs';

const notRunning = 'Aphrodite is not running. Ask the person to open the app, then try again.';
export const protocol = {
  limits: {frameBytes:24*1024*1024, responseBytes:24*1024*1024, endpointBytes:64*1024, inFlight:4, depth:96},
  busy: 'Aphrodite already has four calls in progress. Try again when one finishes.',
  tooLarge: 'The Aphrodite response exceeds 24 MiB.',
  versions: ['2025-06-18', '2025-03-26', '2024-11-05'],
  instructions: [
    'Aphrodite is a local design workbench. Read the design contract before changing anything, and send a whole change as one aphrodite_apply_edits call so the person can undo it in one press.',
    'Approving a direction is the person\'s decision and no tool here can do it.',
    'Editing needs the person to have opened the door; if a call comes back saying so, tell them rather than retrying.',
  ].join(' '),
  notRunning,
  offlineGuide: [playbook, toolList, '## Right now\n' + notRunning].join('\n\n'),
  timeout: 'Aphrodite did not answer in time. It may be busy or mid-dialog — ask the person to check the app.',
};
