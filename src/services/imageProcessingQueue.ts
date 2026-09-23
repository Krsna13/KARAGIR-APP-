/**
 * Stage 6.2: strictly sequential job queue.
 *
 * Background removal is heavy on phones, so product photos are enhanced ONE
 * AT A TIME, in the order they were enqueued, never in parallel.
 */
import {
  processProductImageById,
  type ProcessProductImageByIdResult,
} from './imageEnhancementService';

export interface EnqueueHooks {
  /** Called when this job's worker actually starts running. */
  onStart?: () => void;
}

export interface SequentialQueue<TResult> {
  /**
   * Adds `key` to the end of the queue. If `key` is already waiting or
   * running, returns that job's promise instead of adding a duplicate.
   */
  enqueue(key: string, hooks?: EnqueueHooks): Promise<TResult>;
  /** True while `key` is waiting or running. */
  has(key: string): boolean;
  /** True only while `key` is the job currently running. */
  isRunning(key: string): boolean;
  /** Number of jobs waiting or running. */
  size(): number;
  /** Resolves once the queue has fully drained. */
  onIdle(): Promise<void>;
}

interface Job<TResult> {
  key: string;
  onStart: Array<() => void>;
  promise: Promise<TResult>;
  resolve: (value: TResult) => void;
  reject: (reason: unknown) => void;
}

export function createSequentialQueue<TResult>(
  worker: (key: string) => Promise<TResult>
): SequentialQueue<TResult> {
  const waiting: Job<TResult>[] = [];
  let running: Job<TResult> | null = null;
  let idleWaiters: Array<() => void> = [];

  const notifyIdle = () => {
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((fn) => fn());
  };

  const pump = () => {
    if (running) return;
    const job = waiting.shift();
    if (!job) {
      notifyIdle();
      return;
    }
    running = job;

    for (const fn of job.onStart) {
      try {
        fn();
      } catch (err) {
        console.error('[SequentialQueue] onStart hook failed:', err);
      }
    }

    // A worker that throws synchronously must not wedge the queue.
    Promise.resolve()
      .then(() => worker(job.key))
      .then(job.resolve, job.reject)
      .finally(() => {
        running = null;
        pump();
      });
  };

  return {
    enqueue(key, hooks) {
      if (running?.key === key) {
        return running.promise;
      }
      const existing = waiting.find((job) => job.key === key);
      if (existing) {
        if (hooks?.onStart) existing.onStart.push(hooks.onStart);
        return existing.promise;
      }

      let resolve!: (value: TResult) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<TResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      waiting.push({ key, onStart: hooks?.onStart ? [hooks.onStart] : [], promise, resolve, reject });
      pump();
      return promise;
    },
    has(key) {
      return running?.key === key || waiting.some((job) => job.key === key);
    },
    isRunning(key) {
      return running?.key === key;
    },
    size() {
      return waiting.length + (running ? 1 : 0);
    },
    onIdle() {
      if (!running && waiting.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
  };
}

/** App-wide enhancement queue: one photo processed at a time across all screens. */
export const enhancementQueue: SequentialQueue<ProcessProductImageByIdResult> =
  createSequentialQueue(processProductImageById);
