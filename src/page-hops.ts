/**
 * How often a page seen on its own may show another page by itself (0.3-P3-fix2 #9): at most `limit` times in any
 * `windowMs`. A press inside the page never reaches the app, so the person's own input cannot be what resets it; time
 * does. Two pages that call each other stop; someone pressing through pages, however many, does not. Once stopped it
 * stays stopped, however much time goes by, until the person chooses a page (0.3-P3-fix3 #4).
 */
export function hopLimit(limit = 20, windowMs = 10_000) {
  const times: number[] = [];
  let stopped = false;
  return {
    /** Whether one more may happen at `now`; counted when it may. */
    allow(now: number): boolean {
      if (stopped) return false;
      while (times.length && times[0] <= now - windowMs) times.shift();
      if (times.length >= limit) { stopped = true; return false; }
      times.push(now);
      return true;
    },
    /** The person chose a page themselves: counting starts again. */
    reset(): void { times.length = 0; stopped = false; },
  };
}
