import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EnhancedPhotoReview } from '../EnhancedPhotoReview';
import { supabase } from '../../../lib/supabase/client';
import * as imageService from '../../../services/imageEnhancementService';

const mockProducts: Record<string, any> = {
  'prod-rev-100': {
    id: 'prod-rev-100',
    original_image_url: 'https://test-storage.com/raw.jpg',
    enhanced_image_url: 'https://test-storage.com/enhanced.png',
    image_processing_status: 'processing',
    final_image_choice: null,
  },
  'prod-rev-200': {
    id: 'prod-rev-200',
    original_image_url: 'https://test-storage.com/original-craft.jpg',
    enhanced_image_url: 'https://test-storage.com/enhanced-craft.png',
    image_processing_status: 'enhanced',
    final_image_choice: null,
  },
  'prod-rev-300': {
    id: 'prod-rev-300',
    original_image_url: 'https://test-storage.com/original-craft.jpg',
    enhanced_image_url: 'https://test-storage.com/enhanced-craft.png',
    image_processing_status: 'enhanced',
    final_image_choice: null,
  },
  'prod-rev-fail-400': {
    id: 'prod-rev-fail-400',
    original_image_url: 'https://test-storage.com/raw.jpg',
    enhanced_image_url: null,
    image_processing_status: 'failed',
    final_image_choice: null,
  },
};

const updateMock = vi.fn().mockImplementation((payload: any) => ({
  eq: vi.fn().mockImplementation((_col: string, id: string) => {
    if (mockProducts[id]) {
      Object.assign(mockProducts[id], payload);
    }
    return Promise.resolve({ data: null, error: null });
  }),
}));

const selectMock = vi.fn().mockImplementation(() => ({
  eq: vi.fn().mockImplementation((_col: string, id: string) => ({
    single: vi.fn().mockImplementation(() => {
      const prod = mockProducts[id] || {
        id,
        original_image_url: 'https://test-storage.com/raw.jpg',
        enhanced_image_url: 'https://test-storage.com/enhanced.png',
        image_processing_status: 'enhanced',
        final_image_choice: null,
      };
      return Promise.resolve({ data: { ...prod }, error: null });
    }),
  })),
}));

// Mock Supabase client
vi.mock('../../../lib/supabase/client', () => {
  const channelMock = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  });

  return {
    supabase: {
      from: vi.fn(() => ({
        select: selectMock,
        update: updateMock,
      })),
      channel: channelMock,
      removeChannel: vi.fn(),
    },
  };
});

