/**
 * Stage 6.1: AddItemWizard Component & Hook Unit Tests
 * 
 * EXPLICIT ENVIRONMENT & TESTING BOUNDARY NOTE:
 * Supabase is mocked at the client boundary for these component tests.
 * The PostgreSQL Row Level Security (RLS) policy changes and database triggers
 * were NOT verified against a live Supabase database in this local/offline test environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AddItemWizard } from '../AddItemWizard';
import * as draftService from '../../../../services/draftService';
import * as storageService from '../../../../services/storageService';
import type { ProductRecord } from '../../../../types/product';

vi.mock('../../../../services/draftService', () => {
  const debouncedSaveDraftMock = vi.fn().mockResolvedValue(null);
  // @ts-ignore
  debouncedSaveDraftMock.flush = vi.fn().mockResolvedValue(undefined);
  // @ts-ignore
  debouncedSaveDraftMock.cancel = vi.fn();

  return {
    getOrCreateDraft: vi.fn(),
    saveDraft: vi.fn().mockResolvedValue(null),
    debouncedSaveDraft: debouncedSaveDraftMock,
    hasDraftContent: vi.fn(),
    deleteDraft: vi.fn().mockResolvedValue(true),
    fetchArtisanDrafts: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../../../services/storageService', () => ({
  updateArtisanProfile: vi.fn().mockResolvedValue(null),
}));

// Stage 6.2: PhotosStep is replaced by a stub that reports an uploaded-photo
// count, so these tests exercise the wizard's canProceed(0) gating in
// isolation. PhotosStep's real behaviour is covered in PhotosStep.test.tsx.
vi.mock('../steps/PhotosStep', async () => {
  const React = await import('react');
  return {
    PhotosStep: ({ onUploadedCountChange }: { onUploadedCountChange?: (n: number) => void }) =>
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'stub-add-photo', onClick: () => onUploadedCountChange?.(1) },
        'stub photos step'
      ),
  };
});

// Stage 6.4: IdentifyStep is replaced by a stub that reports confirmed answers
// through onDraftPatch, to test canProceed(1) in isolation. Its real behaviour
// is covered in IdentifyStep.test.tsx.
vi.mock('../steps/IdentifyStep', async () => {
  const React = await import('react');
  return {
    IdentifyStep: ({ onDraftPatch }: { onDraftPatch: (patch: Record<string, unknown>) => void }) =>
      React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'stub-answer-four',
            onClick: () =>
              onDraftPatch({ item_type: 'Stool', material: 'Teak Wood', category: 'Woodwork', complexity: 'simple' }),
          },
          'four answers'
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-testid': 'stub-answer-shape', onClick: () => onDraftPatch({ shape_profile: 'box' }) },
          'shape'
        )
      ),
  };
});

// Stage 6.5: DescribeStep is replaced by a stub that reports confirmed
// answers through onDraftPatch, to test canProceed(2) in isolation. Its real
// behaviour is covered in DescribeStep.test.tsx.
vi.mock('../steps/DescribeStep', async () => {
  const React = await import('react');
  return {
    DescribeStep: ({ onDraftPatch }: { onDraftPatch: (patch: Record<string, unknown>) => void }) =>
      React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'stub-answer-describe-partial',
            onClick: () =>
              onDraftPatch({
                dimensions: { shape: 'box', values: { length: 10, width: 10, height: 10 }, unit: 'cm', approximate: false },
                technique: 'hand-carved',
                labor_days: 3,
              }),
          },
          'partial'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'stub-answer-describe-complete',
            onClick: () => onDraftPatch({ availability: 'ready', quantity_available: 2 }),
          },
          'complete'
        )
      ),
  };
});

const addStubPhoto = async (container: HTMLElement) => {
  const stub = container.querySelector('[data-testid="stub-add-photo"]') as HTMLButtonElement;
  expect(stub).not.toBeNull();
  await act(async () => {
    stub.click();
  });
};

describe('AddItemWizard Component (Stage 6.1 Skeleton)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  const sampleDraft: ProductRecord = {
    id: 'draft-abc-123',
    artisan_id: 'artisan-owner-1',
    listing_status: 'draft',
    wizard_step: 0,
    created_at: '2026-09-23T00:00:00Z',
  };

  it('shows language picker when speaking_language is null and saves selection to profile', async () => {
    vi.mocked(draftService.getOrCreateDraft).mockResolvedValue(sampleDraft);
    const onLanguageSelected = vi.fn();
    const onExit = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard
          artisanId="artisan-owner-1"
          speakingLanguage={null}
          onExit={onExit}
          onLanguageSelected={onLanguageSelected}
        />
      );
    });

    // Should display language selection screen
    expect(container.textContent).toContain('Choose Your Language');
    expect(container.textContent).toContain('हिंदी');
    expect(container.textContent).toContain('मराठी');
    expect(container.textContent).toContain('English');

    // Click Hindi card
    const hindiCard = Array.from(container.querySelectorAll('h3')).find(
      (el) => el.textContent?.includes('हिंदी')
    )?.closest('div[class*="cursor-pointer"]');

    expect(hindiCard).toBeTruthy();

    await act(async () => {
      (hindiCard as HTMLElement).click();
    });

    // Should have persisted to profile and triggered callback
    expect(storageService.updateArtisanProfile).toHaveBeenCalledWith('artisan-owner-1', {
      speaking_language: 'hi',
    });
    expect(onLanguageSelected).toHaveBeenCalledWith('hi');

    // Should transition to Step 0 (Photos)
    expect(container.textContent).toContain('Photos');
    expect(container.textContent).toContain('फोटो');
  });

  it('shows language picker and when Marathi is clicked, renders wizard with Marathi labels and texts', async () => {
    vi.mocked(draftService.getOrCreateDraft).mockResolvedValue(sampleDraft);
    const onLanguageSelected = vi.fn();
    const onExit = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard
          artisanId="artisan-owner-1"
          speakingLanguage={null}
          onExit={onExit}
          onLanguageSelected={onLanguageSelected}
        />
      );
    });

    // Click Marathi card
    const marathiCard = Array.from(container.querySelectorAll('h3')).find(
      (el) => el.textContent?.includes('मराठी')
    )?.closest('div[class*="cursor-pointer"]');

    expect(marathiCard).toBeTruthy();

    await act(async () => {
      (marathiCard as HTMLElement).click();
    });

    // Should have persisted to profile and triggered callback
    expect(storageService.updateArtisanProfile).toHaveBeenCalledWith('artisan-owner-1', {
      speaking_language: 'mr',
    });
    expect(onLanguageSelected).toHaveBeenCalledWith('mr');

    // Header and steps should all be in Marathi
    expect(container.textContent).toContain('नवीन वस्तू जोडा');
    expect(container.textContent).toContain('टप्पा 1 / 6');
    expect(container.textContent).toContain('बाहेर पडा');
    expect(container.textContent).toContain('ओळख');
    expect(container.textContent).toContain('वर्णन');
    expect(container.textContent).toContain('किंमत');
    expect(container.textContent).toContain('प्रकाशित करा');
  });

  it('skips language picker and directly creates/loads draft when speaking_language is already set', async () => {
    vi.mocked(draftService.getOrCreateDraft).mockResolvedValue(sampleDraft);
    const onExit = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard
          artisanId="artisan-owner-1"
          speakingLanguage="hi"
          onExit={onExit}
        />
      );
    });

    // Language picker should be skipped
    expect(container.textContent).not.toContain('Choose Your Language');

    // Step 0 should be rendered with 6 steps in progress bar
    expect(container.textContent).toContain('Step 1 of 6');
    expect(container.textContent).toContain('Photos');
    expect(container.textContent).toContain('फोटो');
    expect(container.textContent).toContain('Identify');
    expect(container.textContent).toContain('पहचान');
    expect(container.textContent).toContain('Describe');
    expect(container.textContent).toContain('विवरण');
    expect(container.textContent).toContain('Preview');
    expect(container.textContent).toContain('पूर्वावलोकन');
    expect(container.textContent).toContain('Price');
    expect(container.textContent).toContain('कीमत');
    expect(container.textContent).toContain('Publish');
    expect(container.textContent).toContain('प्रकाशित');

    expect(draftService.getOrCreateDraft).toHaveBeenCalledWith('artisan-owner-1');
  });

  it('navigates through steps with Next and Back, updating wizard_step', async () => {
    vi.mocked(draftService.getOrCreateDraft).mockResolvedValue(sampleDraft);
    const onExit = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard
          artisanId="artisan-owner-1"
          speakingLanguage="hi"
          initialDraft={sampleDraft}
          onExit={onExit}
        />
      );
    });

    expect(container.textContent).toContain('Step 1 of 6');

    // Step 0 requires at least one uploaded photo before Next is allowed
    await addStubPhoto(container);

    // Find and click Next button
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Next')
    );
    expect(nextBtn).toBeTruthy();

    await act(async () => {
      nextBtn?.click();
    });

    // Should flush debounced saves and save wizard_step = 1 immediately
    expect(draftService.debouncedSaveDraft.flush).toHaveBeenCalledWith('draft-abc-123');
    expect(draftService.saveDraft).toHaveBeenCalledWith('draft-abc-123', { wizard_step: 1 });

    // Should now be on Step 2 (Identify / पहचान)
    expect(container.textContent).toContain('Step 2 of 6');
    expect(container.textContent).toContain('Identify');

    // Click Back button
    const backBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Back')
    );
    expect(backBtn).toBeTruthy();

    await act(async () => {
      backBtn?.click();
    });

    expect(draftService.saveDraft).toHaveBeenCalledWith('draft-abc-123', { wizard_step: 0 });
    expect(container.textContent).toContain('Step 1 of 6');
  });

  it('canProceed(0): Next is blocked until at least one photo has uploaded', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard artisanId="artisan-owner-1" speakingLanguage="hi" initialDraft={sampleDraft} onExit={vi.fn()} />
      );
    });

    const nextBtn = container.querySelector('[data-testid="wizard-next-button"]') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
    expect(container.querySelector('[data-testid="photos-required-hint"]')?.textContent).toContain(
      'कम से कम 1 फोटो जोड़ें'
    );

    // A click on the disabled button must not advance or persist anything
    await act(async () => {
      nextBtn.click();
    });
    expect(draftService.saveDraft).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Step 1 of 6');

    await addStubPhoto(container);
    expect(nextBtn.disabled).toBe(false);
    expect(container.querySelector('[data-testid="photos-required-hint"]')).toBeNull();

    await act(async () => {
      nextBtn.click();
    });
    expect(draftService.saveDraft).toHaveBeenCalledWith('draft-abc-123', { wizard_step: 1 });
    expect(container.textContent).toContain('Step 2 of 6');
  });

  it('canProceed(1): Next is blocked until item_type, material, category, complexity and shape_profile are confirmed', async () => {
    const step1Draft: ProductRecord = { ...sampleDraft, wizard_step: 1 };
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard artisanId="artisan-owner-1" speakingLanguage="hi" initialDraft={step1Draft} onExit={vi.fn()} />
      );
    });

    const nextBtn = container.querySelector('[data-testid="wizard-next-button"]') as HTMLButtonElement;
    expect(container.textContent).toContain('Step 2 of 6');
    expect(nextBtn.disabled).toBe(true);
    expect(container.querySelector('[data-testid="identify-required-hint"]')?.textContent).toContain(
      'सभी 5 सवालों के जवाब दें'
    );

    // Four of five is still not enough
    await act(async () => {
      (container.querySelector('[data-testid="stub-answer-four"]') as HTMLButtonElement).click();
    });
    expect(nextBtn.disabled).toBe(true);

    await act(async () => {
      (container.querySelector('[data-testid="stub-answer-shape"]') as HTMLButtonElement).click();
    });
    expect(nextBtn.disabled).toBe(false);
    expect(container.querySelector('[data-testid="identify-required-hint"]')).toBeNull();

    await act(async () => {
      nextBtn.click();
    });
    expect(draftService.saveDraft).toHaveBeenCalledWith('draft-abc-123', { wizard_step: 2 });
    expect(container.textContent).toContain('Step 3 of 6');
  });

  it('canProceed(2): Next is blocked until dimensions, technique, labor_days, availability and quantity are all confirmed', async () => {
    const step2Draft: ProductRecord = { ...sampleDraft, wizard_step: 2, shape_profile: 'box' };
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard artisanId="artisan-owner-1" speakingLanguage="hi" initialDraft={step2Draft} onExit={vi.fn()} />
      );
    });

    const nextBtn = container.querySelector('[data-testid="wizard-next-button"]') as HTMLButtonElement;
    expect(container.textContent).toContain('Step 3 of 6');
    expect(nextBtn.disabled).toBe(true);
    expect(container.querySelector('[data-testid="describe-required-hint"]')).not.toBeNull();

    // dimensions + technique + labor_days alone is still not enough (no availability/quantity)
    await act(async () => {
      (container.querySelector('[data-testid="stub-answer-describe-partial"]') as HTMLButtonElement).click();
    });
    expect(nextBtn.disabled).toBe(true);

    await act(async () => {
      (container.querySelector('[data-testid="stub-answer-describe-complete"]') as HTMLButtonElement).click();
    });
    expect(nextBtn.disabled).toBe(false);
    expect(container.querySelector('[data-testid="describe-required-hint"]')).toBeNull();

    await act(async () => {
      nextBtn.click();
    });
    expect(draftService.saveDraft).toHaveBeenCalledWith('draft-abc-123', { wizard_step: 3 });
    expect(container.textContent).toContain('Step 4 of 6');
  });

  it('does not delete a draft on exit when photos were uploaded, even before the local draft refreshes', async () => {
    vi.useFakeTimers();
    vi.mocked(draftService.hasDraftContent).mockReturnValue(false);
    const onExit = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard artisanId="artisan-owner-1" speakingLanguage="hi" initialDraft={sampleDraft} onExit={onExit} />
      );
    });
    await addStubPhoto(container);

    const exitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Exit wizard'
    );
    await act(async () => {
      exitBtn!.click();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(draftService.deleteDraft).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledWith('Saved. You can continue later / सहेजा गया। बाद में जारी रखें');
    vi.useRealTimers();
  });

  it('disables the Publish button on Step 5 (Stage 6.9 requirement)', async () => {
    const step5Draft: ProductRecord = {
      ...sampleDraft,
      wizard_step: 5,
    };
    vi.mocked(draftService.getOrCreateDraft).mockResolvedValue(step5Draft);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard
          artisanId="artisan-owner-1"
          speakingLanguage="hi"
          initialDraft={step5Draft}
          onExit={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Step 6 of 6');

    const publishBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Publish')
    );
    expect(publishBtn).toBeTruthy();
    expect(publishBtn?.getAttribute('disabled')).toBeDefined();
    expect(publishBtn?.disabled).toBe(true);
  });

  it('silently deletes empty draft on exit without showing saved message', async () => {
    vi.mocked(draftService.hasDraftContent).mockReturnValue(false);
    const onExit = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard
          artisanId="artisan-owner-1"
          speakingLanguage="hi"
          initialDraft={sampleDraft}
          onExit={onExit}
        />
      );
    });

    // Click Exit button
    const exitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label') === 'Exit wizard' || b.textContent?.includes('Exit')
    );
    expect(exitBtn).toBeTruthy();

    await act(async () => {
      exitBtn?.click();
    });

    // Should delete draft silently
    expect(draftService.deleteDraft).toHaveBeenCalledWith('draft-abc-123');
    expect(onExit).toHaveBeenCalledWith(null);
  });

  it('shows saved message and flushes saves on exit when draft has content', async () => {
    vi.useFakeTimers();
    vi.mocked(draftService.hasDraftContent).mockReturnValue(true);
    const onExit = vi.fn();

    const activeDraft: ProductRecord = {
      ...sampleDraft,
      item_type: 'Hand Carved Table',
      wizard_step: 1,
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AddItemWizard
          artisanId="artisan-owner-1"
          speakingLanguage="hi"
          initialDraft={activeDraft}
          onExit={onExit}
        />
      );
    });

    const exitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label') === 'Exit wizard'
    );
    expect(exitBtn).toBeTruthy();

    await act(async () => {
      exitBtn?.click();
    });

    expect(draftService.debouncedSaveDraft.flush).toHaveBeenCalledWith('draft-abc-123');
    expect(container.textContent).toContain('सहेजा गया। बाद में जारी रखें');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onExit).toHaveBeenCalledWith('Saved. You can continue later / सहेजा गया। बाद में जारी रखें');
    vi.useRealTimers();
  });
});
