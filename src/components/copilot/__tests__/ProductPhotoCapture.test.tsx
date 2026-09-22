import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductPhotoCapture } from '../ProductPhotoCapture';
import { supabase } from '../../../lib/supabase/client';

// Mock Supabase client
vi.mock('../../../lib/supabase/client', () => {
  const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null });
  const getPublicUrlMock = vi.fn().mockImplementation((path: string) => ({
    data: { publicUrl: `https://test-supabase-storage.com/${path}` },
  }));
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  const selectMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'prod-999',
          artisan_id: 'artisan-777',
          original_image_url: 'https://test-supabase-storage.com/artisan-777/prod-999/test.jpg',
          image_processing_status: 'pending',
        },
        error: null,
      }),
    }),
  });

  return {
    supabase: {
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
          getPublicUrl: getPublicUrlMock,
        })),
      },
      from: vi.fn(() => ({
        select: selectMock,
        update: updateMock,
      })),
    },
  };
});

describe('ProductPhotoCapture Component (Stage 1.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with confirm button disabled initially before a photo is captured', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProductPhotoCapture
          productId="prod-test-123"
          artisanId="artisan-test-456"
        />
      );
    });

    // Check heading & capture prompt
    expect(container.textContent).toContain('Product Camera / फोटो कैमरा');
    expect(container.textContent).toContain('Tap to Take Photo / फोटो खींचें');

    // Confirm button must be disabled initially
    const confirmButton = container.querySelector(
      '[data-testid="confirm-upload-button"]'
    ) as HTMLButtonElement;

    expect(confirmButton).not.toBeNull();
    expect(confirmButton.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('enables confirm button after photo selection and uploads with correct artisan_id and product_id path', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onSuccessMock = vi.fn();
    const testProductId = 'prod-999';
    const testArtisanId = 'artisan-777';

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockObjectUrl = 'blob:http://localhost:5173/mock-preview-uuid';
    globalThis.URL.createObjectURL = vi.fn(() => mockObjectUrl);
    globalThis.URL.revokeObjectURL = vi.fn();

    await act(async () => {
      root.render(
        <ProductPhotoCapture
          productId={testProductId}
          artisanId={testArtisanId}
          onSuccess={onSuccessMock}
        />
      );
    });

    const fileInput = container.querySelector(
      '[data-testid="camera-file-input"]'
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // Simulate selecting a sample product image
    const sampleFile = new File(['fake-image-bytes'], 'craft_bowl.jpg', { type: 'image/jpeg' });

    await act(async () => {
      // Dispatch change event with file
      Object.defineProperty(fileInput, 'files', {
        value: [sampleFile],
        writable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Confirm preview is shown and confirm button is now enabled
    const previewImg = container.querySelector(
      '[data-testid="captured-photo-preview"]'
    ) as HTMLImageElement;
    expect(previewImg).not.toBeNull();
    expect(previewImg.getAttribute('src')).toBe(mockObjectUrl);

    const confirmButton = container.querySelector(
      '[data-testid="confirm-upload-button"]'
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);

    // Click confirm to trigger upload
    await act(async () => {
      confirmButton.click();
    });

    // Verify Supabase storage upload was called on 'product-photos-raw'
    expect(supabase.storage.from).toHaveBeenCalledWith('product-photos-raw');

    // Verify the upload path is scoped to {artisan_id}/{product_id}/{timestamp}.jpg
    const storageFromInstance = supabase.storage.from('product-photos-raw');
    expect(storageFromInstance.upload).toHaveBeenCalled();

    const uploadArgs = vi.mocked(storageFromInstance.upload).mock.calls[0];
    const uploadedPath = uploadArgs[0] as string;

    expect(uploadedPath.startsWith(`${testArtisanId}/${testProductId}/`)).toBe(true);
    expect(uploadedPath.endsWith('.jpg')).toBe(true);

    // Verify products table update with original_image_url and pending status
    expect(supabase.from).toHaveBeenCalledWith('products');
    const productsInstance = supabase.from('products');
    expect(productsInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        original_image_url: expect.stringContaining(`${testArtisanId}/${testProductId}/`),
        image_processing_status: 'pending',
      })
    );

    // Verify onSuccess was called
    expect(onSuccessMock).toHaveBeenCalledTimes(1);

    // Verify seamless transition to EnhancedPhotoReview review screen
    const reviewElement = container.querySelector('[data-testid="enhanced-photo-review"]');
    expect(reviewElement).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
