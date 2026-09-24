// src/components/portal/addItem/steps/ListingPreviewCard.tsx
/**
 * Stage 6.6: Reusable buyer-view ListingPreviewCard.
 *
 * Displays exactly what buyers see on the storefront:
 * - Swipeable photo gallery (cover first, chosen original/enhanced version)
 * - Title, SEO caption, highlights bullets, narrative description, tags
 * - Completely decoupled from wizard state — reusable directly in Stage 6.9 storefront.
 * - Optional editable mode for wizard inline voice edit triggers.
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Pencil,
  Tag,
  Store,
  Image as ImageIcon,
} from 'lucide-react';
import type { ProductImage, ListingSection } from '../../../../types/product';
import { getProductImageDisplayUrl } from '../../../../services/imageEnhancementService';

export interface ListingPreviewCardProps {
  /** Product images from product_images table or string URLs. */
  images?: ProductImage[] | string[];
  title: string;
  caption: string;
  highlights: string[];
  description: string;
  searchTags?: string[];
  language?: 'en' | 'hi';
  shopName?: string | null;
  category?: string | null;
  price?: number | null;
  /** Optional edit triggers when rendered in the Add Item Wizard preview step. */
  editable?: boolean;
  onEditSection?: (section: ListingSection) => void;
  className?: string;
}

