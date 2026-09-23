/**
 * Stage 6.5: DescribeStep (Add Item wizard step 2).
 *
 * REAL LOGIC under test (not mocked):
 *   DescribeStep, describeLogic (dimension conversion, resume machine,
 *   canProceed(2)), VoiceInputButton's UI/state machine, techniqueOptions,
 *   and the real draftService (800ms debounced saves + flush) writing to the
 *   products row via the Supabase client.
 *
 * MOCKED AT THE BOUNDARY (explicitly):
 *   - Supabase client -> in-memory fake (src/test/fakeSupabase.ts). No
 *     Postgres, RLS or triggers run.
 *   - speakText (config/languages): vi.fn, so we can assert what is read
 *     aloud; there is no speech engine under jsdom.
 *   - VoiceInputButton's transcription: transcribeForField
 *     (services/voiceTranscriptionService) returns a canned result, plus the
 *     MediaRecorder / getUserMedia hardware APIs it records with.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DescribeStep } from '../steps/DescribeStep';
import { fakeSupabase } from '../../../../test/fakeSupabase';
import { speakText } from '../../../../config/languages';
import { transcribeForField } from '../../../../services/voiceTranscriptionService';
import { debouncedSaveDraft } from '../../../../services/draftService';
import type { ProductAiIdentification, ProductRecord } from '../../../../types/product';

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

const baseDraft = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  id: PRODUCT,
  artisan_id: ARTISAN,
  listing_status: 'draft',
  wizard_step: 2,
  created_at: '2026-09-27T00:00:00Z',
  category: 'Woodwork',
  shape_profile: 'box',
  ...overrides,
});

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

describe('DescribeStep (Stage 6.5)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const Harness: React.FC<{ initial: ProductRecord; lang?: string }> = ({ initial, lang = 'hi' }) => {
    const [draft, setDraft] = useState(initial);
    const onDraftPatch = useCallback((patch: Partial<ProductRecord>) => {
      setDraft((prev) => ({ ...prev, ...patch }));
    }, []);
    return <DescribeStep productId={PRODUCT} draft={draft} speakingLanguage={lang} onDraftPatch={onDraftPatch} />;
  };

  const q = (testId: string, scope: ParentNode = container) => scope.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;

  const flush = async (rounds = 4) => {
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

  const render = async (initial: ProductRecord = baseDraft(), lang = 'hi') => {
    await act(async () => {
      root.render(<Harness initial={initial} lang={lang} />);
    });
    await flush();
  };

  /** Runs the real VoiceInputButton: mic -> stop -> (mocked transcription) -> "Yes, correct". */
  const answerByVoice = async (scope: HTMLElement, mockedResult: Parameters<typeof transcribeForField>[0] extends never ? never : any) => {
    vi.mocked(transcribeForField).mockResolvedValueOnce(mockedResult);
    await click(scope.querySelector('[data-testid="voice-input-mic-button"]') as HTMLElement);
    await click(q('voice-stop-button', document.body));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    await flush();
  };

  const confirmVoice = async () => click(q('voice-confirm-yes-button', document.body));

  const dimsResult = (value: Record<string, unknown>) => ({
    status: 'ok' as const,
    transcript_original: 'x',
    value,
    value_display_en: 'x',
    value_display_hi: 'x',
    value_display_spoken: 'x',
    confidence: 0.9,
  });

  const textResult = (text: string) => ({
    status: 'ok' as const,
    transcript_original: text,
    value: { original: text, en: text },
    value_display_en: text,
    value_display_hi: text,
    value_display_spoken: text,
    confidence: 0.9,
  });

  const numberResult = (n: number) => ({
    status: 'ok' as const,
    transcript_original: String(n),
    value: n,
    value_display_en: String(n),
    value_display_hi: String(n),
    value_display_spoken: String(n),
    confidence: 0.9,
  });

  const persisted = async () => {
    await act(async () => {
      await debouncedSaveDraft.flush(PRODUCT);
    });
    return fakeSupabase.rows('products')[0];
  };

  const skipFactsScreen = async () => click(q('facts-continue'));

  /** Drives dimensions -> technique -> labor_days -> availability(ready) -> quantity, landing on summary. */
  const completeBoxRequiredFlow = async () => {
    await answerByVoice(q('question-card-dimensions')!, dimsResult({ length: 10, width: 10, height: 10, unit: 'cm' }));
    await confirmVoice();
    await click(q('technique-tile-hand-carved'));
    await answerByVoice(q('question-card-labor_days')!, numberResult(3));
    await confirmVoice();
    await click(q('availability-tile-ready'));
    await answerByVoice(q('question-card-availability_followup')!, numberResult(2));
    await confirmVoice();
  };

  beforeEach(() => {
    fakeSupabase.reset({ products: [baseDraft()] });
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

  it('opening choice is spoken aloud and offers AI-assisted (primary) and manual (secondary)', async () => {
    await render();
    expect(q('describe-choice')).not.toBeNull();
    expect(q('choose-ai-assisted')!.textContent).toContain('Let AI help');
    expect(q('choose-manual')!.textContent).toContain('I\'ll describe it myself');
    expect(vi.mocked(speakText)).toHaveBeenCalledWith(
      expect.stringContaining('AI आपकी मदद करे'),
      'hi'
    );
  });

  it('AI path: chips are prefilled from ai_identification; keep, remove, and add by voice; saves description_mode + facts', async () => {
    const ai: Partial<ProductAiIdentification> = {
      visible_features: ['carved floral motif', 'brass handles'],
      colors: ['brown', 'gold'],
      style: 'traditional',
      suggested_use: ['living room', 'puja room'],
    };
    await render(baseDraft({ ai_identification: ai as ProductAiIdentification }));
    await click(q('choose-ai-assisted'));

    expect(q('describe-facts')).not.toBeNull();
    expect(q('facts-manual-notice')).toBeNull(); // AI had facts, no fallback notice
    expect(q('feature-chip-0')!.textContent).toContain('carved floral motif');
    expect(q('feature-chip-1')!.textContent).toContain('brass handles');
    expect(q('color-chip-0')!.textContent).toContain('brown');
    expect(q('style-tile-traditional')!.getAttribute('data-selected')).toBe('true');
    expect(q('use-chip-0')!.textContent).toContain('living room');

    // Remove one feature chip
    await click(q('remove-feature-0'));
    expect(q('feature-chip-0')!.textContent).toContain('brass handles');

    // Add a color by voice
    await answerByVoice(q('add-color-voice')!, textResult('gold'));
    await confirmVoice();

    await click(q('facts-continue'));

    const row = await persisted();
    expect(row.description_mode).toBe('ai_assisted');
    expect(row.visible_features).toEqual(['brass handles']);
    expect(row.colors).toEqual(['brown', 'gold']);
    expect(row.style).toBe('traditional');
    expect(row.suggested_use).toEqual(['living room', 'puja room']);
  });

  it('AI path with ai_identification missing these fields falls back to voice, same as manual', async () => {
    await render(baseDraft({ ai_identification: { item_name: 'x', material: 'y', category: 'Woodwork', confidence: 0.8, short_description: 'z' } as ProductAiIdentification }));
    await click(q('choose-ai-assisted'));

    expect(q('facts-manual-notice')).not.toBeNull();
    expect(q('feature-chip-0')).toBeNull();
    expect(q('color-chip-0')).toBeNull();
    expect(q('style-tile-traditional')!.getAttribute('data-selected')).toBe('false');

    const row = await persisted();
    expect(row.description_mode).toBe('ai_assisted');
  });

  it('manual path: no prefilled chips; artisan adds everything by voice/icon', async () => {
    const ai: Partial<ProductAiIdentification> = { visible_features: ['carved motif'], colors: ['brown'] };
    await render(baseDraft({ ai_identification: ai as ProductAiIdentification }));
    await click(q('choose-manual'));

    // Even though ai_identification has data, manual mode never uses it.
    expect(q('feature-chip-0')).toBeNull();
    expect(q('color-chip-0')).toBeNull();

    await click(q('style-tile-rustic'));
    await click(q('facts-continue'));

    const row = await persisted();
    expect(row.description_mode).toBe('manual');
    expect(row.style).toBe('rustic');
    expect(row.visible_features).toEqual([]);
  });

  it('a pot (round shape) asks only height + diameter for size — never length or width', async () => {
    await render(baseDraft({ shape_profile: 'round', category: 'Pottery' }));
    await click(q('choose-manual'));
    await skipFactsScreen();

    expect(q('question-card-dimensions')).not.toBeNull();
    await answerByVoice(q('question-card-dimensions')!, dimsResult({ height: 30, diameter: 20, unit: 'cm' }));
    expect(transcribeForField).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({ key: 'dimensions', dimension_keys: ['height', 'diameter'] }),
      'hi'
    );
    await confirmVoice();

    // Round shape never shows the thickness sub-question; goes straight to technique.
    expect(q('question-card-technique')).not.toBeNull();
    const row = await persisted();
    expect(row.dimensions).toEqual({ shape: 'round', values: { height: 30, diameter: 20 }, unit: 'cm', approximate: false });
  });

  it('a dupatta (flat shape) is never asked for height; thickness is optional and skippable', async () => {
    await render(baseDraft({ shape_profile: 'flat', category: 'Textile' }));
    await click(q('choose-manual'));
    await skipFactsScreen();

    await answerByVoice(q('question-card-dimensions')!, dimsResult({ length: 200, width: 90, unit: 'cm' }));
    expect(transcribeForField).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({ dimension_keys: ['length', 'width'] }),
      'hi'
    );
    await confirmVoice();

    // Optional thickness sub-question, with a Skip button.
    expect(q('question-card-thickness')).not.toBeNull();
    expect(q('skip-thickness')).not.toBeNull();
    await click(q('skip-thickness'));

    expect(q('question-card-technique')).not.toBeNull();
    const row = await persisted();
    expect(row.dimensions).toEqual({ shape: 'flat', values: { length: 200, width: 90 }, unit: 'cm', approximate: false });
  });

  it('flat shape: answering thickness saves it onto the existing dimensions', async () => {
    await render(baseDraft({ shape_profile: 'flat', category: 'Textile' }));
    await click(q('choose-manual'));
    await skipFactsScreen();
    await answerByVoice(q('question-card-dimensions')!, dimsResult({ length: 200, width: 90, unit: 'cm' }));
    await confirmVoice();

    await answerByVoice(q('question-card-thickness')!, dimsResult({ thickness: 0.3, unit: 'cm' }));
    await confirmVoice();

    const row = await persisted();
    expect(row.dimensions.values).toEqual({ length: 200, width: 90, thickness: 0.3 });
  });

  it('technique cards are filtered by category, tap-to-confirm, and also answerable by voice', async () => {
    await render(baseDraft({ category: 'Pottery', shape_profile: 'round' }));
    await click(q('choose-manual'));
    await skipFactsScreen();
    await answerByVoice(q('question-card-dimensions')!, dimsResult({ height: 10, diameter: 10, unit: 'cm' }));
    await confirmVoice();

    expect(q('question-card-technique')!.textContent).toContain('Wheel-thrown');
    expect(q('technique-tile-hand-carved')).toBeNull(); // Woodwork technique, not Pottery
    await click(q('technique-tile-wheel-thrown'));

    const row = await persisted();
    expect(row.technique).toBe('wheel-thrown');
  });

  it('ready branch asks "how many do you have?" and saves quantity_available', async () => {
    await render();
    await click(q('choose-manual'));
    await skipFactsScreen();
    await answerByVoice(q('question-card-dimensions')!, dimsResult({ length: 5, width: 5, height: 5, unit: 'cm' }));
    await confirmVoice();
    await click(q('technique-tile-hand-carved'));
    await answerByVoice(q('question-card-labor_days')!, numberResult(2));
    await confirmVoice();

    await click(q('availability-tile-ready'));
    expect(q('question-card-availability_followup')!.textContent).toContain('How many do you have?');
    await answerByVoice(q('question-card-availability_followup')!, numberResult(4));
    await confirmVoice();

    const row = await persisted();
    expect(row.availability).toBe('ready');
    expect(row.quantity_available).toBe(4);
    expect(row.lead_time_days ?? null).toBeNull();
  });

  it('made-to-order branch asks "how many days to make a new one?" and saves lead_time_days', async () => {
    await render();
    await click(q('choose-manual'));
    await skipFactsScreen();
    await answerByVoice(q('question-card-dimensions')!, dimsResult({ length: 5, width: 5, height: 5, unit: 'cm' }));
    await confirmVoice();
    await click(q('technique-tile-hand-carved'));
    await answerByVoice(q('question-card-labor_days')!, numberResult(2));
    await confirmVoice();

    await click(q('availability-tile-made_to_order'));
    expect(q('question-card-availability_followup')!.textContent).toContain('How many days to make a new one?');
    await answerByVoice(q('question-card-availability_followup')!, numberResult(15));
    await confirmVoice();

    const row = await persisted();
    expect(row.availability).toBe('made_to_order');
    expect(row.lead_time_days).toBe(15);
    expect(row.quantity_available ?? null).toBeNull();
  });

  it('reaching the summary after all required answers reflects canProceed(2) completeness', async () => {
    await render();
    await click(q('choose-manual'));
    await skipFactsScreen();
    await completeBoxRequiredFlow();

    expect(q('describe-summary')).not.toBeNull();
    expect(q('summary-row-dimensions')).not.toBeNull();
    expect(q('summary-row-availability')!.textContent).toContain('Ready now');
  });

  it('optional questions (customization, story, care) show a Skip button; required ones do not', async () => {
    await render();
    await click(q('choose-manual'));
    await skipFactsScreen();
    await completeBoxRequiredFlow();
    await click(q('edit-optional-facts'));

    expect(q('question-card-customization')).not.toBeNull();
    expect(q('skip-customization')).not.toBeNull();
    await click(q('skip-customization'));

    expect(q('question-card-story')).not.toBeNull();
    expect(q('skip-story')).not.toBeNull();
    await click(q('skip-story'));

    expect(q('question-card-care')).not.toBeNull();
    expect(q('skip-care')).not.toBeNull();
    await click(q('skip-care'));

    expect(q('describe-summary')).not.toBeNull();

    const row = await persisted();
    expect(row.accepts_customization ?? null).toBeNull();
    expect(row.story_original ?? null).toBeNull();
    expect(row.care_instructions ?? null).toBeNull();
  });

  it('required cards (dimensions, technique, labor_days, availability, availability_followup) never show a Skip button', async () => {
    await render();
    await click(q('choose-manual'));
    await skipFactsScreen();

    expect(q('question-card-dimensions')!.querySelector('[data-testid^="skip-"]')).toBeNull();
    await answerByVoice(q('question-card-dimensions')!, dimsResult({ length: 5, width: 5, height: 5, unit: 'cm' }));
    await confirmVoice();

    expect(q('question-card-technique')!.querySelector('[data-testid^="skip-"]')).toBeNull();
    await click(q('technique-tile-hand-carved'));

    expect(q('question-card-labor_days')!.querySelector('[data-testid^="skip-"]')).toBeNull();
    await answerByVoice(q('question-card-labor_days')!, numberResult(1));
    await confirmVoice();

    expect(q('question-card-availability')!.querySelector('[data-testid^="skip-"]')).toBeNull();
    await click(q('availability-tile-ready'));

    expect(q('question-card-availability_followup')!.querySelector('[data-testid^="skip-"]')).toBeNull();
  });

  it('story is saved as story_original + story_en from the voice transcript', async () => {
    await render();
    await click(q('choose-manual'));
    await skipFactsScreen();
    await completeBoxRequiredFlow();
    await click(q('edit-optional-facts'));
    await click(q('skip-customization'));

    vi.mocked(transcribeForField).mockResolvedValueOnce({
      status: 'ok',
      transcript_original: 'मैंने यह मंदिर बनाया',
      value: { original: 'मैंने यह मंदिर बनाया', en: 'I made this temple' },
      value_display_en: 'I made this temple',
      value_display_hi: 'मैंने यह मंदिर बनाया',
      value_display_spoken: 'मैंने यह मंदिर बनाया',
      confidence: 0.9,
    });
    await click(q('question-card-story')!.querySelector('[data-testid="voice-input-mic-button"]') as HTMLElement);
    await click(q('voice-stop-button', document.body));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    await flush();
    await confirmVoice();

    await click(q('skip-care'));

    const row = await persisted();
    expect(row.story_original).toBe('मैंने यह मंदिर बनाया');
    expect(row.story_en).toBe('I made this temple');
  });

  it('the story recorder allows up to 90 seconds (not the default 60)', async () => {
    await render();
    await click(q('choose-manual'));
    await skipFactsScreen();
    await completeBoxRequiredFlow();
    await click(q('edit-optional-facts'));
    await click(q('skip-customization'));

    const storyMic = q('question-card-story')!.querySelector('[data-testid="voice-input-mic-button"]') as HTMLElement;
    await click(storyMic);
    expect(document.body.querySelector('[data-testid="voice-listening-indicator"]')?.textContent).toContain('1:30');
  });

  it('resuming a draft with description_mode already set skips the opening choice and facts screen', async () => {
    await render(
      baseDraft({
        description_mode: 'manual',
        dimensions: { shape: 'box', values: { length: 5, width: 5, height: 5 }, unit: 'cm', approximate: false } as ProductRecord['dimensions'],
        technique: 'hand-carved',
      })
    );

    expect(q('describe-choice')).toBeNull();
    expect(q('describe-facts')).toBeNull();
    expect(q('question-card-labor_days')).not.toBeNull(); // resumes exactly where it left off
  });
});
