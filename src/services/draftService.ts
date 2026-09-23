import { 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  getDraftProductsByArtisan 
} from '../lib/supabase/products';
import { collectProductImageStoragePaths, removeStorageFiles } from './productImageService';
import type { ProductRecord } from '../types/product';
import type { Database } from '../lib/supabase/database.types';

type ProductUpdate = Database['public']['Tables']['products']['Update'];

// Pending debounce map: productId -> pending updates & timer handle
interface PendingDebounce {
  updates: ProductUpdate;
  timer: ReturnType<typeof setTimeout>;
  resolver: (value: ProductRecord | null) => void;
  rejecter: (reason?: any) => void;
}

const pendingDebounceMap = new Map<string, PendingDebounce>();

/**
 * Checks whether a draft product has any content entered by the artisan.
 * An empty draft has wizard_step = 0, no photos, no title, no material, no price, etc.
 */
export const hasDraftContent = (draft: Partial<ProductRecord> | null | undefined): boolean => {
  if (!draft) return false;

  const hasPhotos = Boolean(
    draft.original_image_url || 
    (draft.image_urls && draft.image_urls.length > 0) ||
    draft.enhanced_image_url
  );
  const hasStepAdvanced = Boolean(draft.wizard_step && draft.wizard_step > 0);
  const hasTitle = Boolean(draft.item_type && draft.item_type.trim().length > 0);
  const hasMaterial = Boolean(draft.material && draft.material.trim().length > 0);
  const hasPrice = draft.price !== null && draft.price !== undefined && draft.price > 0;
  const hasDescription = Boolean(
    (draft.description_en && draft.description_en.trim().length > 0) ||
    (draft.description_hi && draft.description_hi.trim().length > 0)
  );
  const hasVoice = Boolean(draft.voice_note_url && draft.voice_note_url.trim().length > 0);

  return hasPhotos || hasStepAdvanced || hasTitle || hasMaterial || hasPrice || hasDescription || hasVoice;
};

/**
 * Immediate save helper that directly writes updates to Supabase without debouncing.
 */
export const saveDraft = async (
  productId: string, 
  partialFields: ProductUpdate
): Promise<ProductRecord | null> => {
  try {
    const remote = await updateProduct(productId, partialFields);
    if (remote) {
      localDraftStore.set(productId, remote);
      return remote;
    }
  } catch (err) {
    console.warn('[draftService] updateProduct error:', err);
  }

  const local = localDraftStore.get(productId);
  if (local) {
    const merged = { ...local, ...partialFields, updated_at: new Date().toISOString() } as ProductRecord;
    localDraftStore.set(productId, merged);
    return merged;
  }
  return null;
};

/**
 * Real debounced save helper (~800ms) with per-product merged patches and cancellation.
 * Exposes .flush() method so pending updates are never lost on step change, exit, or unmount.
 */
type DebouncedSaveDraftFn = {
  (productId: string, partialFields: ProductUpdate): Promise<ProductRecord | null>;
  flush: (productId?: string) => Promise<void>;
  cancel: (productId?: string) => void;
};

export const debouncedSaveDraft: DebouncedSaveDraftFn = Object.assign(
  (productId: string, partialFields: ProductUpdate): Promise<ProductRecord | null> => {
    return new Promise((resolve, reject) => {
      const existing = pendingDebounceMap.get(productId);

      if (existing) {
        clearTimeout(existing.timer);
        // Merge updates
        existing.updates = { ...existing.updates, ...partialFields };
        // Chain resolver
        const prevResolver = existing.resolver;
        existing.resolver = (res) => {
          prevResolver(res);
          resolve(res);
        };
        const prevRejecter = existing.rejecter;
        existing.rejecter = (err) => {
          prevRejecter(err);
          reject(err);
        };

        existing.timer = setTimeout(async () => {
          pendingDebounceMap.delete(productId);
          try {
            const result = await saveDraft(productId, existing.updates);
            existing.resolver(result);
          } catch (err) {
            existing.rejecter(err);
          }
        }, 800);
      } else {
        const entry: PendingDebounce = {
          updates: { ...partialFields },
          resolver: resolve,
          rejecter: reject,
          timer: setTimeout(async () => {
            pendingDebounceMap.delete(productId);
            try {
              const result = await updateProduct(productId, entry.updates);
              entry.resolver(result);
            } catch (err) {
              entry.rejecter(err);
            }
          }, 800),
        };
        pendingDebounceMap.set(productId, entry);
      }
    });
  },
  {
    /**
     * Flushes pending saves immediately without waiting for the 800ms timer.
     * Called on step changes, wizard exit, and unmount.
     */
    flush: async (productId?: string): Promise<void> => {
      if (productId) {
        const existing = pendingDebounceMap.get(productId);
        if (existing) {
          clearTimeout(existing.timer);
          pendingDebounceMap.delete(productId);
          try {
            const result = await updateProduct(productId, existing.updates);
            existing.resolver(result);
          } catch (err) {
            existing.rejecter(err);
          }
        }
      } else {
        const entries = Array.from(pendingDebounceMap.entries());
        pendingDebounceMap.clear();
        await Promise.all(
          entries.map(async ([id, entry]) => {
            clearTimeout(entry.timer);
            try {
              const result = await updateProduct(id, entry.updates);
              entry.resolver(result);
            } catch (err) {
              entry.rejecter(err);
            }
          })
        );
      }
    },

    /**
     * Cancels pending saves if a draft is discarded.
     */
    cancel: (productId?: string): void => {
      if (productId) {
        const existing = pendingDebounceMap.get(productId);
        if (existing) {
          clearTimeout(existing.timer);
          pendingDebounceMap.delete(productId);
        }
      } else {
        pendingDebounceMap.forEach((entry) => clearTimeout(entry.timer));
        pendingDebounceMap.clear();
      }
    },
  }
);

