export function schemeForIdentifier(identifier) {
  return typeof identifier === 'string' && identifier.endsWith('.preview') ? 'aphrodite-preview' : 'aphrodite';
}

export const boardScheme = typeof __BOARD_SCHEME__ === 'undefined' ? schemeForIdentifier('') : __BOARD_SCHEME__;
