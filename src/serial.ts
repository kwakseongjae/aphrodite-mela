/**
 * Jobs that must not overlap, each started once the one before it has ended, however it ended (0.3-P3-fix2): board
 * files coming in, and the links and files macOS hands the app, go one at a time.
 */
export function serial(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return job => { const run = tail.then(job, job); tail = run.then(() => undefined, () => undefined); return run; };
}