// Local in-memory fallback store for demo mode & offline artisans
const localDraftStore = new Map<string, ProductRecord>();

/**
 * Creates a brand new draft product row in Supabase.
 */
export const createDraftProduct = async (
  artisanId: string
): Promise<ProductRecord | null> => {
  try {
    const remote = await createProduct({
      artisan_id: artisanId,
      listing_status: 'draft',
      wizard_step: 0,
      image_processing_status: 'pending',
    });
    if (remote) return remote;
  } catch (err) {
    console.warn('[draftService] createProduct error:', err);
  }
  return null;
};

/**
 * Fetches all draft products for the given artisan.
 */
export const fetchArtisanDrafts = async (artisanId: string): Promise<ProductRecord[]> => {
  try {
    const remote = await getDraftProductsByArtisan(artisanId);
    if (remote && remote.length > 0) return remote;
  } catch (err) {
    console.warn('[draftService] fetchArtisanDrafts error:', err);
  }

  const local = Array.from(localDraftStore.values()).filter((d) => d.artisan_id === artisanId);
  return local;
};

/**
 * Reuses an existing empty draft (wizard_step 0 and no content) or creates a new one.
 * Prevents pile-up of blank drafts when the wizard is opened repeatedly.
 */
export const getOrCreateDraft = async (artisanId: string): Promise<ProductRecord | null> => {
  try {
    const existingDrafts = await fetchArtisanDrafts(artisanId);
    const emptyDraft = existingDrafts.find((d) => !hasDraftContent(d));

    if (emptyDraft) {
      return emptyDraft;
    }

    const created = await createDraftProduct(artisanId);
    if (created) {
      return created;
    }
  } catch (err) {
    console.warn('[draftService] Could not get or create draft from Supabase:', err);
  }

  // Fallback for demo mode / offline artisans
  const existingLocal = Array.from(localDraftStore.values()).find(
    (d) => d.artisan_id === artisanId && !hasDraftContent(d)
  );
  if (existingLocal) {
    return existingLocal;
  }

  const fallbackId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-000000000001';

  const newLocalDraft: ProductRecord = {
    id: fallbackId,
    artisan_id: artisanId,
    listing_status: 'draft',
    wizard_step: 0,
    created_at: new Date().toISOString(),
    image_processing_status: 'pending',
  };

  localDraftStore.set(newLocalDraft.id, newLocalDraft);
  return newLocalDraft;
};

/**
 * Deletes a draft product from Supabase, including its photos.
 *
 * Order matters: storage paths are derived from the product_images rows, which
 * ON DELETE CASCADE removes together with the product. So the paths are read
 * first, then the product row is deleted (cascading its product_images rows),
 * then the storage files are removed. Files are only removed once the product
 * is really gone, so a failed delete never leaves rows pointing at missing files.
 */
export const deleteDraft = async (productId: string): Promise<boolean> => {
  // Cancel any pending debounced saves before deletion
  debouncedSaveDraft.cancel(productId);
  localDraftStore.delete(productId);

  let storagePaths: string[] = [];
  try {
    storagePaths = await collectProductImageStoragePaths(productId);
  } catch (err) {
    // Without the paths the files would be orphaned forever; keep the draft so
    // the delete can be retried rather than losing track of them.
    console.error('[draftService] Could not list draft photos for cleanup; draft not deleted:', err);
    return false;
  }

  const deleted = await deleteProduct(productId);
  if (!deleted) return false;

  await removeStorageFiles(storagePaths);
  return true;
};
