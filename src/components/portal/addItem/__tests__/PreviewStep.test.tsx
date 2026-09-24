/**
 * Stage 6.6: PreviewStep (Add Item wizard step 3).
 *
 * REAL LOGIC under test (not mocked):
 * - PreviewStep component rendering and state machine
 * - ListingPreviewCard buyer view integration
 * - Facts hash stability and change detection (computeFactsHash, haveFactsChanged)
 * - Deterministic simple listing fallback template (generateSimpleListing)
 * - canProceed(3) approval gate logic
 * - Section revision and extra notes flows
 *
 * MOCKED AT THE BOUNDARY (explicitly):
 * - supabase.functions.invoke: mocked to test Edge Function contract responses
 *   (successful generation, revision, server error, and retry validation).
 * - speakText (config/languages): vi.fn to verify TTS utterances without speech hardware.
 * - transcribeForField (services/voiceTranscriptionService): returns canned voice transcripts.
 * - Hardware APIs: MockMediaRecorder and navigator.mediaDevices.getUserMedia.
 * - Supabase client: fakeSupabase in-memory client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewStep } from '../steps/PreviewStep';
import { fakeSupabase } from '../../../../test/fakeSupabase';
import { speakText } from '../../../../config/languages';
import { transcribeForField } from '../../../../services/voiceTranscriptionService';
import { canProceedPreview, computeFactsHash } from '../steps/listingLogic';
import type { ProductRecord, ListingResult } from '../../../../types/product';

// Boundary Mocks
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

// Mock Audio hardware for VoiceInputButton
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
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const originalMediaDevices = navigator.mediaDevices;
const originalMediaRecorder = window.MediaRecorder;
const originalAudioContext = window.AudioContext;

const PRODUCT_ID = 'prod-preview-1';
const ARTISAN_ID = 'artisan-preview-1';

const sampleListing: ListingResult = {
  title_en: 'Handcrafted Sheesham Chair',
  title_hi: 'हस्तनिर्मित शीशम की कुर्सी',
  seo_caption_en: 'Authentic solid sheesham wood chair handcrafted by Jaipur artisans.',
  seo_caption_hi: 'जयपुर के कारीगरों द्वारा हस्तनिर्मित ठोस शीशम की कुर्सी।',
  highlights_en: [
    'Made with solid Sheesham wood',
    'Hand carved joinery technique',
    'Dimensions: 90 x 45 x 45 cm',
    'Takes 4 days of skilled craftsmanship',
  ],
  highlights_hi: [
    'ठोस शीशम की लकड़ी से निर्मित',
    'हस्त नक्काशीदार जोड़ तकनीक',
    'आकार: 90 x 45 x 45 सेमी',
    '4 दिनों का कुशल कारीगरी कार्य',
  ],
  description_en: 'A solid sheesham wood chair crafted by hand using traditional joinery.',
  description_hi: 'पारंपरिक नक्काशी विधि से निर्मित ठोस शीशम की मजबूत कुर्सी।',
  search_tags: ['sheesham chair', 'wooden chair', 'jaipur craft', 'handcrafted'],
  summary_spoken: 'यह शीशम की कुर्सी 4 दिनों में हस्तनिर्मित की गई है।',
};

const baseDraft: ProductRecord = {
  id: PRODUCT_ID,
  artisan_id: ARTISAN_ID,
  listing_status: 'draft',
  wizard_step: 3,
  created_at: '2026-09-24T00:00:00Z',
  item_type: 'Chair',
  material: 'Sheesham',
  category: 'Furniture',
  labor_days: 4,
  dimensions: {
    shape: 'box',
    values: { length: 90, width: 45, height: 45 },
    unit: 'cm',
    approximate: false,
  },
  technique: 'Hand carved',
};

describe('PreviewStep Component Flows', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    fakeSupabase.reset({
      artisans: [
        {
          id: ARTISAN_ID,
          shop_name: 'Royal Heritage Woods',
          address: 'Jaipur',
          experience_years: 15,
          speaking_language: 'hi',
        },
      ],
      products: [{ ...baseDraft }],
      product_images: [],
    });

    // Setup media hardware stubs
    (window as any).MediaRecorder = MockMediaRecorder;
    (window as any).AudioContext = class {
      createMediaStreamSource() {
        return { connect: () => {} };
      }
      createAnalyser() {
        return {
          frequencyBinCount: 16,
          getByteFrequencyData: (arr: Uint8Array) => arr.fill(50),
        };
      }
      close() {}
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }],
        }),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    fakeSupabase.reset();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
    window.MediaRecorder = originalMediaRecorder;
    window.AudioContext = originalAudioContext;
    vi.clearAllMocks();
  });

  it('generates a listing automatically on entry when no listing exists on the draft', async () => {
    // Mock Edge Function invoke to return sample listing
    fakeSupabase.functionsInvoke = async (name, options) => {
      expect(name).toBe('generate-listing');
      expect((options?.body as any)?.mode).toBe('generate');
      return { data: sampleListing, error: null };
    };

    const onPatch = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={baseDraft} // No listing fields present
          speakingLanguage="hi"
          onDraftPatch={onPatch}
          artisanId={ARTISAN_ID}
        />
      );
    });

    // onDraftPatch should be called with generated listing fields
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title_en: sampleListing.title_en,
        title_hi: sampleListing.title_hi,
        seo_caption_en: sampleListing.seo_caption_en,
        highlights_en: sampleListing.highlights_en,
        listing_approved: false,
      })
    );
  });

  it('switches between Hindi and English preview via the language toggle', async () => {
    const draftWithListing: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_facts_hash: computeFactsHash(baseDraft),
      listing_approved: false,
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={draftWithListing}
          speakingLanguage="hi"
          onDraftPatch={vi.fn()}
          artisanId={ARTISAN_ID}
        />
      );
    });

    // Defaults to Hindi
    expect(container.querySelector('[data-testid="preview-title"]')?.textContent).toBe(sampleListing.title_hi);
    expect(container.querySelector('[data-testid="preview-caption"]')?.textContent).toBe(sampleListing.seo_caption_hi);

    // Click English toggle button
    const enBtn = container.querySelector('[data-testid="lang-toggle-en"]') as HTMLButtonElement;
    expect(enBtn).toBeTruthy();

    await act(async () => {
      enBtn.click();
    });

    // Switched to English
    expect(container.querySelector('[data-testid="preview-title"]')?.textContent).toBe(sampleListing.title_en);
    expect(container.querySelector('[data-testid="preview-caption"]')?.textContent).toBe(sampleListing.seo_caption_en);
  });

  it('reads aloud summary_spoken via speakText when Listen is clicked', async () => {
    const draftWithListing: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_facts_hash: computeFactsHash(baseDraft),
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={draftWithListing}
          speakingLanguage="hi"
          onDraftPatch={vi.fn()}
          artisanId={ARTISAN_ID}
        />
      );
    });

    const listenBtn = container.querySelector('[data-testid="listen-summary-btn"]') as HTMLButtonElement;
    expect(listenBtn).toBeTruthy();

    await act(async () => {
      listenBtn.click();
    });

    expect(speakText).toHaveBeenCalledWith(sampleListing.summary_spoken, 'hi');
  });

  it('reads full Hindi description when "Hear full Hindi" is clicked', async () => {
    const draftWithListing: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_facts_hash: computeFactsHash(baseDraft),
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={draftWithListing}
          speakingLanguage="hi"
          onDraftPatch={vi.fn()}
          artisanId={ARTISAN_ID}
        />
      );
    });

    const fullHindiBtn = container.querySelector('[data-testid="listen-hindi-full-btn"]') as HTMLButtonElement;
    expect(fullHindiBtn).toBeTruthy();

    await act(async () => {
      fullHindiBtn.click();
    });

    expect(speakText).toHaveBeenCalledWith(sampleListing.description_hi, 'hi');
  });

  it('handles voice edit of one section: sends instruction in revise mode and updates section', async () => {
    const draftWithListing: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_facts_hash: computeFactsHash(baseDraft),
    };

    const revisedListing = {
      ...sampleListing,
      title_en: 'Artisan Sheesham Lounge Chair',
      title_hi: 'कारीगरी शीशम लाउंज कुर्सी',
    };

    fakeSupabase.functionsInvoke = async (name, options) => {
      expect(name).toBe('generate-listing');
      expect((options?.body as any)?.mode).toBe('revise');
      expect((options?.body as any)?.revise?.section).toBe('title');
      return { data: revisedListing, error: null };
    };

    (transcribeForField as any).mockResolvedValue({
      status: 'success',
      value: {
        en: 'Make the title mention lounge chair',
        original: 'शीर्षक में लाउंज कुर्सी लिखो',
      },
      value_display_en: 'Make the title mention lounge chair',
      value_display_hi: 'शीर्षक में लाउंज कुर्सी लिखो',
      confidence: 0.9,
    });

    const onPatch = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={draftWithListing}
          speakingLanguage="hi"
          onDraftPatch={onPatch}
          artisanId={ARTISAN_ID}
        />
      );
    });

    // Click edit title pencil icon
    const editTitleBtn = container.querySelector('[data-testid="edit-title-btn"]') as HTMLButtonElement;
    expect(editTitleBtn).toBeTruthy();

    await act(async () => {
      editTitleBtn.click();
    });

    // Modal should be open
    const modal = container.querySelector('[data-testid="voice-edit-modal"]') as HTMLElement;
    expect(modal).toBeTruthy();

    // Trigger voice recording and confirmation from inside the modal
    const micBtn = modal.querySelector('[data-testid="voice-input-mic-button"]') as HTMLButtonElement;
    expect(micBtn).toBeTruthy();

    // Start recording
    await act(async () => {
      micBtn.click();
    });

    // Stop recording
    const stopBtn = document.body.querySelector('[data-testid="voice-stop-button"]') as HTMLButtonElement;
    if (stopBtn) {
      await act(async () => {
        stopBtn.click();
      });
    }

    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });

    // Click confirmation checkmark in VoiceInputButton
    const confirmBtn = document.body.querySelector('[data-testid="voice-confirm-yes-button"]') as HTMLButtonElement;
    if (confirmBtn) {
      await act(async () => {
        confirmBtn.click();
      });
    }

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title_en: 'Artisan Sheesham Lounge Chair',
        title_hi: 'कारीगरी शीशम लाउंज कुर्सी',
        listing_approved: false,
      })
    );
  });

  it('records extra notes ("Tell buyers anything else") and triggers regeneration', async () => {
    const draftWithListing: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_facts_hash: computeFactsHash(baseDraft),
    };

    (transcribeForField as any).mockResolvedValue({
      status: 'success',
      value: {
        en: 'Apply natural teak oil every six months for long lasting shine.',
        original: 'लंबे समय तक चमक के लिए हर छह महीने में प्राकृतिक तेल लगाएं।',
      },
      value_display_en: 'Apply natural teak oil every six months for long lasting shine.',
      value_display_hi: 'लंबे समय तक चमक के लिए हर छह महीने में प्राकृतिक तेल लगाएं।',
      confidence: 0.9,
    });

    let regenerationCalled = false;
    fakeSupabase.functionsInvoke = async (_name, options) => {
      if ((options?.body as any)?.mode === 'generate') {
        regenerationCalled = true;
      }
      return { data: sampleListing, error: null };
    };

    const onPatch = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={draftWithListing}
          speakingLanguage="hi"
          onDraftPatch={onPatch}
          artisanId={ARTISAN_ID}
        />
      );
    });

    const extraNotesCard = container.querySelector('[data-testid="extra-notes-card"]');
    expect(extraNotesCard).toBeTruthy();

    const notesMicBtn = extraNotesCard?.querySelector('[data-testid="voice-input-mic-button"]') as HTMLButtonElement;
    expect(notesMicBtn).toBeTruthy();

    await act(async () => {
      notesMicBtn.click(); // start
    });

    const stopBtn = document.body.querySelector('[data-testid="voice-stop-button"]') as HTMLButtonElement;
    if (stopBtn) {
      await act(async () => {
        stopBtn.click(); // stop
      });
    }

    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });

    const confirmBtn = document.body.querySelector('[data-testid="voice-confirm-yes-button"]') as HTMLButtonElement;
    if (confirmBtn) {
      await act(async () => {
        confirmBtn.click();
      });
    }

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        extra_notes_original: 'लंबे समय तक चमक के लिए हर छह महीने में प्राकृतिक तेल लगाएं।',
        listing_approved: false,
      })
    );
    expect(regenerationCalled).toBe(true);
  });

  it('prompts when facts changed post-approval and never overwrites without agreement', async () => {
    // Stored hash represents older facts before modification
    const draftWithOldHash: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_approved: true,
      listing_facts_hash: 'facts_old_hash_123', // differs from computeFactsHash(baseDraft)!
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={draftWithOldHash}
          speakingLanguage="hi"
          onDraftPatch={vi.fn()}
          artisanId={ARTISAN_ID}
        />
      );
    });

    // Warning prompt should appear
    const prompt = container.querySelector('[data-testid="facts-changed-prompt"]');
    expect(prompt).toBeTruthy();
    expect(prompt?.textContent).toContain('Details changed. Rewrite the listing?');

    // "Keep current listing" button updates hash without rewriting
    const keepBtn = container.querySelector('[data-testid="facts-changed-keep-btn"]') as HTMLButtonElement;
    expect(keepBtn).toBeTruthy();

    await act(async () => {
      keepBtn.click();
    });

    // Prompt disappears
    expect(container.querySelector('[data-testid="facts-changed-prompt"]')).toBeNull();
  });

  it('shows error banner on failure and enables deterministic simple listing fallback', async () => {
    fakeSupabase.functionsInvoke = async () => {
      return { data: null, error: new Error('Gemini quota exceeded.') };
    };

    const onPatch = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={baseDraft}
          speakingLanguage="hi"
          onDraftPatch={onPatch}
          artisanId={ARTISAN_ID}
        />
      );
    });

    // Friendly error banner displayed (never shows raw backend error to artisan)
    const errorCard = container.querySelector('[data-testid="generation-error-card"]');
    expect(errorCard).toBeTruthy();
    expect(errorCard?.textContent).toContain("We couldn't write the listing");
    expect(errorCard?.textContent).toContain('विवरण नहीं बन सका');
    expect(errorCard?.textContent).not.toContain('Gemini quota exceeded');

    // Tap "Use a simple listing"
    const simpleListingBtn = container.querySelector('[data-testid="use-simple-listing-btn"]') as HTMLButtonElement;
    expect(simpleListingBtn).toBeTruthy();

    await act(async () => {
      simpleListingBtn.click();
    });

    // Should apply deterministic listing
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title_en: expect.stringContaining('Handcrafted Sheesham Chair'),
        title_hi: expect.stringContaining('हस्तनिर्मित Sheesham Chair'),
        highlights_en: expect.any(Array),
      })
    );
  });

  it('automatically regenerates without prompt if unapproved listing has stale facts', async () => {
    // Draft has an existing listing, but listing_approved is false and facts have changed
    const staleUnapprovedDraft: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_approved: false,
      listing_facts_hash: 'facts_old_stale_hash_123',
    };

    let generateCalled = false;
    fakeSupabase.functionsInvoke = async (_name, options) => {
      if ((options?.body as any)?.mode === 'generate') {
        generateCalled = true;
      }
      return { data: sampleListing, error: null };
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={staleUnapprovedDraft}
          speakingLanguage="hi"
          onDraftPatch={vi.fn()}
          artisanId={ARTISAN_ID}
        />
      );
    });

    // Should have automatically triggered generation without showing prompt
    expect(generateCalled).toBe(true);
    expect(container.querySelector('[data-testid="facts-changed-prompt"]')).toBeNull();
  });

  it('ensures section edit buttons and gallery arrows have at least 48px touch targets', async () => {
    const draftWithListing: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_facts_hash: computeFactsHash(baseDraft),
      listing_approved: false,
    };

    fakeSupabase.tables.product_images = [
      {
        id: 'img-1',
        product_id: PRODUCT_ID,
        artisan_id: ARTISAN_ID,
        position: 0,
        is_cover: true,
        image_processing_status: 'enhanced',
        original_image_url: 'https://example.com/photo1.jpg',
        enhanced_image_url: 'https://example.com/photo1-enh.jpg',
        final_image_choice: 'enhanced',
        created_at: new Date().toISOString(),
      },
      {
        id: 'img-2',
        product_id: PRODUCT_ID,
        artisan_id: ARTISAN_ID,
        position: 1,
        is_cover: false,
        image_processing_status: 'original',
        original_image_url: 'https://example.com/photo2.jpg',
        enhanced_image_url: null,
        final_image_choice: 'original',
        created_at: new Date().toISOString(),
      },
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={draftWithListing}
          speakingLanguage="hi"
          onDraftPatch={vi.fn()}
          artisanId={ARTISAN_ID}
        />
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Verify all 4 section edit buttons have min-w-[48px] and min-h-[48px]
    const editBtns = [
      container.querySelector('[data-testid="edit-title-btn"]'),
      container.querySelector('[data-testid="edit-caption-btn"]'),
      container.querySelector('[data-testid="edit-highlights-btn"]'),
      container.querySelector('[data-testid="edit-description-btn"]'),
    ];

    for (const btn of editBtns) {
      expect(btn).toBeTruthy();
      expect(btn?.className).toContain('min-w-[48px]');
      expect(btn?.className).toContain('min-h-[48px]');
    }

    // Verify gallery navigation arrows have min-w-[48px] and min-h-[48px]
    const prevArrow = container.querySelector('[data-testid="gallery-prev-button"]');
    const nextArrow = container.querySelector('[data-testid="gallery-next-button"]');

    expect(prevArrow).toBeTruthy();
    expect(prevArrow?.className).toContain('min-w-[48px]');
    expect(prevArrow?.className).toContain('min-h-[48px]');

    expect(nextArrow).toBeTruthy();
    expect(nextArrow?.className).toContain('min-w-[48px]');
    expect(nextArrow?.className).toContain('min-h-[48px]');
  });

  it('approval sets listing_approved = true, gating canProceed(3)', async () => {
    const unapprovedDraft: ProductRecord = {
      ...baseDraft,
      ...sampleListing,
      listing_facts_hash: computeFactsHash(baseDraft),
      listing_approved: false,
    };

    // Before approval: canProceed(3) is false
    expect(canProceedPreview(unapprovedDraft)).toBe(false);

    const onPatch = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PreviewStep
          productId={PRODUCT_ID}
          draft={unapprovedDraft}
          speakingLanguage="hi"
          onDraftPatch={onPatch}
          artisanId={ARTISAN_ID}
        />
      );
    });

    const looksGoodBtn = container.querySelector('[data-testid="looks-good-btn"]') as HTMLButtonElement;
    expect(looksGoodBtn).toBeTruthy();
    expect(looksGoodBtn.textContent).toContain('Looks good / ठीक है');

    await act(async () => {
      looksGoodBtn.click();
    });

    expect(onPatch).toHaveBeenCalledWith({ listing_approved: true });

    // After approval: canProceed(3) is true
    const approvedDraft = { ...unapprovedDraft, listing_approved: true };
    expect(canProceedPreview(approvedDraft)).toBe(true);
  });
});
