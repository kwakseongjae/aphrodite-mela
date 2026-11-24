/**
 * Putting a list of things in, one at a time, while something waits for them a limited time (0.3-R fix 7 follow-up): `now`
 * says how many failed and how many are still to come when the time is up (or when all are in, if sooner); the rest go on
 * coming in after it, and `rest` gives how many failed of all of them. One that does not end in `each` counts as failed, so
 * none is waited for for ever and none is dropped without being counted.
 */
export function bringIn<T>(items: T[], put: (item: T) => Promise<unknown>, limit: number, each = 60_000): {now: Promise<{failed: number; waiting: number}>; rest: Promise<number>} {
  let failed = 0, done = 0;
  const rest = (async () => {
    for (const item of items) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([put(item), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('it did not finish')), each); })]); }
      catch { failed++; }
      finally { clearTimeout(timer); done++; }
    }
    return failed;
  })();
  const now = new Promise<{failed: number; waiting: number}>(resolve => {
    const timer = setTimeout(() => resolve({failed, waiting: items.length - done}), limit);
    void rest.then(() => { clearTimeout(timer); resolve({failed, waiting: 0}); });
  });
  return {now, rest};
}
