/** The app document's policy for each build (src/csp.mjs). */
export function appPolicy(target: 'desktop' | 'browser'): string;
/** index.html with the browser policy in a meta tag, unless this is a desktop build (TAURI_ENV_PLATFORM). */
export function policyInHtml(html: string, env?: Record<string, string | undefined>): string;
