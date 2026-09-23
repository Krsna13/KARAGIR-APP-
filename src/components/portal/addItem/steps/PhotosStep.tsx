import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  Camera,
  Box,
  RotateCw,
  ZoomIn,
  Star,
  Trash2,
  LoaderCircle,
  Sparkles,
  RotateCcw,
  AlertCircle,
  X,
} from 'lucide-react';
import { PhotoSourceSheet } from '../../../discover/PhotoSourceSheet';
import { EnhancedPhotoReview } from '../../../copilot/EnhancedPhotoReview';
import {
  addProductImage,
  deleteProductImage,
  listProductImages,
  productImageStoragePaths,
  removeStorageFiles,
  setCoverImage,
  ProductImageLimitError,
} from '../../../../services/productImageService';
import { enhancementQueue } from '../../../../services/imageProcessingQueue';
import { getProductImageDisplayUrl } from '../../../../services/imageEnhancementService';
import { MAX_PRODUCT_IMAGES, type ProductImage } from '../../../../types/product';

export interface PhotosStepProps {
  productId: string;
  artisanId: string;
  speakingLanguage?: string | null;
  /** Number of photos saved (uploaded + row inserted). Drives canProceed() for step 0. */
  onUploadedCountChange?: (count: number) => void;
}

type SlotStatus = 'uploading' | ProductImage['image_processing_status'];

const getStatusCopy = (status: SlotStatus, lang?: string | null): string => {
  if (lang === 'mr') {
    const mrMap: Record<SlotStatus, string> = {
      uploading: 'Uploading / अपलोड होत आहे',
      pending: 'Waiting / प्रतीक्षेत',
      processing: 'Enhancing / सुधारणा होत आहे',
      enhanced: 'Enhanced / सुधारित',
      failed: 'Failed / अयशस्वी',
    };
    return mrMap[status];
  }
  if (lang === 'en') {
    const enMap: Record<SlotStatus, string> = {
      uploading: 'Uploading...',
      pending: 'Waiting',
      processing: 'Enhancing...',
      enhanced: 'Enhanced',
      failed: 'Failed',
    };
    return enMap[status];
  }
  const hiMap: Record<SlotStatus, string> = {
    uploading: 'Uploading / अपलोड हो रहा है',
    pending: 'Waiting / कतार में',
    processing: 'Enhancing / बेहतर हो रही है',
    enhanced: 'Enhanced / बेहतर',
    failed: 'Failed / नहीं हुआ',
  };
  return hiMap[status];
};

const PHOTO_TIPS = [
  { icon: Box, en: 'Front', hi: 'सामने से', mr: 'समोरून' },
  { icon: RotateCw, en: 'Side', hi: 'बगल से', mr: 'बाजूने' },
  { icon: ZoomIn, en: 'Close-up', hi: 'नज़दीक से', mr: 'जवळून' },
];

const sortByPosition = (images: ProductImage[]) => [...images].sort((a, b) => a.position - b.position);

/**
 * Stage 6.2: Add Item wizard step 0 — up to 5 photos, each enhanced one at a
 * time through enhancementQueue, one chosen as cover.
 */
