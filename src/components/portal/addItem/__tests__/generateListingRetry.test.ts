/**
 * Stage 6.6: Edge Function retry-once behaviour tests (Real logic).
 *
 * Simulates the retry loop used by supabase/functions/generate-listing/index.ts:
 * 1. On attempt 1 validation failure, the function retries once with the validation error.
 * 2. If attempt 2 fixes the violation, it succeeds and returns 200.
 * 3. If attempt 2 still fails, it returns 502 with the failure reason.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateListingResult,
  type ListingOutput,
  type ProductFactsInput,
  type ArtisanListingProfile,
} from '../../../../../supabase/functions/generate-listing/validation';

const facts: ProductFactsInput = {
  item_type: 'Vase',
  material: 'Ceramic',
  labor_days: 3,
  dimensions: {
    shape: 'round',
    values: { height: 25, diameter: 12 },
    unit: 'cm',
  },
  normalized_dimensions: { height: 25, diameter: 12 },
};

const artisan: ArtisanListingProfile = {
  shop_name: 'Jaipur Clay Works',
  city: 'Jaipur',
  experience_years: null, // Experience unset
};

const validOutput: ListingOutput = {
  title_en: 'Handcrafted Ceramic Vase',
  title_hi: 'हस्तनिर्मित सेरामिक फूलदान',
  seo_caption_en: 'Authentic 25 cm handcrafted ceramic flower vase.',
  seo_caption_hi: '25 सेमी ऊंचा हस्तनिर्मित सेरामिक फूलदान।',
  highlights_en: [
    'Handmade with quality ceramic',
    'Height 25 cm, diameter 12 cm',
    '3 days of artisan craftsmanship',
    'Ready stock available',
  ],
  highlights_hi: [
    'गुणवत्तापूर्ण सेरामिक से निर्मित',
    'ऊंचाई 25 सेमी, व्यास 12 सेमी',
    '3 दिनों की कुशल कारीगरी',
    'तैयार स्टॉक उपलब्ध',
  ],
  description_en: 'This elegant vase is made from ceramic in Jaipur. Measuring 25 cm in height and 12 cm in diameter, it takes 3 days to craft.',
  description_hi: 'यह सुंदर फूलदान जयपुर में सेरामिक से तैयार किया गया है। इसकी ऊंचाई 25 सेमी और व्यास 12 सेमी है। इसे बनाने में 3 दिन लगे हैं।',
  search_tags: ['ceramic vase', 'flower vase', 'handmade vase', 'home decor', 'jaipur ceramic', 'clay pottery'],
  summary_spoken: 'यह सेरामिक फूलदान 25 सेमी ऊंचा है और 3 दिनों में तैयार किया गया है।',
};

// Simulation of Edge Function execution loop
async function simulateEdgeFunction(
  generateMock: (promptSuffix?: string) => Promise<any>
): Promise<{ status: number; body: any }> {
  // Attempt 1
  const raw1 = await generateMock();
  const val1 = validateListingResult(raw1, facts, artisan);

  if (val1.ok && val1.value) {
    return { status: 200, body: val1.value };
  }

  // Attempt 2 (Retry once with feedback)
  const raw2 = await generateMock(val1.error);
  const val2 = validateListingResult(raw2, facts, artisan);

  if (val2.ok && val2.value) {
    return { status: 200, body: val2.value };
  }

  // Failed second attempt
  return {
    status: 502,
    body: {
      error: `Listing validation failed: ${val2.error}`,
      failedRule: val2.failedRule,
    },
  };
}

describe('Edge Function Retry-Once Behaviour', () => {
  it('succeeds immediately on attempt 1 if output is valid', async () => {
    const geminiMock = vi.fn().mockResolvedValue(validOutput);

    const result = await simulateEdgeFunction(geminiMock);
    expect(result.status).toBe(200);
    expect(geminiMock).toHaveBeenCalledTimes(1);
    expect(result.body.title_en).toBe(validOutput.title_en);
  });

  it('retries once if attempt 1 fails validation, and succeeds when attempt 2 corrects the error', async () => {
    // Attempt 1 produces an unauthorized number (99)
    const invalidAttempt1 = {
      ...validOutput,
      description_en: 'Crafted with 99 delicate brush strokes over 3 days.',
    };

    const geminiMock = vi
      .fn()
      .mockResolvedValueOnce(invalidAttempt1)
      .mockResolvedValueOnce(validOutput);

    const result = await simulateEdgeFunction(geminiMock);

    expect(geminiMock).toHaveBeenCalledTimes(2);
    // Attempt 2 received the validation error in prompt feedback
    expect(geminiMock.mock.calls[1][0]).toContain('unauthorized number: 99');
    expect(result.status).toBe(200);
    expect(result.body.title_en).toBe(validOutput.title_en);
  });

  it('returns 502 with honest error and failedRule if attempt 2 also fails validation', async () => {
    // Attempt 1 contains unauthorized price
    const invalidAttempt1 = {
      ...validOutput,
      description_en: 'Available at best price of Rs. 1200.',
    };

    // Attempt 2 still contains unauthorized price
    const invalidAttempt2 = {
      ...validOutput,
      description_en: 'This handcrafted ceramic flower vase cost is ₹ 1000 only.',
    };

    const geminiMock = vi
      .fn()
      .mockResolvedValueOnce(invalidAttempt1)
      .mockResolvedValueOnce(invalidAttempt2);

    const result = await simulateEdgeFunction(geminiMock);

    expect(geminiMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(502);
    expect(result.body.failedRule).toBe('price');
    expect(result.body.error).toContain('price or currency');
  });
});
