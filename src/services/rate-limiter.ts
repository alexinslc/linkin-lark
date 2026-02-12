import PQueue from 'p-queue';

export interface RateLimiterConfig {
  concurrency?: number;
  intervalMs?: number;
  maxRetries?: number;
}

export class RateLimiter {
  private queue: PQueue;
  private lastRequestTime = 0;
  private intervalMs: number;
  private maxRetries: number;

  constructor(config: RateLimiterConfig = {}) {
    const concurrency = config.concurrency || parseInt(process.env.ELEVENLABS_MAX_CONCURRENT || '3');
    this.intervalMs = config.intervalMs || parseInt(process.env.ELEVENLABS_MIN_INTERVAL || '1200');
    this.maxRetries = config.maxRetries || parseInt(process.env.ELEVENLABS_MAX_RETRIES || '3');

    this.queue = new PQueue({
      concurrency,
      interval: this.intervalMs,
      intervalCap: 1,
    });
  }

  async execute<T>(fn: () => Promise<T>, retryCount = 0): Promise<T> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.intervalMs) {
      await this.wait(this.intervalMs - elapsed);
    }

    this.lastRequestTime = Date.now();

    try {
      return await this.queue.add(() => fn());
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const is429 = error instanceof Error && error.message.includes('Rate limit exceeded');
        const is5xx = error instanceof Error && error.message.includes('server error');

        if (is429 || is5xx) {
          const delay = this.calculateBackoff(retryCount, is429 ? error : undefined);
          console.warn(`Retry ${retryCount + 1}/${this.maxRetries} after ${delay}ms...`);
          await this.wait(delay);
          return this.execute(fn, retryCount + 1);
        }
      }
      throw error;
    }
  }

  private calculateBackoff(attempt: number, error?: Error): number {
    if (error) {
      const retryAfterMatch = error.message.match(/Retry after (\d+)/);
      if (retryAfterMatch && retryAfterMatch[1]) {
        return parseInt(retryAfterMatch[1]) * 1000;
      }
    }
    return Math.min(2000 * Math.pow(2, attempt), 30000);
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get size(): number {
    return this.queue.size;
  }

  get pending(): number {
    return this.queue.pending;
  }
}
