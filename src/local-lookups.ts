/**
 * Lookups of image-library pictures (0.3-P3-fix3 #5). A picture is looked up once at a time per board and picture,
 * never per picture alone: a lookup on the board left behind neither stands in for nor answers for the same picture on
 * the board now open. An answer is painted only while its board is still the one open.
 */
export function localLookups<T>(read: (id: string, scope: string) => Promise<T>, current: () => string, done: (id: string, got: T | undefined) => void) {
  const pending = new Set<string>();
  return async (id: string): Promise<void> => {
    const scope = current(), key = scope + '\n' + id;
    if (pending.has(key)) return;
    pending.add(key);
    let got: T | undefined;
    try { got = await read(id, scope); } catch { got = undefined; } finally { pending.delete(key); }
    if (current() === scope) done(id, got);
  };
}
