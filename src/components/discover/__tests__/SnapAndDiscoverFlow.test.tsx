// src/components/discover/__tests__/SnapAndDiscoverFlow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MobileHome } from '../../mobile/MobileHome';
import { PhotoSourceSheet } from '../PhotoSourceSheet';
import { SnapAndDiscover } from '../SnapAndDiscover';
import { NASHIK_LOCALITIES } from '../../../data/mockData';
import { KaragirStoreProvider } from '../../../context/KaragirStoreContext';
import * as identificationService from '../../../services/productIdentificationService';
import { Camera, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import type { ProductIdentification } from '../../../types';

/**
 * MOCK BOUNDARY STATEMENT:
 * Mock identifyProduct() and the Capacitor Camera plugin at their boundaries
 * (no live Gemini key or device camera in this environment).
 */

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {
    checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted', photos: 'granted' }),
    getPhoto: vi.fn(),
  },
  CameraSource: {
    Camera: 'CAMERA',
    Photos: 'PHOTOS',
  },
  CameraResultType: {
    Uri: 'uri',
    Base64: 'base64',
  },
}));

describe('Stage 5.2: Snap & Discover Component Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleIdentification: ProductIdentification = {
    item_name: 'Hand-Carved Sagwan Teak Mandir',
    material: 'Sagwan Teak Wood',
    category: 'Woodwork',
    confidence: 0.94,
    short_description: 'An intricately chiseled home temple with traditional fluted pillars.',
  };

  describe('MobileHome Search-Bar Camera Trigger', () => {
    it('opens PhotoSourceSheet on camera button tap and does NOT redirect to Craft Copilot / Custom Builder', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onOpenCustomBuilderMock = vi.fn();
      const onSelectArtisanMock = vi.fn();
      const onOpenReelMock = vi.fn();
      const onOpenExploreMock = vi.fn();

      await act(async () => {
        root.render(
          <KaragirStoreProvider>
            <MobileHome
              selectedLocation={NASHIK_LOCALITIES[0]}
              onSelectArtisan={onSelectArtisanMock}
              onOpenCustomBuilder={onOpenCustomBuilderMock}
              onOpenReel={onOpenReelMock}
              onOpenExplore={onOpenExploreMock}
            />
          </KaragirStoreProvider>
        );
      });

      const cameraButton = container.querySelector(
        '[data-testid="search-bar-camera-button"]'
      ) as HTMLButtonElement;
      expect(cameraButton).not.toBeNull();

      // Sheet should not be open initially
      expect(container.querySelector('[data-testid="photo-source-sheet"]')).toBeNull();

      // Click the search bar camera icon
      await act(async () => {
        cameraButton.click();
      });

      // Craft Copilot custom builder must NOT be called
      expect(onOpenCustomBuilderMock).not.toHaveBeenCalled();

      // PhotoSourceSheet must now be opened in DOM
      expect(container.querySelector('[data-testid="photo-source-sheet"]')).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe('PhotoSourceSheet Component', () => {
    it('closes on backdrop tap, cancel button click, and swipe-down gesture', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onCloseMock = vi.fn();
      const onPhotoSelectedMock = vi.fn();

      await act(async () => {
        root.render(
          <PhotoSourceSheet
            isOpen={true}
            onClose={onCloseMock}
            onPhotoSelected={onPhotoSelectedMock}
          />
        );
      });

      // 1. Backdrop tap
      const backdrop = container.querySelector('[data-testid="photo-source-backdrop"]') as HTMLElement;
      expect(backdrop).not.toBeNull();
      await act(async () => {
        backdrop.click();
      });
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // 2. Cancel button tap
      const cancelButton = container.querySelector(
        '[data-testid="cancel-sheet-button"]'
      ) as HTMLButtonElement;
      expect(cancelButton).not.toBeNull();
      await act(async () => {
        cancelButton.click();
      });
      expect(onCloseMock).toHaveBeenCalledTimes(2);

      // 3. Swipe down gesture (deltaY > 60px)
      const sheet = container.querySelector('[data-testid="photo-source-sheet"]') as HTMLElement;
      expect(sheet).not.toBeNull();

      await act(async () => {
        const reactPropsKey = Object.keys(sheet).find((k) => k.startsWith('__reactProps$') || k.startsWith('__reactProps'));
        if (reactPropsKey && (sheet as any)[reactPropsKey].onTouchStart) {
          (sheet as any)[reactPropsKey].onTouchStart({ touches: [{ clientY: 100 }] });
          (sheet as any)[reactPropsKey].onTouchEnd({ changedTouches: [{ clientY: 180 }] });
        } else {
          sheet.dispatchEvent(
            new TouchEvent('touchstart', {
              bubbles: true,
              cancelable: true,
              touches: [{ clientY: 100 } as any],
            })
          );
          sheet.dispatchEvent(
            new TouchEvent('touchend', {
              bubbles: true,
              cancelable: true,
              changedTouches: [{ clientY: 180 } as any],
            })
          );
        }
      });
      expect(onCloseMock).toHaveBeenCalledTimes(3);

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('triggers web file inputs when tapped in web mode', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onCloseMock = vi.fn();
      const onPhotoSelectedMock = vi.fn();

      await act(async () => {
        root.render(
          <PhotoSourceSheet
            isOpen={true}
            onClose={onCloseMock}
            onPhotoSelected={onPhotoSelectedMock}
          />
        );
      });

      const cameraInput = container.querySelector(
        '[data-testid="web-camera-input"]'
      ) as HTMLInputElement;
      const galleryInput = container.querySelector(
        '[data-testid="web-gallery-input"]'
      ) as HTMLInputElement;

      const cameraClickSpy = vi.spyOn(cameraInput, 'click');
      const galleryClickSpy = vi.spyOn(galleryInput, 'click');

      const takePhotoButton = container.querySelector(
        '[data-testid="take-photo-button"]'
      ) as HTMLButtonElement;
      const uploadGalleryButton = container.querySelector(
        '[data-testid="upload-gallery-button"]'
      ) as HTMLButtonElement;

      await act(async () => {
        takePhotoButton.click();
      });
      expect(cameraClickSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        uploadGalleryButton.click();
      });
      expect(galleryClickSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('invokes native Capacitor Camera with appropriate sources in native mode', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      const dummyPhoto = { webPath: 'capacitor://localhost/photo.jpg' };
      vi.mocked(Camera.getPhoto).mockResolvedValue(dummyPhoto as any);

      // Mock fetch for webPath blob conversion
      const dummyBlob = new Blob(['img-bytes'], { type: 'image/jpeg' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(dummyBlob),
      });

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onPhotoSelectedMock = vi.fn();

      await act(async () => {
        root.render(
          <PhotoSourceSheet
            isOpen={true}
            onClose={vi.fn()}
            onPhotoSelected={onPhotoSelectedMock}
          />
        );
      });

      const takePhotoButton = container.querySelector(
        '[data-testid="take-photo-button"]'
      ) as HTMLButtonElement;
      const uploadGalleryButton = container.querySelector(
        '[data-testid="upload-gallery-button"]'
      ) as HTMLButtonElement;

      // 1. Take photo -> CameraSource.Camera
      await act(async () => {
        takePhotoButton.click();
      });
      expect(Camera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ source: CameraSource.Camera })
      );

      // 2. Upload from gallery -> CameraSource.Photos
      await act(async () => {
        uploadGalleryButton.click();
      });
      expect(Camera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ source: CameraSource.Photos })
      );

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe('SnapAndDiscover Result View', () => {
    it('shows identifying loading state initially while vision engine processes', async () => {
      let resolveIdentification: (val: ProductIdentification) => void;
      const pendingPromise = new Promise<ProductIdentification>((resolve) => {
        resolveIdentification = resolve;
      });
      vi.spyOn(identificationService, 'identifyProduct').mockReturnValue(pendingPromise);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const dummyBlob = new Blob(['photo-data'], { type: 'image/jpeg' });

      await act(async () => {
        root.render(
          <SnapAndDiscover
            photoBlob={dummyBlob}
            previewUrl="blob:http://localhost/test-preview"
            onClose={vi.fn()}
          />
        );
      });

      expect(container.querySelector('[data-testid="identifying-state"]')).not.toBeNull();
      expect(container.textContent).toContain('Analyzing your craft photo...');
      expect(container.textContent).toContain('तस्वीर की पहचान की जा रही है');

      // Resolve
      await act(async () => {
        resolveIdentification!(sampleIdentification);
      });

      expect(container.querySelector('[data-testid="identifying-state"]')).toBeNull();
      expect(container.querySelector('[data-testid="result-state"]')).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('renders result with headline and material tag, and honest placeholder sections for price and artisans', async () => {
      vi.spyOn(identificationService, 'identifyProduct').mockResolvedValue(sampleIdentification);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const dummyBlob = new Blob(['photo-data'], { type: 'image/jpeg' });

      await act(async () => {
        root.render(
          <SnapAndDiscover
            photoBlob={dummyBlob}
            previewUrl="blob:http://localhost/test-preview"
            onClose={vi.fn()}
          />
        );
      });

      // Headline
      const headline = container.querySelector('[data-testid="item-name-headline"]');
      expect(headline?.textContent).toBe('Hand-Carved Sagwan Teak Mandir');

      // Material tag directly beneath headline
      const materialTag = container.querySelector('[data-testid="material-tag"]');
      expect(materialTag?.textContent).toContain('Sagwan Teak Wood');

      // Category and description
      const categoryBadge = container.querySelector('[data-testid="category-badge"]');
      expect(categoryBadge?.textContent).toContain('Woodwork');
      expect(container.textContent).toContain(
        'An intricately chiseled home temple with traditional fluted pillars.'
      );

      // Honest "Coming Soon" Placeholders
      const priceCard = container.querySelector('[data-testid="price-placeholder-card"]');
      expect(priceCard?.textContent).toContain('Estimated Price Range');
      expect(priceCard?.textContent).toContain('Coming Soon');
      expect(priceCard?.textContent).not.toMatch(/₹\s*\d+/); // No fake prices

      const artisansCard = container.querySelector('[data-testid="artisans-placeholder-card"]');
      expect(artisansCard?.textContent).toContain('Artisans Who Can Make This');
      expect(artisansCard?.textContent).toContain('Coming Soon');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('handles low confidence (< 0.6) as a tentative question and allows category correction', async () => {
      const lowConfidenceResult: ProductIdentification = {
        item_name: 'Brass Dhokra Figurine',
        material: 'Bell Metal',
        category: 'Brasscraft',
        confidence: 0.48, // Below 0.6 threshold
        short_description: 'A miniature tribal figurine with lost-wax cast detailing.',
      };

      vi.spyOn(identificationService, 'identifyProduct').mockResolvedValue(lowConfidenceResult);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const dummyBlob = new Blob(['photo-data'], { type: 'image/jpeg' });

      await act(async () => {
        root.render(
          <SnapAndDiscover
            photoBlob={dummyBlob}
            previewUrl="blob:http://localhost/test-preview"
            onClose={vi.fn()}
          />
        );
      });

      // Low confidence state must be present
      const lowConfView = container.querySelector('[data-testid="low-confidence-state"]');
      expect(lowConfView).not.toBeNull();

      // Must be phrased as a question, NEVER as fact
      expect(lowConfView?.textContent).toContain('Possibly: Brass Dhokra Figurine?');
      expect(lowConfView?.textContent).toContain('संभवतः: Brass Dhokra Figurine?');

      // Check Confirm button
      const confirmButton = container.querySelector(
        '[data-testid="confirm-low-confidence-button"]'
      ) as HTMLButtonElement;
      expect(confirmButton).not.toBeNull();

      // Check "Not quite" button to correct category
      const notQuiteButton = container.querySelector(
        '[data-testid="not-quite-button"]'
      ) as HTMLButtonElement;
      expect(notQuiteButton).not.toBeNull();

      await act(async () => {
        notQuiteButton.click();
      });

      // Category choices must be rendered
      expect(container.querySelector('[data-testid="category-picker"]')).not.toBeNull();
      const potteryOption = container.querySelector(
        '[data-testid="select-category-pottery"]'
      ) as HTMLButtonElement;
      expect(potteryOption).not.toBeNull();

      // Select Pottery
      await act(async () => {
        potteryOption.click();
      });

      // After selection, view state transitions to result with updated category
      expect(container.querySelector('[data-testid="result-state"]')).not.toBeNull();
      const categoryBadge = container.querySelector('[data-testid="category-badge"]');
      expect(categoryBadge?.textContent).toContain('Pottery');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('maps status 422 error to friendly craft upload prompt without raw codes', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      vi.spyOn(identificationService, 'identifyProduct').mockRejectedValue(
        new identificationService.ProductIdentificationError('Raw internal safety rejection', {
          status: 422,
        })
      );

      await act(async () => {
        root.render(
          <SnapAndDiscover
            photoBlob={new Blob(['422-img'], { type: 'image/jpeg' })}
            previewUrl="blob:http://localhost/test-preview"
            onClose={vi.fn()}
          />
        );
      });

      expect(container.textContent).toContain('Please upload a photo of a craft item');
      expect(container.textContent).toContain('कृपया किसी हस्तशिल्प वस्तु की तस्वीर अपलोड करें');
      expect(container.textContent).not.toContain('Raw internal safety rejection');
      expect(container.textContent).not.toContain('422');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('maps status 429 error to friendly rate limit message without raw codes', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      vi.spyOn(identificationService, 'identifyProduct').mockRejectedValue(
        new identificationService.ProductIdentificationError('Rate limit exceeded 429', {
          status: 429,
        })
      );

      await act(async () => {
        root.render(
          <SnapAndDiscover
            photoBlob={new Blob(['429-img'], { type: 'image/jpeg' })}
            previewUrl="blob:http://localhost/test-preview"
            onClose={vi.fn()}
          />
        );
      });

      expect(container.textContent).toContain('Too many requests, try again shortly');
      expect(container.textContent).toContain('बहुत सारे अनुरोध');
      expect(container.textContent).not.toContain('429');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('maps status 500 error to friendly service unavailable message without raw codes', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      vi.spyOn(identificationService, 'identifyProduct').mockRejectedValue(
        new identificationService.ProductIdentificationError('Database or Gemini 500 failure', {
          status: 500,
        })
      );

      await act(async () => {
        root.render(
          <SnapAndDiscover
            photoBlob={new Blob(['500-img'], { type: 'image/jpeg' })}
            previewUrl="blob:http://localhost/test-preview"
            onClose={vi.fn()}
          />
        );
      });

      expect(container.textContent).toContain('Identification is unavailable right now');
      expect(container.textContent).toContain('पहचान सेवा अभी उपलब्ध नहीं है');
      expect(container.textContent).not.toContain('500');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
