import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Sun,
  Wand2,
  Check,
  RotateCcw,
  AlertCircle,
  ArrowLeft,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { processProductImage } from '../../services/imageEnhancementService';
import { setImageFinalChoice } from '../../services/productImageService';
import { enhancementQueue } from '../../services/imageProcessingQueue';

export interface EnhancedPhotoReviewProps {
  productId: string;
  /**
   * Stage 6.2: when set, reviews one product_images row instead of the
   * products row (choice saved per photo, retry goes through the sequential queue).
   */
  imageId?: string;
  initialOriginalUrl?: string;
  initialEnhancedUrl?: string;
  initialStatus?: 'pending' | 'processing' | 'enhanced' | 'failed';
  onComplete?: (chosenUrl: string, choice: 'original' | 'enhanced') => void;
  onCancel?: () => void;
  className?: string;
}

export type ReviewStatus = 'pending' | 'processing' | 'enhanced' | 'failed';
export type DisplayView = 'enhanced' | 'original';

/**
 * EnhancedPhotoReview Component (Stage 1.4)
 *
 * Displays real-time status of the AI background removal and lighting correction pipeline:
 * - 'processing' / 'pending': animated loading state with bilingual artisan copy
 * - 'enhanced': before/after toggle comparison with options to pick enhanced or original
 * - 'failed': friendly error state with retry action
 *
 * Persists the artisan's choice to `products.final_image_choice` ('original' | 'enhanced').
 */
