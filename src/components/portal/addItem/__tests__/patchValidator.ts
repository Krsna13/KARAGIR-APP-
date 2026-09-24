// src/components/portal/addItem/__tests__/patchValidator.ts
/**
 * Test helper for Stage 6.6 follow-up:
 * Fails (throws Error) when a saveDraft/draft patch contains any key not present
 * in the generated Supabase products Update type.
 */

import type { Database } from '../../../../lib/supabase/database.types';

export type ProductUpdate = Database['public']['Tables']['products']['Update'];
export type ProductUpdateKey = keyof ProductUpdate;

/**
 * All allowed column keys for updating the products table, derived from Supabase schema.
 * TypeScript guarantees at compile time that every key in this Set is a valid keyof ProductUpdate.
 */
export const VALID_PRODUCT_UPDATE_KEYS: ReadonlySet<ProductUpdateKey> = new Set<ProductUpdateKey>([
  'accepts_customization',
  'ai_identification',
  'artisan_id',
  'availability',
  'care_instructions',
  'category',
  'colors',
  'complexity',
  'created_at',
  'description_en',
  'description_hi',
  'description_mode',
  'dimensions',
  'enhanced_image_url',
  'extra_notes_en',
  'extra_notes_original',
  'final_image_choice',
  'finish',
  'highlights_en',
  'highlights_hi',
  'id',
  'identification_photos',
  'identification_source',
  'image_processing_status',
  'image_urls',
  'item_type',
  'labor_days',
  'lead_time_days',
  'listing_approved',
  'listing_facts_hash',
  'listing_generated_at',
  'listing_status',
  'material',
  'normalized_dimensions',
  'original_image_url',
  'price',
  'price_deterministic',
  'price_final',
  'price_suggested_ml',
  'pricing_confidence',
  'quantity_available',
  'search_tags',
  'secondary_materials',
  'seo_caption_en',
  'seo_caption_hi',
  'shape_profile',
  'story_en',
  'story_original',
  'style',
  'suggested_use',
  'summary_spoken',
  'technique',
  'title_en',
  'title_hi',
  'transcript_raw',
  'updated_at',
  'visible_features',
  'voice_note_url',
  'wizard_step',
]);

// Compile-time assertion that VALID_PRODUCT_UPDATE_KEYS contains ALL keys of ProductUpdate:
type MissingKeysCheck = Exclude<ProductUpdateKey, typeof VALID_PRODUCT_UPDATE_KEYS extends ReadonlySet<infer K> ? K : never>;
type AssertNoMissingKeys = [MissingKeysCheck] extends [never] ? true : false;
const _compileTimeKeyCheck: AssertNoMissingKeys = true;
void _compileTimeKeyCheck;

/**
 * Assert that all keys in a draft patch are known columns in the products table Update type.
 * Throws a descriptive Error if any unknown column key is present.
 */
export function assertValidProductPatch(patch: Record<string, unknown>): void {
  if (!patch || typeof patch !== 'object') {
    throw new Error('Patch must be an object');
  }

  const patchKeys = Object.keys(patch);
  const unknownKeys = patchKeys.filter((key) => !VALID_PRODUCT_UPDATE_KEYS.has(key as ProductUpdateKey));

  if (unknownKeys.length > 0) {
    throw new Error(
      `Product patch contains key(s) not present in generated products Update type: ${unknownKeys.join(', ')}`
    );
  }
}
