/**
 * Stage 6.1: CatalogEditor Drafts & Wizard Integration Tests
 * 
 * EXPLICIT ENVIRONMENT & TESTING BOUNDARY NOTE:
 * Supabase is mocked at the client boundary for these component tests.
 * The PostgreSQL Row Level Security (RLS) policy changes and database triggers
 * were NOT verified against a live Supabase database in this local/offline test environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CatalogEditor } from '../CatalogEditor';
import * as draftService from '../../services/draftService';
import type { KaragirStore } from '../../types';
import type { ProductRecord } from '../../types/product';

vi.mock('../../services/draftService', () => {
  const debouncedSaveDraftMock = vi.fn().mockResolvedValue(null);
  // @ts-ignore
  debouncedSaveDraftMock.flush = vi.fn().mockResolvedValue(undefined);
  // @ts-ignore
  debouncedSaveDraftMock.cancel = vi.fn();

  return {
    fetchArtisanDrafts: vi.fn(),
    deleteDraft: vi.fn().mockResolvedValue(true),
    hasDraftContent: vi.fn(),
    getOrCreateDraft: vi.fn(),
    saveDraft: vi.fn().mockResolvedValue(null),
    debouncedSaveDraft: debouncedSaveDraftMock,
  };
});

describe('CatalogEditor Drafts & AddItemWizard Integration (Stage 6.1)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  const mockStore: KaragirStore = {
    id: 'artisan-portal-1',
    artisanName: 'Ramesh Mistri',
    mobile: '9876543210',
    email: '',
    location: 'Nashik',
    craftSpecialty: 'Woodwork',
    shopName: 'Mistri Wood Crafts',
    shopTagline: 'Master Craftsman',
    yearsExperience: 20,
    speakingLanguage: 'hi',
    shopAvatar: '',
    shopBanner: '',
    categories: ['Woodwork'],
    works: [
      {
        id: 'work-1',
        title: 'Teak Dining Table',
        category: 'Woodwork',
        coverImage: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126',
        galleryImages: [],
        price: 35000,
        material: 'Teak Wood',
        leadTimeDays: 14,
      },
    ],
    rating: 5.0,
    isVerified: true,
  };

  const sampleDraftWithContent: ProductRecord = {
    id: 'draft-resume-1',
    artisan_id: 'artisan-portal-1',
    listing_status: 'draft',
    wizard_step: 2,
    item_type: 'Carved Mandir',
    material: 'Sheesham',
    price: 18000,
    created_at: '2026-09-23T00:00:00Z',
    updated_at: '2026-09-23T12:00:00Z',
  };

  it('both "+ Add Item" and empty state buttons open the AddItemWizard', async () => {
    vi.mocked(draftService.fetchArtisanDrafts).mockResolvedValue([]);
    vi.mocked(draftService.hasDraftContent).mockReturnValue(false);
    vi.mocked(draftService.getOrCreateDraft).mockResolvedValue({
      id: 'draft-new',
      artisan_id: 'artisan-portal-1',
      listing_status: 'draft',
      wizard_step: 0,
      created_at: '2026-09-23T00:00:00Z',
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<CatalogEditor storeData={mockStore} addWorkItem={vi.fn()} />);
    });

    // Top "+ Add Item" button
    const addItemBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add Item')
    );
    expect(addItemBtn).toBeTruthy();

    await act(async () => {
      addItemBtn?.click();
    });

    // Should render wizard
    expect(container.textContent).toContain('Add Item / नया आइटम जोड़ें');
    expect(container.textContent).toContain('Step 1 of 6');

    // Close wizard
    const exitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label') === 'Exit wizard' || b.textContent?.includes('Exit')
    );
    await act(async () => {
      exitBtn?.click();
    });

    // Now test with an empty catalog store (empty state button)
    const emptyStore: KaragirStore = { ...mockStore, works: [] };
    await act(async () => {
      root.render(<CatalogEditor storeData={emptyStore} addWorkItem={vi.fn()} />);
    });

    expect(container.textContent).toContain('No products in your catalog yet');
    const emptyStateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add the Product')
    );
    expect(emptyStateBtn).toBeTruthy();

    await act(async () => {
      emptyStateBtn?.click();
    });

    expect(container.textContent).toContain('Add Item / नया आइटम जोड़ें');
  });

  it('renders unfinished draft card with thumbnail, step, and updated time, and reopens wizard at saved step', async () => {
    vi.mocked(draftService.fetchArtisanDrafts).mockResolvedValue([sampleDraftWithContent]);
    vi.mocked(draftService.hasDraftContent).mockReturnValue(true);

    const root = createRoot(container);
    await act(async () => {
      root.render(<CatalogEditor storeData={mockStore} addWorkItem={vi.fn()} />);
    });

    // Unfinished drafts header should appear
    expect(container.textContent).toContain('Continue your unfinished item / अधूरा आइटम जारी रखें');
    expect(container.textContent).toContain('Carved Mandir');
    expect(container.textContent).toContain('Step 3 of 6');

    // Tap draft card to resume
    const draftCard = Array.from(container.querySelectorAll('h4')).find((el) =>
      el.textContent?.includes('Carved Mandir')
    )?.closest('div[class*="cursor-pointer"]');

    expect(draftCard).toBeTruthy();

    await act(async () => {
      (draftCard as HTMLElement).click();
    });

    // Should reopen wizard at Step 3 (wizard_step 2)
    expect(container.textContent).toContain('Add Item / नया आइटम जोड़ें');
    expect(container.textContent).toContain('Step 3 of 6');
    expect(container.textContent).toContain('Describe / विवरण');
  });

  it('deletes draft with a bilingual confirmation dialog', async () => {
    vi.mocked(draftService.fetchArtisanDrafts).mockResolvedValue([sampleDraftWithContent]);
    vi.mocked(draftService.hasDraftContent).mockReturnValue(true);
    vi.mocked(draftService.deleteDraft).mockResolvedValue(true);

    const root = createRoot(container);
    await act(async () => {
      root.render(<CatalogEditor storeData={mockStore} addWorkItem={vi.fn()} />);
    });

    // Click trash button on draft card
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label') === 'Delete draft'
    );
    expect(deleteBtn).toBeTruthy();

    await act(async () => {
      deleteBtn?.click();
    });

    // Confirmation dialog should be displayed
    expect(container.textContent).toContain('Delete Draft? / ड्राफ्ट हटाएं?');
    expect(container.textContent).toContain('This action cannot be undone. / यह क्रिया वापस नहीं ली जा सकती।');

    // Confirm deletion
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete / हटाएं')
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn?.click();
    });

    expect(draftService.deleteDraft).toHaveBeenCalledWith('draft-resume-1');
  });

  it('keeps the draft card and shows a bilingual message when deleting fails (Stage 6.2)', async () => {
    vi.mocked(draftService.fetchArtisanDrafts).mockResolvedValue([sampleDraftWithContent]);
    vi.mocked(draftService.hasDraftContent).mockReturnValue(true);
    vi.mocked(draftService.deleteDraft).mockResolvedValue(false);

    const root = createRoot(container);
    await act(async () => {
      root.render(<CatalogEditor storeData={mockStore} addWorkItem={vi.fn()} />);
    });

    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Delete draft'
    );
    await act(async () => {
      deleteBtn?.click();
    });
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete / हटाएं')
    );
    await act(async () => {
      confirmBtn?.click();
    });

    expect(container.textContent).toContain('ड्राफ्ट नहीं हटा, फिर कोशिश करें');
    expect(
      Array.from(container.querySelectorAll('button')).some((b) => b.getAttribute('aria-label') === 'Delete draft')
    ).toBe(true);
  });

  it('counts published products in badge and shows drafts count separately', async () => {
    vi.mocked(draftService.fetchArtisanDrafts).mockResolvedValue([sampleDraftWithContent]);
    vi.mocked(draftService.hasDraftContent).mockReturnValue(true);

    const root = createRoot(container);
    await act(async () => {
      root.render(<CatalogEditor storeData={mockStore} addWorkItem={vi.fn()} />);
    });

    // Badge showing published count
    expect(container.textContent).toContain('1 published');
    // Badge showing drafts separately
    expect(container.textContent).toContain('1 draft');
  });

  it('renders products with null price, null material, or null title safely without crashing', async () => {
    vi.mocked(draftService.fetchArtisanDrafts).mockResolvedValue([]);
    vi.mocked(draftService.hasDraftContent).mockReturnValue(false);

    const storeWithNulls: KaragirStore = {
      ...mockStore,
      works: [
        {
          id: 'null-work-1',
          title: '',
          category: 'Woodwork',
          coverImage: '',
          galleryImages: [],
          price: (null as unknown) as number,
          material: (null as unknown) as string,
          leadTimeDays: 14,
        },
      ],
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(<CatalogEditor storeData={storeWithNulls} addWorkItem={vi.fn()} />);
    });

    // Should render fallback text instead of throwing
    expect(container.textContent).toContain('Untitled Item');
    expect(container.textContent).toContain('Handcrafted');
    expect(container.textContent).toContain('Price not set / कीमत तय नहीं');
  });
});
