// src/services/listingService.ts
/**
 * Stage 6.6: Client service for AI product listing generation and revision.
 * Connects to the Supabase Edge Function 'generate-listing' and handles draft persistence.
 */

import { supabase } from '../lib/supabase/client';
import { saveDraft } from './draftService';
import type { ListingResult, ListingSection, ProductRecord } from '../types/product';
import type { ArtisanListingProfile, ProductFactsInput } from '../../supabase/functions/generate-listing/validation';
import { computeFactsHash } from '../components/portal/addItem/steps/listingLogic';

export interface GenerateListingOptions {
  facts: ProductFactsInput;
  artisanProfile?: ArtisanListingProfile | null;
  speakingLanguage?: string | null;
  mode?: 'generate' | 'revise';
  revise?: {
    current_listing: ListingResult;
    instruction: string;
    section?: ListingSection;
  };
}

export interface ListingServiceResult {
  success: boolean;
  listing?: ListingResult;
  error?: string;
  failedRule?: string;
}

/**
 * Invokes the 'generate-listing' Supabase Edge Function.
 */
export async function invokeGenerateListing(
  options: GenerateListingOptions
): Promise<ListingServiceResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-listing', {
      body: {
        facts: options.facts,
        artisanProfile: options.artisanProfile,
        speakingLanguage: options.speakingLanguage || 'hi',
        mode: options.mode || 'generate',
        revise: options.revise,
      },
    });

    if (error) {
      let detail = error.message;
      let failedRule: string | undefined;

      // Handle FunctionsHttpError response context if present
      if ('context' in error && typeof (error as any).context?.json === 'function') {
        try {
          const json = await (error as any).context.json();
          if (json?.error) detail = json.error;
          if (json?.failedRule) failedRule = json.failedRule;
        } catch {
          // ignore json parse error
        }
      }

      return {
        success: false,
        error: detail || 'Failed to generate listing.',
        failedRule,
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'No listing data returned by service.',
      };
    }

    return {
      success: true,
      listing: data as ListingResult,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Network error connecting to listing service: ${msg}`,
    };
  }
}

/**
 * Persists a generated listing onto the product draft in Supabase.
 */
export async function saveListingToDraft(
  productId: string,
  listing: ListingResult,
  draft: ProductRecord
): Promise<ProductRecord | null> {
  const hash = computeFactsHash(draft);

  return await saveDraft(productId, {
    title_en: listing.title_en,
    title_hi: listing.title_hi,
    seo_caption_en: listing.seo_caption_en,
    seo_caption_hi: listing.seo_caption_hi,
    highlights_en: listing.highlights_en,
    highlights_hi: listing.highlights_hi,
    description_en: listing.description_en,
    description_hi: listing.description_hi,
    search_tags: listing.search_tags,
    summary_spoken: listing.summary_spoken,
    listing_generated_at: new Date().toISOString(),
    listing_facts_hash: hash,
    listing_approved: false,
  });
}

/**
 * Marks the listing as approved by the artisan.
 */
export async function approveDraftListing(productId: string): Promise<ProductRecord | null> {
  return await saveDraft(productId, {
    listing_approved: true,
  });
}
