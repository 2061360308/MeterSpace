type Task<T> = () => Promise<T>;

interface QueueItem {
  task: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export class RateLimiter {
  private queue: QueueItem[] = [];
  private running = 0;
  private maxConcurrent: number;
  private minInterval: number;

  constructor(maxConcurrent = 5, minIntervalMs = 200) {
    this.maxConcurrent = maxConcurrent;
    this.minInterval = minIntervalMs;
  }

  async add<T>(fn: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: () => fn().then(resolve, reject),
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.processNext();
    });
  }

  private processNext() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    const item = this.queue.shift()!;
    this.running++;
    item
      .task()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        this.running--;
        setTimeout(() => this.processNext(), this.minInterval);
      });
  }
}