export const EnhancedPhotoReview: React.FC<EnhancedPhotoReviewProps> = ({
  productId,
  imageId,
  initialOriginalUrl = '',
  initialEnhancedUrl = '',
  initialStatus = 'processing',
  onComplete,
  onCancel,
  className = '',
}) => {
  const [status, setStatus] = useState<ReviewStatus>(initialStatus);
  const [originalUrl, setOriginalUrl] = useState<string>(initialOriginalUrl);
  const [enhancedUrl, setEnhancedUrl] = useState<string>(initialEnhancedUrl);
  const [activeView, setActiveView] = useState<DisplayView>('enhanced');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sourceTable = imageId ? 'product_images' : 'products';
  const sourceId = imageId ?? productId;

  /**
   * Fetch current product (or product image) status from Supabase
   */
  const fetchProduct = useCallback(async () => {
    if (!sourceId) return;

    try {
      const { data, error } = await supabase
        .from(sourceTable)
        .select('id, original_image_url, enhanced_image_url, image_processing_status, final_image_choice')
        .eq('id', sourceId)
        .single();

      if (error) {
        console.warn('[EnhancedPhotoReview] Fetch product warning:', error.message);
        return;
      }

      if (data) {
        if (data.original_image_url) {
          setOriginalUrl(data.original_image_url);
        }
        if (data.enhanced_image_url) {
          setEnhancedUrl(data.enhanced_image_url);
        }
        if (data.image_processing_status) {
          setStatus(data.image_processing_status as ReviewStatus);
        }
      }
    } catch (err: unknown) {
      console.warn('[EnhancedPhotoReview] Network/fetch error:', err);
    }
  }, [sourceTable, sourceId]);

  // Initial fetch and real-time subscription / polling
  useEffect(() => {
    fetchProduct();

    // 1. Subscribe to Supabase Postgres real-time changes
    let channel: any = null;
    try {
      if (supabase && typeof supabase.channel === 'function') {
        channel = supabase
          .channel(`enhanced_review_${sourceId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: sourceTable,
              filter: `id=eq.${sourceId}`,
            },
            (payload: any) => {
              const newRow = payload?.new;
              if (newRow) {
                if (newRow.original_image_url) setOriginalUrl(newRow.original_image_url);
                if (newRow.enhanced_image_url) setEnhancedUrl(newRow.enhanced_image_url);
                if (newRow.image_processing_status) {
                  setStatus(newRow.image_processing_status as ReviewStatus);
                }
              }
            }
          )
          .subscribe();
      }
    } catch {
      // Channel subscription fallback
    }

    // 2. Poll periodically while status is in-flight (pending / processing)
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (status === 'processing' || status === 'pending') {
      pollInterval = setInterval(() => {
        fetchProduct();
      }, 1800);
    }

    return () => {
      if (channel && typeof supabase.removeChannel === 'function') {
        supabase.removeChannel(channel);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [sourceTable, sourceId, fetchProduct, status]);

  /**
   * Handle artisan selection: persist final_image_choice to products table
   */
  const handleSelectChoice = async (choice: 'original' | 'enhanced') => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (imageId) {
        // Per-photo choice; the service re-syncs the cover onto the products row.
        await setImageFinalChoice(imageId, choice);
      } else {
        const { error } = await supabase
          .from('products')
          .update({
            final_image_choice: choice,
          })
          .eq('id', productId);

        if (error) {
          console.warn('[EnhancedPhotoReview] Error saving final image choice:', error.message);
        }
      }

      const chosenUrl = choice === 'enhanced' ? (enhancedUrl || originalUrl) : originalUrl;

      if (onComplete) {
        onComplete(chosenUrl, choice);
      }
    } catch (err: unknown) {
      if (imageId) {
        // Per-photo mode: do not report a choice that was not saved.
        console.error('[EnhancedPhotoReview] Could not save photo choice:', err);
        setErrorMessage('Could not save. Try again / सहेज नहीं सके, फिर कोशिश करें');
        return;
      }
      console.warn('[EnhancedPhotoReview] Network fallback saving choice:', err);
      // Even in offline fallback, notify caller with choice
      const fallbackUrl = choice === 'enhanced' ? (enhancedUrl || originalUrl) : originalUrl;
      if (onComplete) {
        onComplete(fallbackUrl, choice);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle retry when image enhancement failed
   */
  const handleRetry = async () => {
    setIsRetrying(true);
    setStatus('processing');
    setErrorMessage(null);

    try {
      const result = imageId
        ? await enhancementQueue.enqueue(imageId)
        : await processProductImage(productId);
      if (result.success && result.enhancedImageUrl) {
        setEnhancedUrl(result.enhancedImageUrl);
        setStatus('enhanced');
      } else {
        // Re-fetch in case background worker updated DB
        await fetchProduct();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setStatus('failed');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      className={`w-full max-w-md mx-auto bg-[#140D09] border border-[#2A1E17] rounded-3xl p-4 sm:p-5 shadow-2xl text-slate-100 flex flex-col justify-between ${className}`}
      data-testid="enhanced-photo-review"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#241711]">
        <div className="flex items-center space-x-2">
          {onCancel && (
            <button
              onClick={onCancel}
              type="button"
              className="p-1.5 rounded-full bg-[#1F1510] text-slate-400 hover:text-white border border-[#2A1E17] transition-all active:scale-95 cursor-pointer"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h2 className="text-sm font-bold text-white flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-[#EA580C]" />
              <span>AI Photo Studio / फोटो समीक्षा</span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Stage 1.4: Review & Finalize Catalog Image
            </p>
          </div>
        </div>

        <span
          className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase border ${
            status === 'enhanced'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : status === 'failed'
              ? 'bg-red-500/10 text-red-400 border-red-500/30'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
          }`}
          data-testid="status-badge"
        >
          {status === 'enhanced'
            ? 'Enhanced / संवर्धित'
            : status === 'failed'
            ? 'Failed / विफल'
            : 'Processing / तैयार हो रहा है'}
        </span>
      </div>

      {/* Main Viewport Content */}
      <div className="my-4">
        {/* ============================================================ */}
        {/* 1. STATE: PROCESSING / PENDING                               */}
        {/* ============================================================ */}
        {(status === 'processing' || status === 'pending') && (
          <div
            className="w-full aspect-[4/3] rounded-2xl bg-[#1C120D] border border-[#3A2A20] flex flex-col items-center justify-center p-6 text-center space-y-4 shadow-inner relative overflow-hidden"
            data-testid="processing-state"
          >
            {/* Background shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#EA580C]/5 to-transparent animate-[shimmer_2s_infinite]" />

            {/* Centered multi-ring spinner */}
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full border-3 border-[#EA580C]/20 border-t-[#EA580C] animate-spin" />
              <div className="w-14 h-14 rounded-full border-2 border-amber-400/30 border-b-amber-400 animate-[spin_1.5s_linear_infinite_reverse] absolute" />
              <Wand2 className="w-7 h-7 text-[#EA580C] absolute" />
            </div>

            <div className="space-y-1.5 z-10">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Enhancing your photo... / आपकी फोटो बेहतर बनाई जा रही है
              </h3>
              <p className="text-xs text-amber-400/90 font-medium">
                Removing background & balancing lighting
              </p>
              <p className="text-[11px] text-slate-400 max-w-[260px] mx-auto">
                पृष्ठभूमि हटाई जा रही है और स्टूडियो रोशनी जोड़ी जा रही है
              </p>
            </div>

            {/* Micro steps indicator */}
            <div className="flex items-center space-x-2 text-[10px] text-slate-400 pt-1 z-10">
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[#261711] border border-[#3A2A20]">
                <Wand2 className="w-3 h-3 text-[#EA580C]" />
                <span>Segmenting</span>
              </span>
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[#261711] border border-[#3A2A20]">
                <Sun className="w-3 h-3 text-amber-400" />
                <span>Auto Lighting</span>
              </span>
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[#261711] border border-[#3A2A20]">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>Enhancing</span>
              </span>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 2. STATE: ENHANCED (BEFORE / AFTER COMPARISON)                */}
        {/* ============================================================ */}
        {status === 'enhanced' && (
          <div className="space-y-3" data-testid="enhanced-state">
            {/* Segmented Toggle Control */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-[#1C120D] border border-[#2A1E17] gap-1">
              <button
                type="button"
                onClick={() => setActiveView('enhanced')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  activeView === 'enhanced'
                    ? 'bg-gradient-to-r from-[#EA580C] to-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                data-testid="toggle-enhanced"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Enhanced (AI) / संवर्धित</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('original')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  activeView === 'original'
                    ? 'bg-[#2A1E17] text-white shadow-md border border-[#3A2A20]'
                    : 'text-slate-400 hover:text-white'
                }`}
                data-testid="toggle-original"
              >
                <ImageIcon className="w-3.5 h-3.5 text-slate-300" />
                <span>Original / मूल</span>
              </button>
            </div>

            {/* Comparison Display Viewport */}
            <div className="relative w-full aspect-[4/3] rounded-2xl bg-black overflow-hidden border border-[#3A2A20] shadow-xl flex items-center justify-center">
              {/* Checkerboard background for transparent PNG preview */}
              {activeView === 'enhanced' && (
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: `linear-gradient(45deg, #444 25%, transparent 25%), 
                                      linear-gradient(-45deg, #444 25%, transparent 25%), 
                                      linear-gradient(45deg, transparent 75%, #444 75%), 
                                      linear-gradient(-45deg, transparent 75%, #444 75%)`,
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  }}
                />
              )}

              {/* Current active image */}
              <img
                src={activeView === 'enhanced' ? (enhancedUrl || originalUrl) : originalUrl}
                alt={activeView === 'enhanced' ? 'AI Enhanced product' : 'Original product raw photo'}
                className="w-full h-full object-contain relative z-10 transition-opacity duration-300"
                data-testid="review-image-display"
              />

              {/* Active mode floating tag */}
              <div className="absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md text-[10px] font-bold border border-white/20 flex items-center space-x-1.5">
                {activeView === 'enhanced' ? (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span className="text-emerald-300">Studio Enhanced (Clean Background)</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-300">Original Camera Photo</span>
                  </>
                )}
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-400">
              Tap toggle above to compare before and after / तुलना करने के लिए ऊपर टैप करें
            </p>
          </div>
        )}

        {/* ============================================================ */}
        {/* 3. STATE: FAILED                                             */}
        {/* ============================================================ */}
        {status === 'failed' && (
          <div
            className="w-full aspect-[4/3] rounded-2xl bg-[#1C120D] border border-red-500/30 flex flex-col items-center justify-center p-6 text-center space-y-3 shadow-inner"
            data-testid="failed-state"
          >
            <div className="w-14 h-14 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 mb-1">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-red-200">
                Enhancement Failed / फोटो संवर्धित नहीं हो सकी
              </h3>
              <p className="text-xs text-slate-300 max-w-[260px]">
                Could not automatically remove background or balance lighting.
              </p>
              <p className="text-[11px] text-slate-400">
                You can retry or continue with the original photo.
              </p>
            </div>

            {errorMessage && (
              <p className="text-[10px] text-red-400 font-mono bg-red-950/40 px-2 py-1 rounded border border-red-800/40 max-w-xs truncate">
                {errorMessage}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Controls */}
      <div className="pt-3 border-t border-[#241711] space-y-2">
        {status === 'enhanced' && (
          <div className="space-y-2">
            {errorMessage && (
              <p
                className="text-[11px] text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-2 py-1.5 text-center"
                data-testid="choice-error"
              >
                {errorMessage}
              </p>
            )}
            {/* Primary Action: Use Enhanced Photo */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSelectChoice('enhanced')}
              className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-[#d14f0a] hover:to-amber-500 active:scale-98 transition-all flex items-center justify-center space-x-2 shadow-lg ring-1 ring-amber-400/40 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="use-enhanced-button"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Use Enhanced Photo / संवर्धित फोटो चुनें</span>
            </button>

            {/* Secondary Action: Keep Original Photo */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSelectChoice('original')}
              className="w-full py-2.5 px-4 rounded-2xl text-xs font-bold text-slate-300 bg-[#1C120D] hover:bg-[#251812] hover:text-white border border-[#2A1E17] active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="use-original-button"
            >
              <Check className="w-3.5 h-3.5 text-slate-400" />
              <span>Keep Original Photo / मूल फोटो रखें</span>
            </button>
          </div>
        )}

        {status === 'failed' && (
          <div className="space-y-2">
            {/* Retry Button */}
            <button
              type="button"
              disabled={isRetrying}
              onClick={handleRetry}
              className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white bg-[#EA580C] hover:bg-[#d14f0a] active:scale-98 transition-all flex items-center justify-center space-x-2 shadow-lg cursor-pointer disabled:opacity-60"
              data-testid="retry-enhancement-button"
            >
              <RotateCcw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>Retry Enhancement / दोबारा कोशिश करें</span>
            </button>

            {/* Keep Original Photo Fallback */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSelectChoice('original')}
              className="w-full py-2.5 px-4 rounded-2xl text-xs font-bold text-slate-300 bg-[#1C120D] hover:bg-[#251812] hover:text-white border border-[#2A1E17] active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer"
              data-testid="keep-original-fallback-button"
            >
              <Check className="w-3.5 h-3.5 text-slate-400" />
              <span>Keep Original Photo / मूल फोटो रखें</span>
            </button>
          </div>
        )}

        {(status === 'processing' || status === 'pending') && (
          <div className="text-center py-2 text-[11px] text-slate-500 font-medium">
            Please wait while AI processes your image... / कृपया प्रतीक्षा करें...
          </div>
        )}
      </div>
    </div>
  );
};
