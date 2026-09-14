/**
 * Errors that teach. A refusal an agent cannot act on costs a whole round trip, so every rejection
 * here says what was wrong, what the valid values are, and where to look next.
 */
const LIST_LIMIT = 12;

/** Edit distance, capped: we only care whether a value is a near miss for something real. */
function distance(a: string, b: string): number {
  const rows = a.length + 1;
  let previous = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** The closest valid value, when there is one close enough to be worth suggesting. */
export function didYouMean(value: string, valid: readonly string[]): string | undefined {
  const needle = value.trim().toLowerCase();
  if (!needle) return undefined;
  // A valid value sitting inside what was sent ("hero-large", "footer-bar") is a near miss no edit
  // distance would forgive, and it is the mistake agents actually make. Longest wins.
  let contained: string | undefined;
  for (const candidate of valid) {
    const lower = candidate.toLowerCase();
    if (lower.length >= 3 && needle.includes(lower) && lower.length > (contained?.length ?? 0)) contained = candidate;
  }
  if (contained) return contained;
  let best: string | undefined;
  let bestScore = Infinity;
  for (const candidate of valid) {
    const score = distance(needle, candidate.toLowerCase());
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  const allowed = Math.max(2, Math.floor(Math.max(needle.length, best?.length ?? 0) / 3));
  return best !== undefined && bestScore <= allowed ? best : undefined;
}

/** The standard shape: what you sent, what is accepted, the nearest hit, and what to call next. */
export function unknownValue(field: string, value: string, valid: readonly string[], next?: string): string {
  const shown = valid.slice(0, LIST_LIMIT).join(', ');
  const more = valid.length > LIST_LIMIT ? `, … (${valid.length} in all)` : '';
  const near = didYouMean(value, valid);
  return [
    `unknown ${field} "${value}".`,
    `Valid values: ${shown}${more}.`,
    near ? `Closest match: "${near}".` : '',
    next ?? '',
  ].filter(Boolean).join(' ');
}

/** For a field that is missing rather than wrong. */
export function missingField(field: string, example: string): string {
  return `${field} is required. For example: ${example}`;
}
