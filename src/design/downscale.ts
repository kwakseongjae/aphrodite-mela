/**
 * Fitting a picture to the job it has to do.
 *
 * A reference poster is a card image and the seed for the on-device analysis — neither needs the
 * eight megapixels a phone camera hands you. Stored whole, one poster crossed the bridge as about
 * eleven megabytes of base64 every time its card was first drawn.
 *
 * The long edge is capped rather than the area, because what the analysis wants is legible text and
 * honest proportions, and both survive a long edge of 1600 while a thumbnail's would not.
 */
export const POSTER_EDGE = 1600;

/** The size to draw at: never larger than the original, never longer than `edge` on its long side. */
export function fitWithin(width: number, height: number, edge = POSTER_EDGE): {width: number; height: number} {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return {width: 0, height: 0};
  if (longest <= edge) return {width: Math.round(width), height: Math.round(height)};
  const scale = edge / longest;
  // Never round a side to nothing: a 4000×3 panorama is still three pixels tall.
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

/** Whether a file is worth re-encoding at all. Small ones are passed through untouched. */
export function worthShrinking(bytes: number, width: number, height: number, edge = POSTER_EDGE): boolean {
  return Math.max(width, height) > edge || bytes > 1_500_000;
}

/** Strips the `data:…;base64,` head, which is what the Rust side wants. */
export function base64Of(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}
