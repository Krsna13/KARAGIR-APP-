// src/hooks/__tests__/useImageCapture.test.tsx
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useImageCapture, type UseImageCaptureReturn } from '../useImageCapture';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource } from '@capacitor/camera';

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
  },
}));

describe('useImageCapture (Web Live Camera & Native Routing)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: UseImageCaptureReturn | null = null;

  const flush = async (rounds = 4) => {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };

  const TestComponent: React.FC<{ onPhotoSelected?: (blob: Blob, url: string) => void }> = ({
    onPhotoSelected,
  }) => {
    const capture = useImageCapture({ onPhotoSelected });
    hookResult = capture;
    return (
      <div>
        <input ref={capture.cameraInputRef} data-testid="camera-input" type="file" />
        <input ref={capture.galleryInputRef} data-testid="gallery-input" type="file" />
        {capture.liveCameraElement}
      </div>
    );
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    hookResult = null;
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn(), kind: 'video' }],
        }),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('routes captureFromCamera on web to in-app LiveCameraView when getUserMedia is available', async () => {
    await act(async () => {
      root.render(<TestComponent />);
    });
    await flush();

    expect(hookResult?.isLiveCameraOpen).toBe(false);
    expect(hookResult?.liveCameraElement).toBeNull();

    // Trigger capture from camera
    await act(async () => {
      await hookResult?.captureFromCamera();
    });
    await flush();

    expect(hookResult?.isLiveCameraOpen).toBe(true);
    expect(hookResult?.liveCameraElement).not.toBeNull();
    expect(container.querySelector('[data-testid="live-camera-view"]')).not.toBeNull();
  });

  it('routes captureFromGallery on web strictly to file input without opening LiveCameraView', async () => {
    await act(async () => {
      root.render(<TestComponent />);
    });
    await flush();

    const galleryInput = container.querySelector('[data-testid="gallery-input"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(galleryInput, 'click');

    await act(async () => {
      await hookResult?.captureFromGallery();
    });
    await flush();

    expect(clickSpy).toHaveBeenCalled();
    expect(hookResult?.isLiveCameraOpen).toBe(false);
  });

  it('falls back to file input on web when getUserMedia is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {},
      writable: true,
      configurable: true,
    });

    await act(async () => {
      root.render(<TestComponent />);
    });
    await flush();

    const cameraInput = container.querySelector('[data-testid="camera-input"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(cameraInput, 'click');

    await act(async () => {
      await hookResult?.captureFromCamera();
    });
    await flush();

    expect(clickSpy).toHaveBeenCalled();
    expect(hookResult?.isLiveCameraOpen).toBe(false);
  });

  it('routes to Capacitor Camera on native Android platform unchanged', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Camera.getPhoto).mockResolvedValue({
      webPath: 'blob:native-camera-photo',
      format: 'jpeg',
    } as any);

    // Mock fetch for webPath blob
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['native-bytes'], { type: 'image/jpeg' })),
    } as any);

    const onPhotoSelected = vi.fn();

    await act(async () => {
      root.render(<TestComponent onPhotoSelected={onPhotoSelected} />);
    });
    await flush();

    await act(async () => {
      await hookResult?.captureFromCamera();
    });
    await flush();

    expect(Camera.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        source: CameraSource.Camera,
      })
    );
    expect(hookResult?.isLiveCameraOpen).toBe(false);
  });

  it('provides closeLiveCamera and fallbackToFileCamera handlers', async () => {
    await act(async () => {
      root.render(<TestComponent />);
    });
    await flush();

    // Open camera
    await act(async () => {
      await hookResult?.captureFromCamera();
    });
    await flush();
    expect(hookResult?.isLiveCameraOpen).toBe(true);

    // Fallback to file camera
    const cameraInput = container.querySelector('[data-testid="camera-input"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(cameraInput, 'click');

    await act(async () => {
      hookResult?.fallbackToFileCamera();
    });
    await flush();

    expect(hookResult?.isLiveCameraOpen).toBe(false);
    expect(clickSpy).toHaveBeenCalled();
  });
});
