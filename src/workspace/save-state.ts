import {DurableQueue} from './durable';
import type {Breadcrumb} from './breadcrumb';

type Snapshot = {text: string; boards: number};
type Write = (text: string, expected: number) => Promise<number>;

/** One window's live contents and the last generation its current store acknowledged. */
export class WindowSaves {
  private live = 0;
  private acknowledged: number | undefined = 0;
  private queue?: DurableQueue;
  private pending = new Set<object>();
  private queuedGeneration?: number;
  private refused = '';
  private stopped = '';
  private missingFolder?: Breadcrumb;
  private replacement = false;

  unread = '';
  constructor(private localWrite: (text: string) => void, private changed: () => void,
    private landed: (revision: number, boards: number) => void) {}

  get generation() { return this.live; }
  get saved() { return this.live === this.acknowledged && !this.error && !this.unread; }
  get noCopy() { return this.acknowledged === undefined; }
  get native() { return !!this.queue; }
  get missing() { return this.missingFolder; }
  get replaced() { return this.replacement; }
  get error() { return this.stopped || this.refused; }
  get retries() { return !!this.refused && !this.stopped; }
  get badge(): 'saved' | 'saving' | 'unsaved' {
    if (this.saved) return 'saved';
    return !this.error && this.pending.size && this.queuedGeneration === this.live ? 'saving' : 'unsaved';
  }

  attach(revision: number, write: Write) {
    this.queue = new DurableQueue(revision, write);
    this.pending.clear();
    this.queuedGeneration = undefined;
    this.stopped = this.refused = '';
  }

  emptyRead(record: Breadcrumb | undefined, hasWork: boolean) {
    if (record) this.missingFolder = record;
    if (hasWork) this.acknowledged = undefined;
  }

  installed() {
    this.acknowledged = ++this.live;
    this.unread = '';
    if (!this.replacement) this.missingFolder = undefined;
  }

  acceptReplacement(at: number) {
    if (!this.saved || at !== this.live || !this.missingFolder) return false;
    this.missingFolder = undefined;
    this.replacement = false;
    return true;
  }

  flush() { return this.queue?.flush() ?? Promise.resolve(); }

  /** A recorded edit takes its generation before the snapshot builder can reject it. A retry covers the same edit. */
  save(snapshot: () => Snapshot, edit = true) {
    const generation = edit ? ++this.live : this.live;
    const queue = this.queue;
    try {
      if (this.unread) throw new Error(this.unread);
      const {text, boards} = snapshot();
      if (!queue) {
        this.localWrite(text);
        this.acknowledged = generation;
        this.refused = '';
      } else {
        const ticket = {};
        this.pending.add(ticket);
        this.queuedGeneration = generation;
        this.refused = '';
        void queue.enqueue(text).then(revision => {
          if (queue !== this.queue) return;
          this.pending.delete(ticket);
          this.acknowledged = generation;
          if (this.missingFolder) this.replacement = true;
          this.landed(revision, boards);
          this.changed();
        }, error => {
          if (queue !== this.queue) return;
          this.pending.delete(ticket);
          this.stopped = String(error);
          this.changed();
        });
      }
    } catch (error) {
      this.refused = error instanceof Error ? error.message : String(error);
      this.changed();
      throw error;
    }
    this.changed();
  }
}
