// src/hooks/useImageCapture.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, type PermissionStatus } from '@capacitor/camera';

export interface CaptureError {
  type: 'permission' | 'upload' | 'device' | 'invalid_type';
  title: string;
  subtitle: string;
}

export interface UseImageCaptureOptions {
  onPhotoSelected?: (blob: Blob, previewUrl: string) => void;
  onError?: (error: CaptureError) => void;
}

export interface UseImageCaptureReturn {
  captureFromCamera: () => Promise<void>;
  captureFromGallery: () => Promise<void>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  galleryInputRef: React.RefObject<HTMLInputElement | null>;
  handleWebCameraChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleWebGalleryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  errorInfo: CaptureError | null;
  clearError: () => void;
  isNative: boolean;
}

/**
 * Shared hook for mobile camera and gallery photo capture.
 * Handles Capacitor native camera plugins on mobile (Android/iOS)
 * and accessible HTML5 file inputs on web with proper permission fallbacks.
 */
export function useImageCapture(options?: UseImageCaptureOptions): UseImageCaptureReturn {
  const [errorInfo, setErrorInfo] = useState<CaptureError | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, []);

  const clearError = useCallback(() => {
    setErrorInfo(null);
  }, []);

  const reportError = useCallback(
    (err: CaptureError) => {
      setErrorInfo(err);
      options?.onError?.(err);
    },
    [options]
  );

  const handleBlobReady = useCallback(
    (blob: Blob, url: string) => {
      if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
      activeBlobUrlRef.current = url;
      clearError();
      options?.onPhotoSelected?.(blob, url);
    },
    [clearError, options]
  );

  /**
   * Native capture using Capacitor Camera plugin
   */
  const captureNative = useCallback(
    async (source: CameraSource) => {
      clearError();

      try {
        // 1. Verify/request appropriate permissions
        const permissionName = source === CameraSource.Camera ? 'camera' : 'photos';
        let permissions: PermissionStatus;

        try {
          permissions = await Camera.checkPermissions();
          if (permissions[permissionName] !== 'granted') {
            permissions = await Camera.requestPermissions({ permissions: [permissionName] });
          }
        } catch {
          // Fallback if platform does not implement permissions check
          permissions = { camera: 'granted', photos: 'granted' };
        }

        if (permissions[permissionName] === 'denied') {
          const isCamera = source === CameraSource.Camera;
          reportError({
            type: 'permission',
            title: isCamera
              ? 'Camera Access Needed / कैमरा अनुमति चाहिए'
              : 'Gallery Access Needed / गैलरी अनुमति चाहिए',
            subtitle: isCamera
              ? 'Please allow camera permission in phone settings / कृपया फोन सेटिंग्स में कैमरा अनुमति दें।'
              : 'Please allow gallery access in phone settings / कृपया फोन सेटिंग्स में गैलरी अनुमति दें।',
          });
          return;
        }

        // 2. Open Camera or Gallery Picker
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source,
        });

        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          handleBlobReady(blob, photo.webPath);
        }
      } catch (err: unknown) {
        const errStr = String(err).toLowerCase();
        // User cancelled without taking a photo
        if (
          errStr.includes('cancelled') ||
          errStr.includes('canceled') ||
          errStr.includes('user cancelled')
        ) {
          return;
        }

        // If native camera fails unexpectedly, fallback to web input
        if (source === CameraSource.Camera && cameraInputRef.current) {
          cameraInputRef.current.click();
        } else if (source === CameraSource.Photos && galleryInputRef.current) {
          galleryInputRef.current.click();
        } else {
          reportError({
            type: 'device',
            title: 'Camera Unavailable / कैमरा शुरू नहीं हुआ',
            subtitle:
              'Could not access camera on your device / आपके डिवाइस पर कैमरा शुरू नहीं हो सका।',
          });
        }
      }
    },
    [clearError, handleBlobReady, reportError]
  );

  /**
   * Web file input handler (validates image MIME type and creates ObjectURL)
   */
  const handleWebFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input value so re-selecting same photo triggers onChange
      e.target.value = '';

      if (!file) return;

      if (!file.type.startsWith('image/')) {
        reportError({
          type: 'invalid_type',
          title: 'Please Select an Image / कृपया फोटो चुनें',
          subtitle:
            'Only JPEG, PNG, and WEBP photos are supported / केवल JPEG, PNG और WEBP समर्थित हैं।',
        });
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      handleBlobReady(file, objectUrl);
    },
    [handleBlobReady, reportError]
  );

  const captureFromCamera = useCallback(async () => {
    if (isNative) {
      await captureNative(CameraSource.Camera);
    } else {
      cameraInputRef.current?.click();
    }
  }, [captureNative, isNative]);

  const captureFromGallery = useCallback(async () => {
    if (isNative) {
      await captureNative(CameraSource.Photos);
    } else {
      galleryInputRef.current?.click();
    }
  }, [captureNative, isNative]);

  return {
    captureFromCamera,
    captureFromGallery,
    cameraInputRef,
    galleryInputRef,
    handleWebCameraChange: handleWebFile,
    handleWebGalleryChange: handleWebFile,
    errorInfo,
    clearError,
    isNative,
  };
}
