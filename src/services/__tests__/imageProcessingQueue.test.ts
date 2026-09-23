/**
 * Stage 6.2: sequential enhancement queue + processProductImageById.
 *
 * REAL LOGIC under test:
 *   - createSequentialQueue: FIFO order, never more than one job running,
 *     de-duplication, failure isolation, onIdle.
 *   - enhancementQueue wired to the real processProductImageById: status
 *     transitions, per-image enhanced path, cover sync onto products, and
 *     strictly one segmentation at a time across several photos.
 *
 * MOCKED AT THE BOUNDARY:
 *   - Supabase client -> in-memory fake (src/test/fakeSupabase.ts); no
 *     Postgres, RLS or triggers are executed.
 *   - runSegmentation (aiRuntimeService, @imgly/background-removal WASM) and
 *     correctLighting (canvas) -> controllable vi.fn()s, because neither the
 *     segmentation runtime nor a real canvas exists under jsdom.
 *   - global fetch (downloading the raw photo) -> returns a fixed Blob.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeSupabase } from '../../test/fakeSupabase';
import { createSequentialQueue, enhancementQueue } from '../imageProcessingQueue';
import { processProductImageById } from '../imageEnhancementService';
import { runSegmentation } from '../aiRuntimeService';
import { correctLighting } from '../lightingCorrectionService';

vi.mock('../../lib/supabase/client', async () => {
  const { fakeSupabase: fake } = await import('../../test/fakeSupabase');
  return { supabase: fake.client };
});
vi.mock('../aiRuntimeService', () => ({ runSegmentation: vi.fn() }));
vi.mock('../lightingCorrectionService', () => ({ correctLighting: vi.fn() }));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createSequentialQueue (real logic)', () => {
  it('runs jobs one at a time, in enqueue order', async () => {
    const started: string[] = [];
    const gates = new Map<string, Deferred<string>>();
    let running = 0;
    let maxRunning = 0;

    const queue = createSequentialQueue<string>(async (key) => {
      started.push(key);
      running++;
      maxRunning = Math.max(maxRunning, running);
      const gate = deferred<string>();
      gates.set(key, gate);
      try {
        return await gate.promise;
      } finally {
        running--;
      }
    });

    const results = ['a', 'b', 'c'].map((k) => queue.enqueue(k));
    await tick();
    expect(started).toEqual(['a']);
    expect(queue.isRunning('a')).toBe(true);
    expect(queue.has('c')).toBe(true);
    expect(queue.size()).toBe(3);

    gates.get('a')!.resolve('A');
    await tick();
    expect(started).toEqual(['a', 'b']);

    gates.get('b')!.resolve('B');
    await tick();
    gates.get('c')!.resolve('C');

    await expect(Promise.all(results)).resolves.toEqual(['A', 'B', 'C']);
    await queue.onIdle();
    expect(started).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(queue.size()).toBe(0);
  });

  it('does not queue a key twice while it is waiting or running', async () => {
    const gate = deferred<void>();
    const worker = vi.fn(async (key: string) => {
      if (key === 'first') await gate.promise;
      return key;
    });
    const queue = createSequentialQueue(worker);

    const running1 = queue.enqueue('first');
    const running2 = queue.enqueue('first'); // while running
    const waiting1 = queue.enqueue('x');
    const waiting2 = queue.enqueue('x'); // while waiting
    expect(running2).toBe(running1);
    expect(waiting2).toBe(waiting1);

    gate.resolve();
    await queue.onIdle();
    expect(worker.mock.calls.map(([k]) => k)).toEqual(['first', 'x']);
  });

  it('a failing job rejects only its own promise and the queue keeps going', async () => {
    const queue = createSequentialQueue(async (key: string) => {
      if (key === 'bad') throw new Error('boom');
      return key;
    });
    const bad = queue.enqueue('bad');
    const good = queue.enqueue('good');
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe('good');
  });

  it('calls onStart exactly when the job begins, not when it is enqueued', async () => {
    const gate = deferred<void>();
    const queue = createSequentialQueue(async (key: string) => {
      if (key === 'first') await gate.promise;
    });
    const onStart = vi.fn();
    queue.enqueue('first');
    queue.enqueue('second', { onStart });
    await tick();
    expect(onStart).not.toHaveBeenCalled();
    gate.resolve();
    await queue.onIdle();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('processProductImageById via enhancementQueue (real pipeline logic, mocked runtime)', () => {
  const PRODUCT = 'prod-1';
  const ARTISAN = 'artisan-1';
  const BUCKET = 'product-photos-raw';

  const row = (id: string, position: number, isCover: boolean) => ({
    id,
    product_id: PRODUCT,
    artisan_id: ARTISAN,
    position,
    original_image_url: `https://fake.storage/${BUCKET}/${ARTISAN}/${PRODUCT}/${id}/raw.jpg`,
    enhanced_image_url: null,
    image_processing_status: 'pending',
    final_image_choice: null,
    is_cover: isCover,
    created_at: '2026-09-24T00:00:00Z',
  });

  beforeEach(() => {
    fakeSupabase.reset({
      products: [{ id: PRODUCT, artisan_id: ARTISAN, listing_status: 'draft' }],
      product_images: [row('img-1', 0, true), row('img-2', 1, false), row('img-3', 2, false)],
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['raw'], { type: 'image/jpeg' }),
    })) as unknown as typeof fetch;
    vi.mocked(correctLighting).mockImplementation(async (b: Blob) => b);
  });

  afterEach(async () => {
    await enhancementQueue.onIdle();
    vi.mocked(runSegmentation).mockReset();
    vi.mocked(correctLighting).mockReset();
  });

  const imageRow = (id: string) => fakeSupabase.rows('product_images').find((r) => r.id === id)!;

  it('processes three photos strictly one at a time, each to its own enhanced path', async () => {
    const gates: Deferred<Blob>[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    vi.mocked(runSegmentation).mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      const gate = deferred<Blob>();
      gates.push(gate);
      try {
        return await gate.promise;
      } finally {
        concurrent--;
      }
    });

    const results = ['img-1', 'img-2', 'img-3'].map((id) => enhancementQueue.enqueue(id));
    await vi.waitFor(() => expect(gates).toHaveLength(1));

    expect(imageRow('img-1').image_processing_status).toBe('processing');
    expect(imageRow('img-2').image_processing_status).toBe('pending');
    expect(imageRow('img-3').image_processing_status).toBe('pending');

    gates[0].resolve(new Blob(['seg-1'], { type: 'image/png' }));
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    expect(imageRow('img-1').image_processing_status).toBe('enhanced');
    expect(imageRow('img-2').image_processing_status).toBe('processing');
    expect(imageRow('img-3').image_processing_status).toBe('pending');

    gates[1].resolve(new Blob(['seg-2'], { type: 'image/png' }));
    await vi.waitFor(() => expect(gates).toHaveLength(3));
    gates[2].resolve(new Blob(['seg-3'], { type: 'image/png' }));

    const settled = await Promise.all(results);
    expect(settled.map((r) => r.success)).toEqual([true, true, true]);
    expect(maxConcurrent).toBe(1);

    const uploads = fakeSupabase.calls.filter((c) => c.kind === 'upload').map((c) => c.payload);
    expect(uploads).toEqual([
      `${ARTISAN}/${PRODUCT}/img-1/enhanced.png`,
      `${ARTISAN}/${PRODUCT}/img-2/enhanced.png`,
      `${ARTISAN}/${PRODUCT}/img-3/enhanced.png`,
    ]);
    expect(imageRow('img-2').enhanced_image_url).toBe(
      `https://fake.storage/${BUCKET}/${ARTISAN}/${PRODUCT}/img-2/enhanced.png`
    );
  });

  it('mirrors the cover photo status onto products; non-cover processing does not touch it', async () => {
    vi.mocked(runSegmentation).mockResolvedValue(new Blob(['seg'], { type: 'image/png' }));

    await enhancementQueue.enqueue('img-2');
    const product = () => fakeSupabase.rows('products')[0];
    // img-1 (cover) is still pending: products mirrors it, not img-2
    expect(product().image_processing_status).toBe('pending');
    expect(product().enhanced_image_url).toBeNull();

    await enhancementQueue.enqueue('img-1');
    expect(product()).toMatchObject({
      image_processing_status: 'enhanced',
      enhanced_image_url: `https://fake.storage/${BUCKET}/${ARTISAN}/${PRODUCT}/img-1/enhanced.png`,
      original_image_url: row('img-1', 0, true).original_image_url,
    });
  });

  it('segmentation failure: resolves (never throws), marks the photo failed, logs, and the next photo still runs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runSegmentation)
      .mockRejectedValueOnce(new Error('model inference failure'))
      .mockResolvedValueOnce(new Blob(['seg'], { type: 'image/png' }));

    const [failed, ok] = await Promise.all([
      enhancementQueue.enqueue('img-1'),
      enhancementQueue.enqueue('img-2'),
    ]);

    expect(failed).toMatchObject({ success: false, imageId: 'img-1', error: 'model inference failure' });
    expect(imageRow('img-1').image_processing_status).toBe('failed');
    expect(fakeSupabase.rows('products')[0].image_processing_status).toBe('failed'); // cover mirrored
    expect(ok.success).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ImageEnhancementService] Error processing image img-1'),
      'model inference failure'
    );
    errorSpy.mockRestore();
  });

  it('enhanced upload failure is a failure, not a silent success', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runSegmentation).mockResolvedValue(new Blob(['seg'], { type: 'image/png' }));
    fakeSupabase.failNext(BUCKET, 'upload', 'quota exceeded');

    const result = await processProductImageById('img-3');

    expect(result.success).toBe(false);
    expect(result.error).toContain('quota exceeded');
    expect(imageRow('img-3').image_processing_status).toBe('failed');
    errorSpy.mockRestore();
  });

  it('missing image row: returns a failure result without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await processProductImageById('does-not-exist');
    expect(result.success).toBe(false);
    expect(runSegmentation).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
