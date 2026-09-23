import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  debouncedSaveDraft, 
  saveDraft, 
  hasDraftContent, 
  getOrCreateDraft, 
  deleteDraft 
} from '../draftService';
import * as productLib from '../../lib/supabase/products';
import * as productImageService from '../productImageService';

// MOCKED AT THE BOUNDARY: product-photo storage helpers (their real logic is
// covered in productImageService.test.ts). The ordering in deleteDraft is real.
vi.mock('../productImageService', () => ({
  collectProductImageStoragePaths: vi.fn().mockResolvedValue([]),
  removeStorageFiles: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../lib/supabase/products', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getDraftProductsByArtisan: vi.fn(),
  getProductsByArtisan: vi.fn(),
  getPublishedProducts: vi.fn(),
  getPublishedProductsByArtisan: vi.fn(),
}));

describe('draftService & saveDraft Debounce with Real Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debouncedSaveDraft.cancel();
    vi.useFakeTimers();
  });

  afterEach(() => {
    debouncedSaveDraft.cancel();
    vi.useRealTimers();
  });

  it('debounces rapid calls into a single Supabase update call after 800ms', async () => {
    const mockUpdate = vi.mocked(productLib.updateProduct).mockResolvedValue({
      id: 'prod-123',
      artisan_id: 'artisan-456',
      listing_status: 'draft',
      wizard_step: 2,
      created_at: '2026-09-23T00:00:00Z',
    });

    // Make 3 rapid debounced calls within 300ms
    debouncedSaveDraft('prod-123', { wizard_step: 1 });
    vi.advanceTimersByTime(100);
    debouncedSaveDraft('prod-123', { item_type: 'Handmade Pot' });
    vi.advanceTimersByTime(100);
    debouncedSaveDraft('prod-123', { wizard_step: 2, material: 'Clay' });

    // Should NOT have called updateProduct yet
    expect(mockUpdate).not.toHaveBeenCalled();

    // Advance to 800ms threshold from the last call
    vi.advanceTimersByTime(800);

    // Exactly one call should have been made with merged updates
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('prod-123', {
      wizard_step: 2,
      item_type: 'Handmade Pot',
      material: 'Clay',
    });
  });

  it('flushes pending saves immediately before the 800ms timer elapses', async () => {
    const mockUpdate = vi.mocked(productLib.updateProduct).mockResolvedValue({
      id: 'prod-789',
      artisan_id: 'artisan-456',
      listing_status: 'draft',
      wizard_step: 3,
      created_at: '2026-09-23T00:00:00Z',
    });

    debouncedSaveDraft('prod-789', { wizard_step: 3 });
    vi.advanceTimersByTime(200); // only 200ms elapsed (less than 800ms)

    expect(mockUpdate).not.toHaveBeenCalled();

    // User navigates or exits wizard -> triggers flush
    await debouncedSaveDraft.flush('prod-789');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('prod-789', { wizard_step: 3 });

    // Advancing timers further should NOT trigger a second call
    vi.advanceTimersByTime(1000);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('saveDraft directly executes updateProduct without timer delay', async () => {
    const mockUpdate = vi.mocked(productLib.updateProduct).mockResolvedValue({
      id: 'prod-imm',
      artisan_id: 'artisan-456',
      listing_status: 'draft',
      wizard_step: 1,
      created_at: '2026-09-23T00:00:00Z',
    });

    await saveDraft('prod-imm', { wizard_step: 1 });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('prod-imm', { wizard_step: 1 });
  });

  it('hasDraftContent correctly detects empty vs content drafts', () => {
    // Empty draft
    expect(hasDraftContent({ wizard_step: 0 })).toBe(false);
    expect(hasDraftContent({ wizard_step: 0, item_type: '' })).toBe(false);

    // Drafts with content
    expect(hasDraftContent({ wizard_step: 1 })).toBe(true);
    expect(hasDraftContent({ wizard_step: 0, original_image_url: 'https://img.com/1.jpg' })).toBe(true);
    expect(hasDraftContent({ wizard_step: 0, item_type: 'Teak Chair' })).toBe(true);
    expect(hasDraftContent({ wizard_step: 0, material: 'Teak' })).toBe(true);
    expect(hasDraftContent({ wizard_step: 0, price: 1500 })).toBe(true);
    expect(hasDraftContent({ wizard_step: 0, description_hi: 'सुंदर कुर्सी' })).toBe(true);
    expect(hasDraftContent({ wizard_step: 0, voice_note_url: 'https://audio.com/voice.m4a' })).toBe(true);
  });

  it('getOrCreateDraft reuses an existing empty draft instead of creating a duplicate', async () => {
    const emptyDraft = {
      id: 'existing-empty-draft',
      artisan_id: 'artisan-1',
      listing_status: 'draft' as const,
      wizard_step: 0,
      created_at: '2026-09-23T00:00:00Z',
    };

    const draftWithContent = {
      id: 'active-draft-with-photo',
      artisan_id: 'artisan-1',
      listing_status: 'draft' as const,
      wizard_step: 1,
      original_image_url: 'https://test.com/photo.jpg',
      created_at: '2026-09-23T00:00:00Z',
    };

    vi.mocked(productLib.getDraftProductsByArtisan).mockResolvedValue([
      draftWithContent,
      emptyDraft,
    ]);

    const result = await getOrCreateDraft('artisan-1');

    expect(result?.id).toBe('existing-empty-draft');
    expect(productLib.createProduct).not.toHaveBeenCalled();
  });

  it('getOrCreateDraft creates a new draft if no empty draft is available', async () => {
    vi.mocked(productLib.getDraftProductsByArtisan).mockResolvedValue([
      {
        id: 'draft-1',
        artisan_id: 'artisan-1',
        listing_status: 'draft' as const,
        wizard_step: 2,
        item_type: 'Brass Urli',
        created_at: '2026-09-23T00:00:00Z',
      },
    ]);

    vi.mocked(productLib.createProduct).mockResolvedValue({
      id: 'new-draft-1',
      artisan_id: 'artisan-1',
      listing_status: 'draft' as const,
      wizard_step: 0,
      created_at: '2026-09-23T00:00:00Z',
    });

    const result = await getOrCreateDraft('artisan-1');

    expect(productLib.createProduct).toHaveBeenCalledWith({
      artisan_id: 'artisan-1',
      listing_status: 'draft',
      wizard_step: 0,
      image_processing_status: 'pending',
    });
    expect(result?.id).toBe('new-draft-1');
  });

  it('deleteDraft cancels pending debounced saves and calls deleteProduct', async () => {
    const mockDelete = vi.mocked(productLib.deleteProduct).mockResolvedValue(true);

    debouncedSaveDraft('prod-del', { wizard_step: 1 });
    await deleteDraft('prod-del');

    expect(mockDelete).toHaveBeenCalledWith('prod-del');

    // Make sure timer doesn't fire an update for deleted product
    vi.advanceTimersByTime(1000);
    expect(productLib.updateProduct).not.toHaveBeenCalled();
  });

  it('deleteDraft (Stage 6.2): reads photo paths, deletes the product (rows cascade), then removes the files', async () => {
    const order: string[] = [];
    const paths = ['a/prod-del/img-1/raw.jpg', 'a/prod-del/img-1/enhanced.png'];
    vi.mocked(productImageService.collectProductImageStoragePaths).mockImplementation(async () => {
      order.push('collect');
      return paths;
    });
    vi.mocked(productLib.deleteProduct).mockImplementation(async () => {
      order.push('deleteProduct');
      return true;
    });
    vi.mocked(productImageService.removeStorageFiles).mockImplementation(async () => {
      order.push('removeFiles');
      return {};
    });

    await expect(deleteDraft('prod-del')).resolves.toBe(true);
    expect(order).toEqual(['collect', 'deleteProduct', 'removeFiles']);
    expect(productImageService.removeStorageFiles).toHaveBeenCalledWith(paths);
  });

  it('deleteDraft keeps the files when the product delete fails', async () => {
    vi.mocked(productImageService.collectProductImageStoragePaths).mockResolvedValue(['a/p/i/raw.jpg']);
    vi.mocked(productLib.deleteProduct).mockResolvedValue(false);

    await expect(deleteDraft('prod-del')).resolves.toBe(false);
    expect(productImageService.removeStorageFiles).not.toHaveBeenCalled();
  });

  it('deleteDraft does not delete the draft if its photo paths cannot be read (would orphan files)', async () => {
    vi.mocked(productImageService.collectProductImageStoragePaths).mockRejectedValue(new Error('offline'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(deleteDraft('prod-del')).resolves.toBe(false);
    expect(productLib.deleteProduct).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