describe('EnhancedPhotoReview Component (Stage 1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('State 1: renders processing loading state with bilingual copy and spinner', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <EnhancedPhotoReview
          productId="prod-rev-100"
          initialStatus="processing"
          initialOriginalUrl="https://test-storage.com/raw.jpg"
        />
      );
    });

    const processingState = container.querySelector('[data-testid="processing-state"]');
    expect(processingState).not.toBeNull();

    expect(container.textContent).toContain('Enhancing your photo...');
    expect(container.textContent).toContain('आपकी फोटो बेहतर बनाई जा रही है');
    expect(container.textContent).toContain('Removing background & balancing lighting');

    const statusBadge = container.querySelector('[data-testid="status-badge"]');
    expect(statusBadge?.textContent).toContain('Processing');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('State 2: renders enhanced state with before/after comparison toggle and persists choice', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onCompleteMock = vi.fn();
    const testProductId = 'prod-rev-200';
    const testOriginalUrl = 'https://test-storage.com/original-craft.jpg';
    const testEnhancedUrl = 'https://test-storage.com/enhanced-craft.png';

    await act(async () => {
      root.render(
        <EnhancedPhotoReview
          productId={testProductId}
          initialStatus="enhanced"
          initialOriginalUrl={testOriginalUrl}
          initialEnhancedUrl={testEnhancedUrl}
          onComplete={onCompleteMock}
        />
      );
    });

    // 1. Verify enhanced container is visible
    const enhancedState = container.querySelector('[data-testid="enhanced-state"]');
    expect(enhancedState).not.toBeNull();

    // 2. Initial view is enhanced image
    const imageDisplay = container.querySelector(
      '[data-testid="review-image-display"]'
    ) as HTMLImageElement;
    expect(imageDisplay).not.toBeNull();
    expect(imageDisplay.src).toBe(testEnhancedUrl);

    // 3. Switch toggle to Original
    const toggleOriginalBtn = container.querySelector(
      '[data-testid="toggle-original"]'
    ) as HTMLButtonElement;
    expect(toggleOriginalBtn).not.toBeNull();

    await act(async () => {
      toggleOriginalBtn.click();
    });

    expect(imageDisplay.src).toBe(testOriginalUrl);

    // 4. Switch toggle back to Enhanced
    const toggleEnhancedBtn = container.querySelector(
      '[data-testid="toggle-enhanced"]'
    ) as HTMLButtonElement;
    expect(toggleEnhancedBtn).not.toBeNull();

    await act(async () => {
      toggleEnhancedBtn.click();
    });

    expect(imageDisplay.src).toBe(testEnhancedUrl);

    // 5. Click "Use Enhanced Photo" and assert persistence of choice to Supabase
    const useEnhancedBtn = container.querySelector(
      '[data-testid="use-enhanced-button"]'
    ) as HTMLButtonElement;
    expect(useEnhancedBtn).not.toBeNull();

    await act(async () => {
      useEnhancedBtn.click();
    });

    const productsInstance = supabase.from('products');
    expect(productsInstance.update).toHaveBeenCalledWith({
      final_image_choice: 'enhanced',
    });

    expect(onCompleteMock).toHaveBeenCalledWith(testEnhancedUrl, 'enhanced');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('State 2b: allows choosing "Keep Original Photo" and writes final_image_choice = "original"', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onCompleteMock = vi.fn();
    const testProductId = 'prod-rev-300';
    const testOriginalUrl = 'https://test-storage.com/original-craft.jpg';
    const testEnhancedUrl = 'https://test-storage.com/enhanced-craft.png';

    await act(async () => {
      root.render(
        <EnhancedPhotoReview
          productId={testProductId}
          initialStatus="enhanced"
          initialOriginalUrl={testOriginalUrl}
          initialEnhancedUrl={testEnhancedUrl}
          onComplete={onCompleteMock}
        />
      );
    });

    const useOriginalBtn = container.querySelector(
      '[data-testid="use-original-button"]'
    ) as HTMLButtonElement;
    expect(useOriginalBtn).not.toBeNull();

    await act(async () => {
      useOriginalBtn.click();
    });

    const productsInstance = supabase.from('products');
    expect(productsInstance.update).toHaveBeenCalledWith({
      final_image_choice: 'original',
    });

    expect(onCompleteMock).toHaveBeenCalledWith(testOriginalUrl, 'original');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('State 3: renders failed state and allows retrying via processProductImage', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const testProductId = 'prod-rev-fail-400';
    const retrySpy = vi.spyOn(imageService, 'processProductImage').mockResolvedValue({
      success: true,
      productId: testProductId,
      enhancedImageUrl: 'https://test-storage.com/retried-enhanced.png',
    });

    await act(async () => {
      root.render(
        <EnhancedPhotoReview
          productId={testProductId}
          initialStatus="failed"
          initialOriginalUrl="https://test-storage.com/raw.jpg"
        />
      );
    });

    const failedState = container.querySelector('[data-testid="failed-state"]');
    expect(failedState).not.toBeNull();
    expect(container.textContent).toContain('Enhancement Failed / फोटो संवर्धित नहीं हो सकी');

    const retryButton = container.querySelector(
      '[data-testid="retry-enhancement-button"]'
    ) as HTMLButtonElement;
    expect(retryButton).not.toBeNull();

    await act(async () => {
      retryButton.click();
    });

    expect(retrySpy).toHaveBeenCalledWith(testProductId);

    retrySpy.mockRestore();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
