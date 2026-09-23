/**
 * Stage 6.4: IdentifyStep (Add Item wizard step 1).
 *
 * REAL LOGIC under test (not mocked):
 *   IdentifyStep, identifyLogic, VoiceInputButton's UI/state machine,
 *   identifyProductPhotos (photo selection, 413 retry, response validation),
 *   productImageService.listProductImages, and draftService (real 800 ms
 *   debounced saves + flush) writing to the products row.
 *
 * MOCKED AT THE BOUNDARY (explicitly):
 *   - supabase.functions.invoke('identify-product'): vi.fn on the in-memory
 *     fake client (src/test/fakeSupabase.ts). No live Gemini key or deployed
 *     function exists here. Table reads/writes also go to that fake (no
 *     Postgres, no RLS).
 *   - speakText (config/languages): vi.fn, so we can assert what is read
 *     aloud; there is no speech engine under jsdom.
 *   - VoiceInputButton's transcription: transcribeForField
 *     (services/voiceTranscriptionService) returns a canned result, plus the
 *     MediaRecorder / getUserMedia hardware APIs it records with.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IdentifyStep } from '../steps/IdentifyStep';
import { isIdentifyStepComplete } from '../steps/identifyLogic';
import { fakeSupabase, fakeFunctionsHttpError } from '../../../../test/fakeSupabase';
import { speakText } from '../../../../config/languages';
import { transcribeForField } from '../../../../services/voiceTranscriptionService';
import { debouncedSaveDraft } from '../../../../services/draftService';
import type { ProductRecord } from '../../../../types/product';

vi.mock('../../../../lib/supabase/client', async () => {
  const { fakeSupabase: fake } = await import('../../../../test/fakeSupabase');
  return { supabase: fake.client };
});

vi.mock('../../../../config/languages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/languages')>()),
  speakText: vi.fn(),
}));

vi.mock('../../../../services/voiceTranscriptionService', () => ({
  transcribeForField: vi.fn(),
}));

const PRODUCT = 'prod-1';
const ARTISAN = 'artisan-1';
const url = (id: string, file = 'raw.jpg') =>
  `https://x.supabase.co/storage/v1/object/public/product-photos-raw/${ARTISAN}/${PRODUCT}/${id}/${file}`;

const photo = (id: string, position: number, isCover: boolean) => ({
  id,
  product_id: PRODUCT,
  artisan_id: ARTISAN,
  position,
  original_image_url: url(id),
  enhanced_image_url: url(id, 'enhanced.png'),
  image_processing_status: 'enhanced',
  final_image_choice: null,
  is_cover: isCover,
  created_at: '2026-09-25T00:00:00Z',
});

const AI_RESPONSE = {
  item_name: 'Carved Mandir',
  material: 'Teak Wood',
  category: 'Woodwork',
  confidence: 0.9,
  short_description: 'A hand-carved home temple.',
  secondary_materials: ['Brass inlay'],
  finish: 'polished',
  complexity: 'intricate',
  complexity_reason: 'Deep carving on every panel.',
  shape_profile: 'box',
  item_name_spoken: 'नक्काशीदार मंदिर',
  material_spoken: 'सागवान',
};

const baseDraft: ProductRecord = {
  id: PRODUCT,
  artisan_id: ARTISAN,
  listing_status: 'draft',
  wizard_step: 1,
  created_at: '2026-09-25T00:00:00Z',
};

// ---------- hardware boundary for VoiceInputButton (same as its own test) ----------
class MockMediaRecorder {
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
  static isTypeSupported() {
    return true;
  }
}

describe('IdentifyStep (Stage 6.4)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestDraft: ProductRecord;
  type InvokeFn = (name: string, options?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }>;
  let invoke: ReturnType<typeof vi.fn<InvokeFn>>;

  const Harness: React.FC<{ initial: ProductRecord; lang?: string }> = ({ initial, lang = 'hi' }) => {
    const [draft, setDraft] = useState(initial);
    latestDraft = draft;
    const onDraftPatch = useCallback((patch: Partial<ProductRecord>) => {
      setDraft((prev) => ({ ...prev, ...patch }));
    }, []);
    return <IdentifyStep productId={PRODUCT} draft={draft} speakingLanguage={lang} onDraftPatch={onDraftPatch} />;
  };

  const q = (testId: string, scope: ParentNode = container) =>
    scope.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;

  const flush = async (rounds = 6) => {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };

  const click = async (el: HTMLElement | null) => {
    expect(el).not.toBeNull();
    await act(async () => {
      el!.click();
    });
    await flush();
  };

  const render = async (initial: ProductRecord = baseDraft, lang = 'hi') => {
    await act(async () => {
      root.render(<Harness initial={initial} lang={lang} />);
    });
    await flush();
  };

  /** Runs the real VoiceInputButton: mic -> stop -> (mocked transcription) -> "Yes, correct". */
  const answerByVoice = async (scope: HTMLElement, text: string) => {
    vi.mocked(transcribeForField).mockResolvedValueOnce({
      status: 'ok',
      transcript_original: text,
      value: { original: text, en: text },
      value_display_en: text,
      value_display_hi: text,
      value_display_spoken: text,
      confidence: 0.9,
    });
    await click(scope.querySelector('[data-testid="voice-input-mic-button"]') as HTMLElement);
    await click(q('voice-stop-button', document.body));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    await flush();
    await click(q('voice-confirm-yes-button', document.body));
  };

  const persisted = async () => {
    await act(async () => {
      await debouncedSaveDraft.flush(PRODUCT);
    });
    return fakeSupabase.rows('products')[0];
  };

  const spoken = () => vi.mocked(speakText).mock.calls.map(([text]) => text);

  const aiIdentificationWrites = () =>
    fakeSupabase.calls.filter(
      (c) => c.kind === 'update' && c.target === 'products' && c.payload && 'ai_identification' in (c.payload as object)
    );

  const acceptAll = async () => {
    await click(q('answer-yes')); // (a) name
    await click(q('answer-yes')); // (b) material
    await click(q('confirm-selection')); // (c) category
    await click(q('confirm-selection')); // (d) complexity
    await click(q('confirm-selection')); // (e) shape
  };

  beforeEach(() => {
    fakeSupabase.reset({
      products: [{ ...baseDraft }],
      product_images: [photo('a', 0, true), photo('b', 1, false), photo('c', 2, false), photo('d', 3, false)],
    });
    invoke = vi.fn<InvokeFn>(async () => ({ data: { ...AI_RESPONSE }, error: null }));
    fakeSupabase.functionsInvoke = invoke;

    vi.mocked(speakText).mockClear();
    vi.mocked(transcribeForField).mockReset();
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
      configurable: true,
      writable: true,
    });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    debouncedSaveDraft.cancel();
    vi.restoreAllMocks();
  });

  it('entering: calls identify-product with the cover + next two ORIGINAL urls and the speaking language', async () => {
    let resolveInvoke!: (v: { data: unknown; error: unknown }) => void;
    invoke.mockImplementationOnce(() => new Promise((r) => (resolveInvoke = r)));
    await render();

    // Loading state: cover photo with scanning animation, bilingual
    expect(q('identify-loading')).not.toBeNull();
    expect(q('identify-cover-image')!.getAttribute('src')).toBe(url('a', 'enhanced.png'));
    expect(q('identify-loading')!.textContent).toContain('आपकी फोटो देख रहे हैं');

    expect(invoke).toHaveBeenCalledWith('identify-product', {
      body: { image_urls: [url('a'), url('b'), url('c')], speakingLanguage: 'hi' },
    });

    await act(async () => resolveInvoke({ data: { ...AI_RESPONSE }, error: null }));
    await flush();
    expect(q('question-card-item_type')).not.toBeNull();
  });

  it('all guesses accepted: every question spoken aloud, values saved, ai_confirmed, AI guess stored once', async () => {
    await render();

    expect(q('question-text')!.textContent).toContain('Is this a Carved Mandir?');
    expect(q('question-text')!.textContent).toContain('क्या यह नक्काशीदार मंदिर है?');
    await click(q('answer-yes'));

    expect(q('question-text')!.textContent).toContain('क्या यह सागवान से बना है?');
    await click(q('answer-yes'));

    expect(q('category-tile-Woodwork')!.getAttribute('data-selected')).toBe('true');
    await click(q('confirm-selection'));

    expect(q('complexity-card-intricate')!.getAttribute('data-selected')).toBe('true');
    expect(q('complexity-reason')!.textContent).toBe('Deep carving on every panel.');
    await click(q('confirm-selection'));

    expect(q('shape-card-box')!.getAttribute('data-selected')).toBe('true');
    expect(q('shape-card-flat')!.textContent).toContain('dupatta, wall panel');
    await click(q('confirm-selection'));

    expect(q('identify-summary')).not.toBeNull();
    expect(spoken()).toEqual([
      'क्या यह नक्काशीदार मंदिर है?',
      'क्या यह सागवान से बना है?',
      'यह किस तरह का शिल्प है?',
      'काम कितना बारीक है? Deep carving on every panel.',
      'इसका आकार कैसा है?',
    ]);

    const row = await persisted();
    expect(row).toMatchObject({
      item_type: 'Carved Mandir',
      material: 'Teak Wood',
      category: 'Woodwork',
      complexity: 'intricate',
      shape_profile: 'box',
      secondary_materials: ['Brass inlay'],
      finish: 'polished',
      identification_source: 'ai_confirmed',
      ai_identification: AI_RESPONSE,
      identification_photos: { used_image_ids: ['a', 'b', 'c'], cover_image_id: 'a', all_image_ids: ['a', 'b', 'c', 'd'] },
    });
    expect(aiIdentificationWrites()).toHaveLength(1);
    expect(isIdentifyStepComplete(latestDraft)).toBe(true);
  });

  it('name corrected by voice: "No" opens the voice answer; artisan_corrected; AI guess untouched', async () => {
    await render();
    await click(q('answer-no'));

    const panel = q('correction-panel')!;
    expect(panel).not.toBeNull();
    expect(spoken()).toContain('तो यह क्या है? बोलकर बताइए।');

    await answerByVoice(panel, 'Wall Shelf');
    expect(transcribeForField).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ key: 'item_type', type: 'text' }), 'hi');

    await click(q('answer-yes')); // material
    await click(q('confirm-selection'));
    await click(q('confirm-selection'));
    await click(q('confirm-selection'));

    const row = await persisted();
    expect(row.item_type).toBe('Wall Shelf');
    expect(row.identification_source).toBe('artisan_corrected');
    expect(row.ai_identification).toEqual(AI_RESPONSE); // still the AI's original "Carved Mandir"
    expect(aiIdentificationWrites()).toHaveLength(1);
  });

  it('material corrected by a quick-pick chip', async () => {
    await render();
    await click(q('answer-yes'));
    await click(q('answer-no'));

    const chips = q('material-chips')!;
    for (const label of ['Teak', 'Sheesham', 'Mango wood', 'Brass', 'Copper', 'Terracotta', 'Cotton', 'Silk']) {
      expect(chips.textContent).toContain(label);
    }
    await click(q('material-chip-Sheesham Wood'));
    expect(q('question-card-category')).not.toBeNull();

    await click(q('confirm-selection'));
    await click(q('confirm-selection'));
    await click(q('confirm-selection'));

    const row = await persisted();
    expect(row.material).toBe('Sheesham Wood');
    expect(row.identification_source).toBe('artisan_corrected');
    expect((row.ai_identification as { material: string }).material).toBe('Teak Wood');
  });

  it('low confidence (< 0.6) is phrased as "Could this be a ...?"', async () => {
    invoke.mockResolvedValueOnce({ data: { ...AI_RESPONSE, confidence: 0.42 }, error: null });
    await render(baseDraft, 'hi');
    expect(q('question-text')!.textContent).toContain('Could this be a Carved Mandir?');
    expect(spoken()[0]).toBe('क्या यह नक्काशीदार मंदिर हो सकता है?');
  });

  it('missing complexity and shape: nothing preselected, no reason read, artisan must choose', async () => {
    const { complexity: _c, complexity_reason: _r, shape_profile: _s, ...partial } = AI_RESPONSE;
    invoke.mockResolvedValueOnce({ data: partial, error: null });
    await render();
    await click(q('answer-yes'));
    await click(q('answer-yes'));
    await click(q('confirm-selection')); // category

    expect(q('question-card-complexity')).not.toBeNull();
    for (const id of ['simple', 'medium', 'intricate']) {
      expect(q(`complexity-card-${id}`)!.getAttribute('data-selected')).toBe('false');
    }
    expect(q('confirm-selection')).toBeNull();
    expect(q('complexity-reason')).toBeNull();
    expect(spoken()).toContain('काम कितना बारीक है?');
    expect(isIdentifyStepComplete(latestDraft)).toBe(false);
    await click(q('complexity-card-medium'));

    for (const id of ['box', 'flat', 'round']) {
      expect(q(`shape-card-${id}`)!.getAttribute('data-selected')).toBe('false');
    }
    expect(q('confirm-selection')).toBeNull();
    await click(q('shape-card-round'));

    const row = await persisted();
    expect(row).toMatchObject({ complexity: 'medium', shape_profile: 'round' });
    // The AI made no complexity/shape guess, so choosing them is not a correction.
    expect(row.identification_source).toBe('ai_confirmed');
  });

  it.each([
    ['missing API key (500)', fakeFunctionsHttpError(500, { error: 'GEMINI_API_KEY is not configured on the Supabase Edge Function.' })],
    ['disallowed URL (400)', fakeFunctionsHttpError(400, { error: 'image_urls may only point to product photos in this project’s Supabase storage.' })],
    ['network failure', new Error('Failed to fetch')],
  ])('identification failure (%s): friendly message, manual answers, never blocked, no raw error shown', async (_label, error) => {
    invoke.mockResolvedValue({ data: null, error });
    await render();

    const banner = q('identify-failure-banner')!;
    expect(banner.textContent).toContain('अपने आप पहचान नहीं हो सकी');
    for (const raw of ['GEMINI_API_KEY', 'image_urls', 'Failed to fetch', '500', '400', 'Edge Function']) {
      expect(container.textContent).not.toContain(raw);
    }

    // Manual: voice for the name (no Yes/No because there is no guess)
    expect(q('answer-yes')).toBeNull();
    expect(q('question-text')!.textContent).toContain('What is this item?');
    await answerByVoice(q('correction-panel')!, 'Clay Pot');
    await click(q('material-chip-Terracotta'));
    expect(q('category-tile-Pottery')!.getAttribute('data-selected')).toBe('false');
    await click(q('category-tile-Pottery'));
    await click(q('complexity-card-simple'));
    await click(q('shape-card-round'));

    const row = await persisted();
    expect(row).toMatchObject({
      item_type: 'Clay Pot',
      material: 'Terracotta',
      category: 'Pottery',
      complexity: 'simple',
      shape_profile: 'round',
      identification_source: 'artisan_corrected',
    });
    expect(row.ai_identification ?? null).toBeNull();
    expect(aiIdentificationWrites()).toHaveLength(0);
    expect(isIdentifyStepComplete(latestDraft)).toBe(true);
  });

  it('413: retries once with the cover only and records that only the cover was used', async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: fakeFunctionsHttpError(413, { error: 'too large' }) })
      .mockResolvedValueOnce({ data: { ...AI_RESPONSE }, error: null });
    await render();

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1]).toEqual({ body: { image_urls: [url('a')], speakingLanguage: 'hi' } });
    expect(q('question-card-item_type')).not.toBeNull();
    expect(q('identify-failure-banner')).toBeNull();

    const row = await persisted();
    expect(row.identification_photos).toEqual({
      used_image_ids: ['a'],
      cover_image_id: 'a',
      all_image_ids: ['a', 'b', 'c', 'd'],
    });
  });

  describe('photos changed after identification', () => {
    const confirmedDraft: ProductRecord = {
      ...baseDraft,
      item_type: 'Carved Mandir',
      material: 'Teak Wood',
      category: 'Woodwork',
      complexity: 'intricate',
      shape_profile: 'box',
      secondary_materials: ['Brass inlay'],
      finish: 'polished',
      identification_source: 'ai_confirmed',
      ai_identification: AI_RESPONSE as ProductRecord['ai_identification'],
      identification_photos: { used_image_ids: ['a', 'b', 'c'], cover_image_id: 'a', all_image_ids: ['a', 'b', 'c', 'd'] },
    };

    beforeEach(() => {
      fakeSupabase.tables.products = [{ ...confirmedDraft }];
    });

    it('unchanged photos: shows the confirmed answers, no prompt, no new identify call', async () => {
      await render(confirmedDraft);
      expect(q('identify-summary')).not.toBeNull();
      expect(q('photos-changed-banner')).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    });

    it.each([
      ['cover changed', () => fakeSupabase.tables.product_images.forEach((p) => (p.is_cover = p.id === 'b'))],
      ['photo added', () => fakeSupabase.tables.product_images.push(photo('e', 4, false))],
      ['photo removed', () => (fakeSupabase.tables.product_images = fakeSupabase.tables.product_images.filter((p) => p.id !== 'd'))],
    ])('%s: prompts "Photos changed. Check again?" without re-identifying on its own', async (_label, mutate) => {
      mutate();
      await render(confirmedDraft);
      expect(q('photos-changed-banner')!.textContent).toContain('Photos changed. Check again? / फोटो बदली हैं। फिर से जांचें?');
      expect(invoke).not.toHaveBeenCalled();

      await click(q('keep-answers-button'));
      expect(q('photos-changed-banner')).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    });

    it('re-identify: new guesses are asked again; confirmed answers change only when the artisan agrees', async () => {
      fakeSupabase.tables.product_images.forEach((p) => (p.is_cover = p.id === 'b'));
      const newGuess = { ...AI_RESPONSE, item_name: 'Temple Shelf', item_name_spoken: 'मंदिर शेल्फ', material: 'Sheesham Wood', material_spoken: 'शीशम' };
      invoke.mockResolvedValueOnce({ data: newGuess, error: null });
      await render(confirmedDraft);

      await click(q('recheck-button'));
      expect(invoke).toHaveBeenCalledWith('identify-product', {
        body: { image_urls: [url('b'), url('a'), url('c')], speakingLanguage: 'hi' },
      });

      // New guess asked; nothing overwritten yet
      expect(q('question-text')!.textContent).toContain('Is this a Temple Shelf?');
      let row = await persisted();
      expect(row.item_type).toBe('Carved Mandir');
      expect(row.material).toBe('Teak Wood');

      // Keep the old name, accept the new material
      expect(q('keep-answer')!.textContent).toContain('Carved Mandir');
      await click(q('keep-answer'));
      await click(q('answer-yes'));
      await click(q('confirm-selection'));
      await click(q('confirm-selection'));
      await click(q('confirm-selection'));

      row = await persisted();
      expect(row.item_type).toBe('Carved Mandir'); // kept
      expect(row.material).toBe('Sheesham Wood'); // agreed
      expect(row.ai_identification).toEqual(newGuess); // the new run's untouched response
      expect(row.identification_photos).toMatchObject({ cover_image_id: 'b', used_image_ids: ['b', 'a', 'c'] });
      expect(row.identification_source).toBe('artisan_corrected'); // kept name differs from the new guess
      expect(aiIdentificationWrites()).toHaveLength(1); // exactly once for this run
    });
  });

  it('ai_identification is never overwritten by confirmed values or later edits', async () => {
    await render();
    await acceptAll();

    // Edit two answers from the summary afterwards
    await click(q('edit-item_type'));
    // The answer already equals the AI guess, so "Change" goes straight to the voice answer.
    expect(q('answer-yes')).toBeNull();
    await answerByVoice(q('correction-panel')!, 'Pooja Ghar');
    await click(q('edit-category'));
    await click(q('category-tile-Furniture'));
    await click(q('remove-secondary-0'));

    const row = await persisted();
    expect(row.item_type).toBe('Pooja Ghar');
    expect(row.category).toBe('Furniture');
    expect(row.secondary_materials).toEqual([]);
    expect(row.ai_identification).toEqual(AI_RESPONSE);
    expect(aiIdentificationWrites()).toHaveLength(1);
    expect(row.identification_source).toBe('artisan_corrected');
  });

  it('canProceed(1) only once all five are confirmed', async () => {
    await render();
    const checks: boolean[] = [isIdentifyStepComplete(latestDraft)];
    for (const target of ['answer-yes', 'answer-yes', 'confirm-selection', 'confirm-selection', 'confirm-selection']) {
      await click(q(target));
      checks.push(isIdentifyStepComplete(latestDraft));
    }
    expect(checks).toEqual([false, false, false, false, false, true]);
  });

  it('leaving the step flushes pending answers immediately', async () => {
    await render();
    await click(q('answer-yes'));
    // Still inside the 800 ms debounce window
    expect(fakeSupabase.rows('products')[0].item_type).toBeUndefined();
    await act(async () => root.unmount());
    await flush();
    expect(fakeSupabase.rows('products')[0].item_type).toBe('Carved Mandir');
    root = createRoot(container); // for afterEach
  });
});