export const PhotosStep: React.FC<PhotosStepProps> = ({ productId, artisanId, speakingLanguage, onUploadedCountChange }) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState<{ position: number; previewUrl: string } | null>(null);
  const [sheetPosition, setSheetPosition] = useState<number | null>(null);
  const [reviewImageId, setReviewImageId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProductImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const patchImage = useCallback((imageId: string, patch: Partial<ProductImage>) => {
    if (!mountedRef.current) return;
    setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, ...patch } : img)));
  }, []);

  /** Queue one photo for enhancement. The queue runs strictly one photo at a time. */
  const startEnhancement = useCallback(
    (imageId: string) => {
      patchImage(imageId, {
        image_processing_status: enhancementQueue.isRunning(imageId) ? 'processing' : 'pending',
      });
      enhancementQueue
        .enqueue(imageId, {
          onStart: () => patchImage(imageId, { image_processing_status: 'processing' }),
        })
        .then((result) => {
          if (result.success) {
            patchImage(imageId, {
              image_processing_status: 'enhanced',
              enhanced_image_url: result.enhancedImageUrl ?? null,
            });
          } else {
            patchImage(imageId, { image_processing_status: 'failed' });
          }
        })
        .catch(() => patchImage(imageId, { image_processing_status: 'failed' }));
    },
    [patchImage]
  );

  // Load saved photos (resuming a draft) and resume any unfinished enhancement.
  useEffect(() => {
    let cancelled = false;
    listProductImages(productId)
      .then((rows) => {
        if (cancelled || !mountedRef.current) return;
        setImages(sortByPosition(rows));
        rows
          .filter((img) => img.image_processing_status === 'pending' || img.image_processing_status === 'processing')
          .forEach((img) => startEnhancement(img.id));
      })
      .catch((err: unknown) => {
        console.error('[PhotosStep] Could not load photos:', err);
        if (!cancelled) setErrorText('Could not load photos / फोटो लोड नहीं हुईं');
      });
    return () => {
      cancelled = true;
    };
  }, [productId, startEnhancement]);

  useEffect(() => {
    onUploadedCountChange?.(images.length);
  }, [images.length, onUploadedCountChange]);

  const isFull = images.length >= MAX_PRODUCT_IMAGES;

  const handlePhotoSelected = async (blob: Blob, previewUrl: string) => {
    const position = sheetPosition;
    setSheetPosition(null);
    if (position === null) return;
    if (isFull) {
      setErrorText(
        speakingLanguage === 'mr'
          ? 'Maximum 5 photos / कमाल 5 फोटो'
          : speakingLanguage === 'en'
          ? 'Maximum 5 photos'
          : 'Maximum 5 photos / अधिकतम 5 फोटो'
      );
      return;
    }

    setErrorText(null);
    setUploading({ position, previewUrl });
    try {
      const image = await addProductImage({ productId, artisanId, blob, position });
      if (!mountedRef.current) return;
      setImages((prev) => sortByPosition([...prev, image]));
      startEnhancement(image.id);
    } catch (err: unknown) {
      console.error('[PhotosStep] Could not add photo:', err);
      if (!mountedRef.current) return;
      setErrorText(
        err instanceof ProductImageLimitError
          ? (speakingLanguage === 'mr'
              ? 'Maximum 5 photos / कमाल 5 फोटो'
              : speakingLanguage === 'en'
              ? 'Maximum 5 photos'
              : 'Maximum 5 photos / अधिकतम 5 फोटो')
          : (speakingLanguage === 'mr'
              ? 'Photo not saved. Try again / फोटो सेव्ह झाला नाही, पुन्हा प्रयत्न करा'
              : speakingLanguage === 'en'
              ? 'Photo not saved. Try again'
              : 'Photo not saved. Try again / फोटो सहेजी नहीं गई, फिर कोशिश करें')
      );
    } finally {
      if (mountedRef.current) setUploading(null);
    }
  };

  const handleSetCover = async (image: ProductImage) => {
    if (image.is_cover) return;
    const previous = images;
    setErrorText(null);
    setImages((prev) => prev.map((img) => ({ ...img, is_cover: img.id === image.id })));
    try {
      await setCoverImage(productId, image.id);
    } catch (err: unknown) {
      console.error('[PhotosStep] Could not change cover:', err);
      if (!mountedRef.current) return;
      setImages(previous);
      setErrorText(
        speakingLanguage === 'mr'
          ? 'Cover not changed. Try again / मुख्य फोटो बदलली नाही, पुन्हा प्रयत्न करा'
          : speakingLanguage === 'en'
          ? 'Cover not changed. Try again'
          : 'Cover not changed. Try again / मुख्य फोटो नहीं बदली, फिर कोशिश करें'
      );
    }
  };

  const handleConfirmDelete = async () => {
    const image = confirmDelete;
    if (!image) return;
    setIsDeleting(true);
    setErrorText(null);
    try {
      const { newCoverId } = await deleteProductImage(image);

      // If this photo is still waiting/being enhanced, the worker may upload
      // enhanced.png after we removed it — clean up again once it settles.
      if (enhancementQueue.has(image.id)) {
        enhancementQueue
          .enqueue(image.id)
          .finally(() => removeStorageFiles([productImageStoragePaths(image).enhanced]));
      }

      if (!mountedRef.current) return;
      setImages((prev) =>
        prev
          .filter((img) => img.id !== image.id)
          .map((img) => (newCoverId ? { ...img, is_cover: img.id === newCoverId } : img))
      );
      setConfirmDelete(null);
    } catch (err: unknown) {
      console.error('[PhotosStep] Could not delete photo:', err);
      if (!mountedRef.current) return;
      setErrorText(
        speakingLanguage === 'mr'
          ? 'Photo not deleted. Try again / फोटो हटवला नाही, पुन्हा प्रयत्न करा'
          : 'Photo not deleted. Try again / फोटो नहीं हटी, फिर कोशिश करें'
      );
      setConfirmDelete(null);
    } finally {
      if (mountedRef.current) setIsDeleting(false);
    }
  };

  // Per-photo original vs enhanced comparison
  const reviewImage = reviewImageId ? images.find((img) => img.id === reviewImageId) : null;
  if (reviewImage) {
    return (
      <EnhancedPhotoReview
        productId={productId}
        imageId={reviewImage.id}
        initialOriginalUrl={reviewImage.original_image_url ?? ''}
        initialEnhancedUrl={reviewImage.enhanced_image_url ?? ''}
        initialStatus={reviewImage.image_processing_status}
        speakingLanguage={speakingLanguage}
        onComplete={(_chosenUrl, choice) => {
          patchImage(reviewImage.id, { final_image_choice: choice });
          setReviewImageId(null);
        }}
        onCancel={() => setReviewImageId(null)}
      />
    );
  }

  const slots = Array.from({ length: MAX_PRODUCT_IMAGES }, (_, position) => position);

  return (
    <div className="space-y-4" data-testid="photos-step">
      {/* What to photograph: icon tip strip */}
      <div className="grid grid-cols-3 gap-2 text-center" data-testid="photo-tips">
        {PHOTO_TIPS.map(({ icon: Icon, en, hi, mr }) => (
          <div
            key={en}
            className="p-2 rounded-xl bg-[#120B08] border border-[#2A1E17] flex flex-col items-center gap-1"
          >
            <Icon className="w-5 h-5 text-[#EA580C]" aria-hidden="true" />
            <span className="text-[11px] font-bold text-white leading-tight">{en}</span>
            <span className="text-[10px] text-slate-400 leading-tight">
              {speakingLanguage === 'mr' ? mr : speakingLanguage === 'en' ? en : hi}
            </span>
          </div>
        ))}
      </div>

      {errorText && (
        <div
          className="p-3 rounded-xl bg-red-950/40 border border-red-700/50 text-red-200 text-xs flex items-center gap-2"
          data-testid="photos-step-error"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span className="flex-1">{errorText}</span>
          <button
            type="button"
            onClick={() => setErrorText(null)}
            className="w-12 h-12 -my-3 -mr-2 flex items-center justify-center text-red-300 hover:text-white"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Five photo slots */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {slots.map((position) => {
          const image = images.find((img) => img.position === position);
          const isUploadingHere = uploading?.position === position;

          if (!image && !isUploadingHere) {
            return (
              <button
                key={position}
                type="button"
                disabled={isFull || uploading !== null}
                onClick={() => {
                  setErrorText(null);
                  setSheetPosition(position);
                }}
                className="relative aspect-square min-h-[48px] rounded-2xl border-2 border-dashed border-[#3A2A20] hover:border-[#EA580C] bg-[#120B08] flex flex-col items-center justify-center gap-1.5 text-slate-300 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid={`empty-slot-${position}`}
                aria-label={speakingLanguage === 'mr' ? 'Add photo / फोटो जोडा' : 'Add photo / फोटो जोड़ें'}
              >
                <div className="relative">
                  <Plus className="w-10 h-10 text-[#EA580C]" strokeWidth={2.5} />
                  <Camera className="w-5 h-5 text-white absolute -bottom-1 -right-3 bg-[#1A120E] rounded-md p-0.5" />
                </div>
                <span className="text-[10px] font-bold">
                  {speakingLanguage === 'mr' ? 'Add / जोडा' : 'Add / जोड़ें'}
                </span>
              </button>
            );
          }

          const status: SlotStatus = image ? image.image_processing_status : 'uploading';
          const thumbnail = image ? getProductImageDisplayUrl(image) : uploading?.previewUrl ?? '';
          const isBusy = status === 'uploading' || status === 'pending' || status === 'processing';

          return (
            <div
              key={position}
              className={`relative aspect-square rounded-2xl overflow-hidden bg-black border ${
                image?.is_cover ? 'border-[#EAB308] ring-2 ring-[#EAB308]/40' : 'border-[#2A1E17]'
              }`}
              data-testid={`photo-slot-${position}`}
            >
              {/* Photo body: tapping an enhanced photo opens the original/enhanced review */}
              <button
                type="button"
                disabled={!image || status !== 'enhanced'}
                onClick={() => image && setReviewImageId(image.id)}
                className="absolute inset-0 w-full h-full disabled:cursor-default cursor-pointer"
                data-testid={`open-review-${position}`}
                aria-label={speakingLanguage === 'mr' ? 'Compare original and enhanced / तुलना करा' : 'Compare original and enhanced / तुलना करें'}
              >
                {thumbnail && <img src={thumbnail} alt="" className="w-full h-full object-cover" />}
              </button>

              {/* Status */}
              <div
                className={`absolute bottom-0 inset-x-0 px-2 py-1.5 flex items-center gap-1.5 text-[10px] font-bold pointer-events-none ${
                  status === 'failed'
                    ? 'bg-red-950/90 text-red-200'
                    : status === 'enhanced'
                    ? 'bg-emerald-950/85 text-emerald-200'
                    : 'bg-black/75 text-amber-200'
                }`}
                data-testid={`slot-status-${position}`}
                data-status={status}
              >
                {isBusy && <LoaderCircle className="w-3.5 h-3.5 animate-spin shrink-0" />}
                {status === 'enhanced' && <Sparkles className="w-3.5 h-3.5 shrink-0" />}
                {status === 'failed' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{getStatusCopy(status, speakingLanguage)}</span>
              </div>

              {image && (
                <>
                  {/* Cover star (top-left) */}
                  <button
                    type="button"
                    onClick={() => handleSetCover(image)}
                    className="absolute top-0 left-0 w-12 h-12 flex items-center justify-center"
                    data-testid={image.is_cover ? `cover-badge-${position}` : `set-cover-${position}`}
                    aria-label={
                      image.is_cover
                        ? 'Cover photo / मुख्य फोटो'
                        : speakingLanguage === 'mr'
                        ? 'Make cover / मुख्य फोटो बनवा'
                        : 'Make cover / मुख्य फोटो बनाएं'
                    }
                    aria-pressed={image.is_cover}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center shadow ${
                        image.is_cover ? 'bg-[#EAB308] text-black' : 'bg-black/70 text-white border border-white/30'
                      }`}
                    >
                      <Star className="w-4 h-4" fill={image.is_cover ? 'currentColor' : 'none'} />
                    </span>
                  </button>

                  {/* Delete (top-right) */}
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(image)}
                    className="absolute top-0 right-0 w-12 h-12 flex items-center justify-center"
                    data-testid={`delete-photo-${position}`}
                    aria-label={speakingLanguage === 'mr' ? 'Delete photo / फोटो हटवा' : 'Delete photo / फोटो हटाएं'}
                  >
                    <span className="w-8 h-8 rounded-full bg-black/70 border border-white/30 text-white flex items-center justify-center shadow">
                      <Trash2 className="w-4 h-4" />
                    </span>
                  </button>

                  {/* Retry after failed enhancement */}
                  {status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => startEnhancement(image.id)}
                      className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-14 h-14 rounded-full bg-[#EA580C] text-white flex items-center justify-center shadow-lg active:scale-95"
                      data-testid={`retry-photo-${position}`}
                      aria-label={speakingLanguage === 'mr' ? 'Retry enhancement / पुन्हा प्रयत्न करा' : 'Retry enhancement / दोबारा कोशिश करें'}
                    >
                      <RotateCcw className="w-6 h-6" />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400 text-center" data-testid="photo-count">
        {isFull ? (
          <span data-testid="photo-limit-reached">
            {speakingLanguage === 'mr'
              ? 'Maximum 5 photos added / कमाल 5 फोटो जोडले गेले'
              : 'Maximum 5 photos added / अधिकतम 5 फोटो जुड़ गईं'}
          </span>
        ) : (
          <>
            {images.length} / {MAX_PRODUCT_IMAGES} photos · <Star className="inline w-3 h-3 text-[#EAB308]" /> = cover /
            मुख्य फोटो
          </>
        )}
      </p>

      {/* Camera / gallery choice (shared sheet + useImageCapture) */}
      <PhotoSourceSheet
        isOpen={sheetPosition !== null}
        onClose={() => setSheetPosition(null)}
        onPhotoSelected={handlePhotoSelected}
        title="Add Photo"
        titleHi={speakingLanguage === 'mr' ? 'फोटो जोडा' : 'फोटो जोड़ें'}
        subtitle={
          speakingLanguage === 'mr'
            ? 'फोटो काढा किंवा गॅलरीमधून निवडा'
            : 'Take a photo or choose from gallery'
        }
      />

      {/* Bilingual delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[1300] bg-black/75 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          data-testid="delete-confirm-dialog"
        >
          <div className="w-full max-w-sm bg-[#1A120E] border border-[#2A1E17] rounded-3xl p-5 space-y-4 text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">Delete this photo?</p>
              <p className="text-sm font-bold text-white">
                {speakingLanguage === 'mr' ? 'ही फोटो हटवायची?' : 'यह फोटो हटाएं?'}
              </p>
              {confirmDelete.is_cover && images.length > 1 && (
                <p className="text-[11px] text-amber-300">
                  {speakingLanguage === 'mr'
                    ? 'पुढील फोटो मुख्य फोटो बनेल'
                    : 'The next photo will become the cover / अगली फोटो मुख्य फोटो बनेगी'}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={isDeleting}
                className="min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] text-slate-200 text-xs font-bold active:scale-95"
                data-testid="cancel-delete-button"
              >
                {speakingLanguage === 'mr' ? 'No, keep / नाही, ठेवा' : 'No, keep / नहीं, रखें'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-60"
                data-testid="confirm-delete-button"
              >
                {isDeleting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {speakingLanguage === 'mr' ? 'Yes, delete / होय, हटवा' : 'Yes, delete / हाँ, हटाएं'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
