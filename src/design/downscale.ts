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

/** Base64 of the bytes as they are, for when shrinking is not wanted or not possible. */
function asIs(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * A picture, as base64 ready for the archive: shrunk when it is worth shrinking, untouched when it
 * is not.
 *
 * This lives here rather than inside the archive so a browser can call it directly — the app's own
 * path goes through a file dialog, which cannot be driven from a test, and a downscaler nobody can
 * exercise is a downscaler nobody knows the state of.
 *
 * Anything that goes wrong keeps the original bytes. A person chose this picture; a format the
 * canvas cannot decode is a reason to store it whole, not a reason to lose it.
 */
export async function shrinkToPoster(bytes: Uint8Array, mime: string): Promise<string> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], {type: mime}));
    try {
      if (!worthShrinking(bytes.length, bitmap.width, bitmap.height)) return asIs(bytes);
      const {width, height} = fitWithin(bitmap.width, bitmap.height);
      if (!width || !height) return asIs(bytes);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return asIs(bytes);
      context.drawImage(bitmap, 0, 0, width, height);
      // JPEG: a photograph is what this usually is, and a lossless copy of one is the problem.
      return base64Of(canvas.toDataURL('image/jpeg', 0.88));
    } finally {
      bitmap.close();
    }
  } catch {
    return asIs(bytes);
  }
}
