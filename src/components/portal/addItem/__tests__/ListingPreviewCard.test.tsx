/**
 * Stage 6.6: ListingPreviewCard unit tests.
 *
 * REAL LOGIC under test (NO MOCKS):
 * - Gallery photo ordering: cover photo is always first, followed by slot order
 * - Selected original/enhanced photo URL resolution
 * - Swipe / chevron photo navigation and dot indicators
 * - Section rendering: title, caption, highlights, description, tags
 * - Editable vs non-editable mode (storefront reuse: no edit pencils in non-editable mode)
 * - Section edit callbacks triggered correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ListingPreviewCard } from '../steps/ListingPreviewCard';
import type { ProductImage } from '../../../../types/product';

const mockImages: ProductImage[] = [
  {
    id: 'img-1',
    product_id: 'prod-1',
    artisan_id: 'art-1',
    position: 0,
    original_image_url: 'https://storage/raw1.jpg',
    enhanced_image_url: 'https://storage/enhanced1.png',
    image_processing_status: 'enhanced',
    final_image_choice: 'enhanced',
    is_cover: false,
    created_at: '2026-09-24T00:00:00Z',
  },
  {
    id: 'img-2',
    product_id: 'prod-1',
    artisan_id: 'art-1',
    position: 1,
    original_image_url: 'https://storage/raw2.jpg',
    enhanced_image_url: 'https://storage/enhanced2.png',
    image_processing_status: 'enhanced',
    final_image_choice: 'original',
    is_cover: true, // This is the COVER photo!
    created_at: '2026-09-24T00:00:00Z',
  },
  {
    id: 'img-3',
    product_id: 'prod-1',
    artisan_id: 'art-1',
    position: 2,
    original_image_url: 'https://storage/raw3.jpg',
    enhanced_image_url: null,
    image_processing_status: 'pending',
    final_image_choice: null,
    is_cover: false,
    created_at: '2026-09-24T00:00:00Z',
  },
];

describe('ListingPreviewCard', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders photo gallery with cover photo first and uses chosen image version', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ListingPreviewCard
          images={mockImages}
          title="Sheesham Wood Table"
          caption="Handcrafted wooden table"
          highlights={['Handmade', 'Solid wood']}
          description="A beautiful table crafted from sheesham wood."
        />
      );
    });

    const activeImg = container.querySelector('[data-testid="preview-active-image"]') as HTMLImageElement;
    expect(activeImg).toBeTruthy();
    // img-2 is cover with final_image_choice: 'original', so raw2.jpg must be displayed first!
    expect(activeImg.src).toBe('https://storage/raw2.jpg');

    // Cover badge should be visible
    expect(container.textContent).toContain('मुख्य फोटो');
  });

  it('navigates next and previous photos via navigation buttons', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ListingPreviewCard
          images={mockImages}
          title="Sheesham Wood Table"
          caption="Handcrafted wooden table"
          highlights={['Handmade', 'Solid wood']}
          description="A beautiful table."
        />
      );
    });

    const nextBtn = container.querySelector('[data-testid="gallery-next-button"]') as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();

    await act(async () => {
      nextBtn.click();
    });

    const activeImgAfterNext = container.querySelector('[data-testid="preview-active-image"]') as HTMLImageElement;
    // img-1 is next (final_image_choice: 'enhanced', so enhanced1.png)
    expect(activeImgAfterNext.src).toBe('https://storage/enhanced1.png');

    const prevBtn = container.querySelector('[data-testid="gallery-prev-button"]') as HTMLButtonElement;
    await act(async () => {
      prevBtn.click();
    });

    const activeImgAfterPrev = container.querySelector('[data-testid="preview-active-image"]') as HTMLImageElement;
    expect(activeImgAfterPrev.src).toBe('https://storage/raw2.jpg');
  });

  it('renders all listing sections: title, caption, highlights, description, tags', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ListingPreviewCard
          images={mockImages}
          title="Traditional Brass Diya"
          caption="Authentic handcrafted temple diya"
          highlights={['Pure brass metal', 'Hand cast technique', '15 cm height', '3 days of craftsmanship']}
          description="Cast by hand using sand casting methods."
          searchTags={['brass diya', 'puja lamp', 'handcrafted']}
          language="en"
          shopName="Pooja Metals"
          category="Brasscraft"
        />
      );
    });

    expect(container.querySelector('[data-testid="preview-title"]')?.textContent).toContain('Traditional Brass Diya');
    expect(container.querySelector('[data-testid="preview-caption"]')?.textContent).toContain('Authentic handcrafted temple diya');
    expect(container.textContent).toContain('Pure brass metal');
    expect(container.textContent).toContain('Cast by hand using sand casting methods.');
    expect(container.textContent).toContain('#brass diya');
    expect(container.textContent).toContain('Pooja Metals');
    expect(container.textContent).toContain('Brasscraft');
  });

  it('shows no edit buttons in non-editable mode (direct storefront reuse)', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ListingPreviewCard
          images={mockImages}
          title="Sample Title"
          caption="Sample Caption"
          highlights={['Bullet 1', 'Bullet 2']}
          description="Sample Description."
          editable={false}
        />
      );
    });

    expect(container.querySelector('[data-testid="edit-title-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="edit-caption-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="edit-highlights-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="edit-description-btn"]')).toBeNull();
  });

  it('triggers onEditSection callbacks in editable mode', async () => {
    const handleEdit = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ListingPreviewCard
          images={mockImages}
          title="Sample Title"
          caption="Sample Caption"
          highlights={['Bullet 1', 'Bullet 2']}
          description="Sample Description."
          editable={true}
          onEditSection={handleEdit}
        />
      );
    });

    const editTitleBtn = container.querySelector('[data-testid="edit-title-btn"]') as HTMLButtonElement;
    expect(editTitleBtn).toBeTruthy();

    await act(async () => {
      editTitleBtn.click();
    });
    expect(handleEdit).toHaveBeenCalledWith('title');

    const editCaptionBtn = container.querySelector('[data-testid="edit-caption-btn"]') as HTMLButtonElement;
    await act(async () => {
      editCaptionBtn.click();
    });
    expect(handleEdit).toHaveBeenCalledWith('caption');

    const editHighlightsBtn = container.querySelector('[data-testid="edit-highlights-btn"]') as HTMLButtonElement;
    await act(async () => {
      editHighlightsBtn.click();
    });
    expect(handleEdit).toHaveBeenCalledWith('highlights');

    const editDescBtn = container.querySelector('[data-testid="edit-description-btn"]') as HTMLButtonElement;
    await act(async () => {
      editDescBtn.click();
    });
    expect(handleEdit).toHaveBeenCalledWith('description');
  });
});
