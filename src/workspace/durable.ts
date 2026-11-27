/** Writes are serial. A rejected write blocks its successors until the store is read again. */
export class DurableQueue {
  private tail: Promise<number>;
  constructor(revision: number, private write: (text: string, expected: number) => Promise<number>) {
    this.tail = Promise.resolve(revision);
  }

  enqueue(text: string): Promise<number> {
    this.tail = this.tail.then(revision => this.write(text, revision));
    return this.tail;
  }

  flush() { return this.tail; }
}