export const ListingPreviewCard: React.FC<ListingPreviewCardProps> = ({
  images = [],
  title,
  caption,
  highlights = [],
  description,
  searchTags = [],
  language = 'hi',
  shopName,
  category,
  price,
  editable = false,
  onEditSection,
  className = '',
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  // Normalize images: ensure cover image is first, resolve chosen enhanced/original URL
  const displayPhotos = useMemo(() => {
    if (!images || images.length === 0) return [];

    // String URLs passed directly
    if (typeof images[0] === 'string') {
      return (images as string[]).map((url, idx) => ({
        id: `img-${idx}`,
        url,
        isCover: idx === 0,
      }));
    }

    const prodImages = [...(images as ProductImage[])];
    // Sort: cover photo first, then by position
    prodImages.sort((a, b) => {
      if (a.is_cover && !b.is_cover) return -1;
      if (!a.is_cover && b.is_cover) return 1;
      return a.position - b.position;
    });

    return prodImages.map((img) => ({
      id: img.id,
      url: getProductImageDisplayUrl(img),
      isCover: img.is_cover,
    }));
  }, [images]);

  const hasPhotos = displayPhotos.length > 0;
  const currentPhoto = hasPhotos ? displayPhotos[Math.min(activeImageIndex, displayPhotos.length - 1)] : null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : displayPhotos.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev < displayPhotos.length - 1 ? prev + 1 : 0));
  };

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    const threshold = 40; // min swipe distance in px

    if (diff > threshold) {
      // Swiped left -> Next photo
      setActiveImageIndex((prev) => (prev < displayPhotos.length - 1 ? prev + 1 : 0));
    } else if (diff < -threshold) {
      // Swiped right -> Prev photo
      setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : displayPhotos.length - 1));
    }
    touchStartXRef.current = null;
  };

  return (
    <article
      className={`w-full max-w-xl mx-auto bg-[#1A120E] border border-[#2A1E17] rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 text-slate-100 font-sans ${className}`}
      data-testid="listing-preview-card"
    >
      {/* 1. Swipeable Photo Gallery */}
      <div
        className="relative w-full aspect-square sm:aspect-[4/3] bg-[#120B08] overflow-hidden select-none group"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-testid="preview-gallery"
      >
        {currentPhoto?.url ? (
          <img
            src={currentPhoto.url}
            alt={title || 'Product Photo'}
            className="w-full h-full object-cover object-center transition-transform duration-300"
            data-testid="preview-active-image"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <ImageIcon className="w-12 h-12 stroke-1" />
            <p className="text-xs">
              {language === 'hi' ? 'कोई फोटो उपलब्ध नहीं है' : 'No photo available'}
            </p>
          </div>
        )}

        {/* Gallery Navigation Controls (Only if multiple photos) */}
        {displayPhotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center transition-all opacity-80 hover:opacity-100 active:scale-95 shadow cursor-pointer"
              aria-label="Previous photo"
              data-testid="gallery-prev-button"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center transition-all opacity-80 hover:opacity-100 active:scale-95 shadow cursor-pointer"
              aria-label="Next photo"
              data-testid="gallery-next-button"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Photo Counter Pill & Dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md">
              {displayPhotos.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === activeImageIndex ? 'w-5 bg-[#EA580C]' : 'w-1.5 bg-white/50 hover:bg-white/80'
                  }`}
                  aria-label={`Jump to photo ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Badges: Cover Tag & Category */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 pointer-events-none">
          {currentPhoto?.isCover && (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[#EA580C] text-white shadow-md">
              {language === 'hi' ? 'मुख्य फोटो' : 'Cover'}
            </span>
          )}
          {category && (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-black/60 backdrop-blur-md text-slate-200 shadow-md">
              {category}
            </span>
          )}
        </div>

        {/* Shop Name Tag */}
        {shopName && (
          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-black/70 backdrop-blur-md text-slate-300 flex items-center gap-1 shadow-md">
            <Store className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>{shopName}</span>
          </div>
        )}
      </div>

      {/* 2. Product Details Body */}
      <div className="p-5 sm:p-6 space-y-5">
        {/* Title Section */}
        <div className="relative group">
          <div className="flex items-start justify-between gap-3">
            <h1
              className="text-lg sm:text-xl font-bold text-white leading-snug tracking-tight"
              data-testid="preview-title"
            >
              {title || (language === 'hi' ? 'शीर्षक तैयार हो रहा है...' : 'Generating title...')}
            </h1>
            {editable && onEditSection && (
              <button
                type="button"
                onClick={() => onEditSection('title')}
                className="shrink-0 w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-400 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                title={language === 'hi' ? 'शीर्षक बदलें' : 'Edit title'}
                aria-label="Edit title"
                data-testid="edit-title-btn"
              >
                <Pencil className="w-4 h-4 text-[#EA580C]" />
              </button>
            )}
          </div>

          {/* Price (if passed for storefront reuse in Stage 6.9) */}
          {price !== undefined && price !== null && (
            <div className="mt-1 text-base font-bold text-emerald-400">
              ₹{price.toLocaleString('en-IN')}
            </div>
          )}
        </div>

        {/* SEO Meta Caption */}
        <div className="relative group">
          <div className="flex items-start justify-between gap-3">
            <p
              className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium"
              data-testid="preview-caption"
            >
              {caption}
            </p>
            {editable && onEditSection && (
              <button
                type="button"
                onClick={() => onEditSection('caption')}
                className="shrink-0 w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-400 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                title={language === 'hi' ? 'कैप्शन बदलें' : 'Edit caption'}
                aria-label="Edit caption"
                data-testid="edit-caption-btn"
              >
                <Pencil className="w-4 h-4 text-[#EA580C]" />
              </button>
            )}
          </div>
        </div>

        {/* Highlights Section */}
        <div className="relative space-y-2.5 pt-2 border-t border-[#2A1E17]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>{language === 'hi' ? 'प्रमुख विशेषताएं' : 'Highlights'}</span>
            </h2>
            {editable && onEditSection && (
              <button
                type="button"
                onClick={() => onEditSection('highlights')}
                className="shrink-0 w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-400 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                title={language === 'hi' ? 'विशेषताएं बदलें' : 'Edit highlights'}
                aria-label="Edit highlights"
                data-testid="edit-highlights-btn"
              >
                <Pencil className="w-4 h-4 text-[#EA580C]" />
              </button>
            )}
          </div>

          <ul className="space-y-2" data-testid="preview-highlights-list">
            {highlights.map((bullet, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200 leading-normal"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Description Narrative */}
        <div className="relative space-y-2 pt-2 border-t border-[#2A1E17]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {language === 'hi' ? 'विवरण' : 'About this piece'}
            </h2>
            {editable && onEditSection && (
              <button
                type="button"
                onClick={() => onEditSection('description')}
                className="shrink-0 w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-400 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                title={language === 'hi' ? 'विवरण बदलें' : 'Edit description'}
                aria-label="Edit description"
                data-testid="edit-description-btn"
              >
                <Pencil className="w-4 h-4 text-[#EA580C]" />
              </button>
            )}
          </div>
          <p
            className="text-xs sm:text-sm text-slate-300 leading-relaxed"
            data-testid="preview-description"
          >
            {description}
          </p>
        </div>

        {/* Search Tags */}
        {searchTags.length > 0 && (
          <div className="pt-2 border-t border-[#2A1E17] space-y-2">
            <h3 className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-[#EA580C]" />
              <span>{language === 'hi' ? 'खोज टैग' : 'Search Tags'}</span>
            </h3>
            <div className="flex flex-wrap gap-1.5" data-testid="preview-search-tags">
              {searchTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg text-[11px] bg-[#120B08] border border-[#2A1E17] text-slate-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
};
