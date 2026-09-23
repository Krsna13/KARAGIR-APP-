// src/components/discover/PhotoSourceSheet.tsx
import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, X, AlertCircle } from 'lucide-react';
import { useImageCapture } from '../../hooks/useImageCapture';

export interface PhotoSourceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoSelected: (blob: Blob, previewUrl: string) => void;
  /** Header copy; defaults to the buyer "Snap & Discover" wording. */
  title?: string;
  titleHi?: string;
  subtitle?: string;
}

/**
 * Shared bottom sheet: take a live photo or upload from the gallery (via
 * useImageCapture). Used by buyer "Snap & Discover" and the artisan Add Item
 * wizard Photos step.
 */
export const PhotoSourceSheet: React.FC<PhotoSourceSheetProps> = ({
  isOpen,
  onClose,
  onPhotoSelected,
  title = 'Snap & Discover',
  titleHi = 'पहचानें और खोजें',
  subtitle = 'Identify handcrafted items & find local crafters',
}) => {
  const touchStartYRef = useRef<number | null>(null);

  const {
    captureFromCamera,
    captureFromGallery,
    cameraInputRef,
    galleryInputRef,
    handleWebCameraChange,
    handleWebGalleryChange,
    errorInfo,
    clearError,
  } = useImageCapture({
    onPhotoSelected: (blob, previewUrl) => {
      onPhotoSelected(blob, previewUrl);
      onClose();
    },
  });

  if (!isOpen) return null;

  // Swipe-down to close detection
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touches = (e.nativeEvent as any)?.touches || e.touches;
    const clientY = touches?.[0]?.clientY;
    if (typeof clientY === 'number') {
      touchStartYRef.current = clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current !== null) {
      const changedTouches =
        (e.nativeEvent as any)?.changedTouches ||
        (e.nativeEvent as any)?.touches ||
        e.changedTouches ||
        e.touches;
      const clientY = changedTouches?.[0]?.clientY;
      if (typeof clientY === 'number') {
        const deltaY = clientY - touchStartYRef.current;
        if (deltaY > 60) {
          onClose();
        }
      }
      touchStartYRef.current = null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="photo-source-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Select photo source"
    >
      {/* Hidden Web File Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="web-camera-input"
        onChange={handleWebCameraChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="web-gallery-input"
        onChange={handleWebGalleryChange}
      />

      {/* Bottom Sheet Container */}
      <div
        className="w-full max-w-[430px] bg-[#120B08] border-t border-[#2A1E17] rounded-t-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-250 select-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-testid="photo-source-sheet"
      >
        {/* Drag Handle Bar */}
        <div className="w-12 h-1.5 bg-[#2A1E17] hover:bg-[#EA580C]/40 rounded-full mx-auto cursor-grab" />

        {/* Sheet Header */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h2 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
              <span>{title}</span>
              <span className="text-slate-400 font-normal">/</span>
              <span className="text-[#EA580C] text-xs font-semibold">{titleHi}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-[#1A120E] border border-[#2A1E17] text-slate-400 hover:text-white flex items-center justify-center transition-colors active:scale-95"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification banner if permission was denied or invalid file selected */}
        {errorInfo && (
          <div
            className="p-3 rounded-2xl bg-amber-950/30 border border-amber-600/40 text-amber-300 text-xs flex items-start space-x-2.5 animate-in fade-in"
            data-testid="photo-source-error"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <p className="font-bold text-amber-200">{errorInfo.title}</p>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">{errorInfo.subtitle}</p>
            </div>
            <button
              onClick={clearError}
              className="text-amber-400 hover:text-amber-200 p-0.5"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Primary Action Buttons (min 48px touch target for high accessibility) */}
        <div className="grid grid-cols-1 gap-2.5 pt-1">
          {/* 1. Take Photo Button */}
          <button
            onClick={() => {
              clearError();
              captureFromCamera();
            }}
            type="button"
            data-testid="take-photo-button"
            className="w-full min-h-[56px] py-3 px-4 rounded-2xl bg-gradient-to-r from-[#EA580C] to-[#F97316] text-white font-extrabold flex items-center justify-between shadow-lg shadow-[#EA580C]/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-sm font-black tracking-tight leading-snug">Take Photo</div>
                <div className="text-[11px] text-orange-100 font-medium">फोटो खींचें</div>
              </div>
            </div>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full text-white font-mono">
              Live
            </span>
          </button>

          {/* 2. Upload from Gallery Button */}
          <button
            onClick={() => {
              clearError();
              captureFromGallery();
            }}
            type="button"
            data-testid="upload-gallery-button"
            className="w-full min-h-[56px] py-3 px-4 rounded-2xl bg-[#1A120E] hover:bg-[#251A14] border border-[#2A1E17] hover:border-[#EA580C]/50 text-white font-extrabold flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#261B15] border border-[#3A2A20] flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5 text-[#EAB308]" />
              </div>
              <div className="text-left">
                <div className="text-sm font-black tracking-tight leading-snug">Upload from Gallery</div>
                <div className="text-[11px] text-slate-400 font-medium">गैलरी से चुनें</div>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">JPG/PNG</span>
          </button>
        </div>

        {/* Cancel Button (min 48px height) */}
        <div className="pt-1">
          <button
            onClick={onClose}
            type="button"
            data-testid="cancel-sheet-button"
            className="w-full min-h-[48px] py-2.5 rounded-xl bg-[#170E0A] hover:bg-[#1F1510] border border-[#2A1E17] text-slate-300 hover:text-white text-xs font-bold transition-all active:scale-[0.98]"
          >
            Cancel / रद्द करें
          </button>
        </div>
      </div>
    </div>
  );
};
