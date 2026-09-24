// src/components/portal/addItem/steps/PreviewStep.tsx
/**
 * Stage 6.6: Add Item Wizard Step 3 — Multilingual Listing Preview.
 *
 * 1. Checks facts hash: generates listing if not present or prompts if facts changed post-approval.
 * 2. Reusable ListingPreviewCard showing buyer view with swipeable gallery & EN/HI toggle.
 * 3. Audio read-aloud ("Listen / सुनें") in artisan's language.
 * 4. Section-level voice revision with VoiceInputButton.
 * 5. "Tell buyers anything else / और कुछ बताना है?" mic input.
 * 6. Deterministic simple listing fallback if AI generation fails.
 * 7. "Looks good / ठीक है" approval gating canProceed(3).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Mic,
  X,
} from 'lucide-react';
import { ListingPreviewCard } from './ListingPreviewCard';
import { VoiceInputButton } from '../../../voice/VoiceInputButton';
import { speakText } from '../../../../config/languages';
import { listProductImages } from '../../../../services/productImageService';
import { getArtisanProfile } from '../../../../services/storageService';
import {
  invokeGenerateListing,
  approveDraftListing,
} from '../../../../services/listingService';
import {
  computeFactsHash,
  haveFactsChanged,
  generateSimpleListing,
  isListingPresent,
} from './listingLogic';
import type {
  ProductRecord,
  ProductImage,
  ListingResult,
  ListingSection,
} from '../../../../types/product';
import type { VoiceFieldSpec } from '../../../../types/voice';
import type { ArtisanListingProfile } from '../../../../../supabase/functions/generate-listing/validation';
import { saveDraft } from '../../../../services/draftService';
import type { Database } from '../../../../lib/supabase/database.types';

type ProductUpdate = Database['public']['Tables']['products']['Update'];

export interface PreviewStepProps {
  productId: string;
  draft: ProductRecord;
  speakingLanguage: string | null;
  onDraftPatch: (patch: Partial<ProductRecord>) => void;
  artisanId?: string;
}

export const PreviewStep: React.FC<PreviewStepProps> = ({
  productId,
  draft,
  speakingLanguage,
  onDraftPatch,
  artisanId,
}) => {
  const [displayLang, setDisplayLang] = useState<'hi' | 'en'>('hi');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [artisanProfile, setArtisanProfile] = useState<ArtisanListingProfile | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Voice revision modal state
  const [editingSection, setEditingSection] = useState<ListingSection | null>(null);
  const [isRevising, setIsRevising] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);

  // Facts changed warning state
  const [showFactsChangedPrompt, setShowFactsChangedPrompt] = useState(false);

  const mountedRef = useRef(true);

  // 1. Fetch product images and artisan profile on mount
  useEffect(() => {
    mountedRef.current = true;

    async function loadData() {
      try {
        const photoList = await listProductImages(productId);
        if (mountedRef.current) setImages(photoList);
      } catch (err) {
        console.warn('[PreviewStep] Failed to fetch product images:', err);
      }

      const aid = artisanId || draft.artisan_id;
      if (aid) {
        try {
          const profile = await getArtisanProfile(aid);
          if (mountedRef.current && profile) {
            setArtisanProfile({
              shop_name: profile.shop_name,
              city: profile.address || (typeof profile.location === 'string' ? profile.location : null),
              experience_years: profile.experience_years,
            });
          }
        } catch (err) {
          console.warn('[PreviewStep] Failed to fetch artisan profile:', err);
        }
      }
    }

    loadData();

    return () => {
      mountedRef.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [productId, artisanId, draft.artisan_id]);

  // Construct current listing object from draft fields
  const currentListing: ListingResult = useMemo(
    () => ({
      title_en: draft.title_en || '',
      title_hi: draft.title_hi || '',
      seo_caption_en: draft.seo_caption_en || '',
      seo_caption_hi: draft.seo_caption_hi || '',
      highlights_en: draft.highlights_en || [],
      highlights_hi: draft.highlights_hi || [],
      description_en: draft.description_en || '',
      description_hi: draft.description_hi || '',
      search_tags: draft.search_tags || [],
      summary_spoken: draft.summary_spoken || '',
    }),
    [draft]
  );

  const listingExists = isListingPresent(draft);

  // 2. Main AI Generation function
  const handleGenerateListing = useCallback(
    async (notesOverride?: { original?: string; en?: string }) => {
      setIsGenerating(true);
      setGenerationError(null);
      setShowFactsChangedPrompt(false);

      const effectiveDraft = {
        ...draft,
        ...(notesOverride
          ? {
              extra_notes_original: notesOverride.original,
              extra_notes_en: notesOverride.en,
            }
          : {}),
      };

      const result = await invokeGenerateListing({
        facts: effectiveDraft,
        artisanProfile,
        speakingLanguage: speakingLanguage || 'hi',
        mode: 'generate',
      });

      if (!mountedRef.current) return;

      if (result.success && result.listing) {
        const patch: Partial<ProductRecord> = {
          title_en: result.listing.title_en,
          title_hi: result.listing.title_hi,
          seo_caption_en: result.listing.seo_caption_en,
          seo_caption_hi: result.listing.seo_caption_hi,
          highlights_en: result.listing.highlights_en,
          highlights_hi: result.listing.highlights_hi,
          description_en: result.listing.description_en,
          description_hi: result.listing.description_hi,
          search_tags: result.listing.search_tags,
          summary_spoken: result.listing.summary_spoken,
          listing_generated_at: new Date().toISOString(),
          listing_facts_hash: computeFactsHash(effectiveDraft),
          // Keep approved false until user confirms
          listing_approved: false,
        };

        onDraftPatch(patch);
        await saveDraft(productId, patch as ProductUpdate);
      } else {
        console.error('[PreviewStep] Listing generation failed:', result.error);
        setGenerationError(
          "We couldn't write the listing. Try again or use a simple listing / विवरण नहीं बन सका। पुनः प्रयास करें या साधारण विवरण इस्तेमाल करें"
        );
      }

      setIsGenerating(false);
    },
    [draft, artisanProfile, speakingLanguage, onDraftPatch, productId]
  );

  // 3. Auto-generate on entering:
  // - If no listing exists, generate automatically
  // - If listing exists, is NOT approved, and facts hash differs: regenerate automatically (no prompt)
  // - If listing exists, IS approved, and facts hash differs: show prompt so artisan can choose
  useEffect(() => {
    if (!listingExists && !isGenerating && !generationError) {
      handleGenerateListing();
    } else if (listingExists && !draft.listing_approved && haveFactsChanged(draft) && !isGenerating) {
      handleGenerateListing();
    } else if (listingExists && draft.listing_approved && haveFactsChanged(draft)) {
      setShowFactsChangedPrompt(true);
    }
  }, [listingExists, draft.listing_approved]);

  // 4. Deterministic simple listing fallback
  const handleApplySimpleListing = useCallback(async () => {
    const simple = generateSimpleListing(draft, artisanProfile, speakingLanguage || 'hi');
    const hash = computeFactsHash(draft);

    const patch: Partial<ProductRecord> = {
      title_en: simple.title_en,
      title_hi: simple.title_hi,
      seo_caption_en: simple.seo_caption_en,
      seo_caption_hi: simple.seo_caption_hi,
      highlights_en: simple.highlights_en,
      highlights_hi: simple.highlights_hi,
      description_en: simple.description_en,
      description_hi: simple.description_hi,
      search_tags: simple.search_tags,
      summary_spoken: simple.summary_spoken,
      listing_generated_at: new Date().toISOString(),
      listing_facts_hash: hash,
      listing_approved: false,
    };

    onDraftPatch(patch);
    setGenerationError(null);
    await saveDraft(productId, patch as ProductUpdate);
  }, [draft, artisanProfile, speakingLanguage, onDraftPatch, productId]);

  // 5. Audio read-aloud ("Listen / सुनें")
  const handlePlayAudio = useCallback(
    (textToRead: string, lang = speakingLanguage || 'hi') => {
      if (isPlayingAudio) {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        setIsPlayingAudio(false);
        return;
      }

      setIsPlayingAudio(true);
      speakText(textToRead, lang);

      // Reset playing state after estimated duration
      const wordCount = textToRead.split(/\s+/).length;
      const durationMs = Math.max(3000, (wordCount / 2.5) * 1000);
      setTimeout(() => {
        if (mountedRef.current) setIsPlayingAudio(false);
      }, durationMs);
    },
    [isPlayingAudio, speakingLanguage]
  );

  // 6. Section revision via voice
  const handleVoiceRevisionConfirmed = useCallback(
    async (voiceVal: any) => {
      if (!editingSection) return;

      const instruction =
        typeof voiceVal === 'string'
          ? voiceVal
          : voiceVal?.original || voiceVal?.en || '';

      if (!instruction.trim()) {
        setEditingSection(null);
        return;
      }

      setIsRevising(true);
      setRevisionError(null);

      const result = await invokeGenerateListing({
        facts: draft,
        artisanProfile,
        speakingLanguage: speakingLanguage || 'hi',
        mode: 'revise',
        revise: {
          current_listing: currentListing,
          instruction: instruction.trim(),
          section: editingSection,
        },
      });

      if (!mountedRef.current) return;

      if (result.success && result.listing) {
        const patch: Partial<ProductRecord> = {
          title_en: result.listing.title_en,
          title_hi: result.listing.title_hi,
          seo_caption_en: result.listing.seo_caption_en,
          seo_caption_hi: result.listing.seo_caption_hi,
          highlights_en: result.listing.highlights_en,
          highlights_hi: result.listing.highlights_hi,
          description_en: result.listing.description_en,
          description_hi: result.listing.description_hi,
          search_tags: result.listing.search_tags,
          summary_spoken: result.listing.summary_spoken,
          listing_generated_at: new Date().toISOString(),
          listing_facts_hash: computeFactsHash(draft),
          listing_approved: false,
        };

        onDraftPatch(patch);
        await saveDraft(productId, patch as ProductUpdate);
        setEditingSection(null);
      } else {
        console.error('[PreviewStep] Section revision failed:', result.error);
        setRevisionError(
          "We couldn't update this section. Tap the mic and try again / यह भाग बदला नहीं जा सका। कृपया पुनः प्रयास करें।"
        );
      }

      setIsRevising(false);
    },
    [editingSection, draft, artisanProfile, speakingLanguage, currentListing, onDraftPatch, productId]
  );

  // 7. Extra notes ("Tell buyers anything else / और कुछ बताना है?")
  const handleExtraNotesConfirmed = useCallback(
    async (voiceVal: any) => {
      const original = typeof voiceVal === 'string' ? voiceVal : voiceVal?.original || '';
      const en = typeof voiceVal === 'string' ? voiceVal : voiceVal?.en || original;

      if (!original.trim()) return;

      const patch: Partial<ProductRecord> = {
        extra_notes_original: original,
        extra_notes_en: en,
        listing_approved: false,
      };

      onDraftPatch(patch);
      await saveDraft(productId, patch as ProductUpdate);

      // Re-generate listing incorporating new extra notes
      handleGenerateListing({ original, en });
    },
    [onDraftPatch, productId, handleGenerateListing]
  );

  // 8. Approval handler
  const handleApprove = useCallback(async () => {
    const patch: Partial<ProductRecord> = { listing_approved: true };
    onDraftPatch(patch);
    await approveDraftListing(productId);
  }, [onDraftPatch, productId]);

  // Voice specs
  const reviseFieldSpec: VoiceFieldSpec = useMemo(
    () => ({
      key: 'revise_instruction',
      type: 'text',
      question_en: `What should change in ${editingSection}?`,
      question_hi: `${editingSection} में क्या बदलना है?`,
    }),
    [editingSection]
  );

  const extraNotesFieldSpec: VoiceFieldSpec = useMemo(
    () => ({
      key: 'extra_notes',
      type: 'text',
      question_en: 'Tell buyers anything else about this item',
      question_hi: 'खरीदारों को इस चीज़ के बारे में और कुछ बताना है?',
    }),
    []
  );

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 font-sans" data-testid="preview-step">
      {/* Header Bar: Title, EN/HI Switch, Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-3 sm:p-4 shadow-lg">
        <div className="space-y-0.5">
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#EA580C]" />
            <span>Listing Preview / विवरण पूर्वावलोकन</span>
          </h2>
          <p className="text-[11px] text-slate-400">
            See how buyers view your creation before pricing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Toggle: [ हिंदी | English ] */}
          <div
            className="flex items-center rounded-xl bg-[#120B08] p-1 border border-[#2A1E17]"
            data-testid="language-toggle"
          >
            <button
              type="button"
              onClick={() => setDisplayLang('hi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                displayLang === 'hi'
                  ? 'bg-[#EA580C] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              data-testid="lang-toggle-hi"
            >
              हिंदी
            </button>
            <button
              type="button"
              onClick={() => setDisplayLang('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                displayLang === 'en'
                  ? 'bg-[#EA580C] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              data-testid="lang-toggle-en"
            >
              English
            </button>
          </div>

          {/* Rewrite All Button */}
          <button
            type="button"
            onClick={() => handleGenerateListing()}
            disabled={isGenerating}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Rewrite all / फिर से लिखें"
            data-testid="rewrite-all-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#EA580C] ${isGenerating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Rewrite all / फिर से लिखें</span>
          </button>
        </div>
      </div>

      {/* Facts Changed Warning Prompt (Never overwrite without artisan agreement) */}
      {showFactsChangedPrompt && (
        <div
          className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg"
          data-testid="facts-changed-prompt"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-200">
                Details changed. Rewrite the listing? / जानकारी बदली है। फिर से लिखें?
              </h3>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                You modified item facts after approving this listing. Would you like to generate an updated listing or keep your current approved listing?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 pl-8">
            <button
              type="button"
              onClick={() => handleGenerateListing()}
              disabled={isGenerating}
              className="px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow cursor-pointer"
              data-testid="facts-changed-rewrite-btn"
            >
              Rewrite listing / नया विवरण बनाएं
            </button>
            <button
              type="button"
              onClick={async () => {
                const updatedHash = computeFactsHash(draft);
                const hashPatch: Partial<ProductRecord> = { listing_facts_hash: updatedHash };
                onDraftPatch(hashPatch);
                await saveDraft(productId, hashPatch as ProductUpdate);
                setShowFactsChangedPrompt(false);
              }}
              className="px-4 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-slate-500 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              data-testid="facts-changed-keep-btn"
            >
              Keep current listing / मौजूदा विवरण रखें
            </button>
          </div>
        </div>
      )}

      {/* Generating Spinner Overlay / Placeholder */}
      {isGenerating && (
        <div
          className="py-16 px-4 bg-[#1A120E] border border-[#2A1E17] rounded-3xl flex flex-col items-center justify-center text-center space-y-4 shadow-xl"
          data-testid="listing-generating-spinner"
        >
          <div className="w-12 h-12 border-3 border-[#EA580C] border-t-transparent rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-white">
              Writing your bilingual listing... / विवरण तैयार किया जा रहा है...
            </p>
            <p className="text-xs text-slate-400">
              Applying professional SEO highlights without fabricating claims.
            </p>
          </div>
        </div>
      )}

      {/* Error Fallback Banner */}
      {!isGenerating && generationError && (
        <div
          className="bg-red-950/40 border border-red-500/50 rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg"
          data-testid="generation-error-card"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-red-200">
                Could not generate listing / विवरण तैयार नहीं हो सका
              </h3>
              <p className="text-xs text-red-300/80 leading-relaxed">
                {generationError}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 pl-8">
            <button
              type="button"
              onClick={() => handleGenerateListing()}
              className="px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow cursor-pointer"
              data-testid="error-retry-btn"
            >
              Try again / पुनः प्रयास करें
            </button>
            <button
              type="button"
              onClick={handleApplySimpleListing}
              className="px-4 py-2 rounded-xl bg-[#120B08] border border-amber-600/60 hover:border-amber-500 text-amber-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              data-testid="use-simple-listing-btn"
            >
              Use a simple listing / साधारण विवरण इस्तेमाल करें
            </button>
          </div>
        </div>
      )}

      {/* 3. Audio Read-Aloud Toolbar ("Listen / सुनें") */}
      {!isGenerating && listingExists && (
        <div
          className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-md"
          data-testid="listen-toolbar"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                handlePlayAudio(
                  draft.summary_spoken ||
                    (displayLang === 'hi' ? draft.description_hi || '' : draft.description_en || '')
                )
              }
              className={`min-h-[48px] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow cursor-pointer ${
                isPlayingAudio
                  ? 'bg-amber-600 text-white animate-pulse'
                  : 'bg-[#EA580C] hover:bg-[#F97316] text-white'
              }`}
              data-testid="listen-summary-btn"
            >
              {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isPlayingAudio ? 'Stop / रोकें' : 'Listen / सुनें'}</span>
            </button>

            <p className="text-xs text-slate-300">
              {draft.summary_spoken
                ? 'Plays brief audio summary in your spoken language.'
                : 'Listen to the listing description.'}
            </p>
          </div>

          {/* Secondary Full Hindi Description Reader */}
          {draft.description_hi && (
            <button
              type="button"
              onClick={() => handlePlayAudio(draft.description_hi || '', 'hi')}
              className="px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-400 hover:text-white text-xs font-medium transition-all active:scale-95 cursor-pointer"
              data-testid="listen-hindi-full-btn"
            >
              Hear full Hindi / पूरा विवरण सुनें
            </button>
          )}
        </div>
      )}

      {/* 4. The Buyer Listing Card (Reusable component) */}
      {!isGenerating && listingExists && (
        <ListingPreviewCard
          images={images}
          title={displayLang === 'hi' ? draft.title_hi || '' : draft.title_en || ''}
          caption={displayLang === 'hi' ? draft.seo_caption_hi || '' : draft.seo_caption_en || ''}
          highlights={displayLang === 'hi' ? draft.highlights_hi || [] : draft.highlights_en || []}
          description={displayLang === 'hi' ? draft.description_hi || '' : draft.description_en || ''}
          searchTags={draft.search_tags || []}
          language={displayLang}
          shopName={artisanProfile?.shop_name}
          category={draft.category}
          editable={true}
          onEditSection={(sec) => {
            setEditingSection(sec);
            setRevisionError(null);
          }}
        />
      )}

      {/* 5. "Tell buyers anything else / और कुछ बताना है?" Section */}
      {!isGenerating && listingExists && (
        <div
          className="bg-[#1A120E] border border-[#2A1E17] rounded-3xl p-5 sm:p-6 space-y-3.5 shadow-xl"
          data-testid="extra-notes-card"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EA580C]/20 border border-[#EA580C]/40 flex items-center justify-center text-[#EA580C]">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Tell buyers anything else / और कुछ बताना है?
              </h3>
              <p className="text-xs text-slate-400">
                The mic after the AI bullets — share personal artisan touches or craft care.
              </p>
            </div>
          </div>

          {draft.extra_notes_original && (
            <div className="p-3 rounded-xl bg-[#120B08] border border-[#2A1E17] text-xs text-slate-300 italic">
              "{draft.extra_notes_original}"
            </div>
          )}

          <div className="flex items-center justify-end">
            <VoiceInputButton
              field={extraNotesFieldSpec}
              speakingLanguage={speakingLanguage || 'hi'}
              onValueConfirmed={handleExtraNotesConfirmed}
              maxDurationSeconds={90}
            />
          </div>
        </div>
      )}

      {/* 6. Section Revision Modal / Sheet */}
      {editingSection && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="voice-edit-modal"
        >
          <div className="w-full max-w-md bg-[#1A120E] border border-[#2A1E17] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#2A1E17] pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Mic className="w-4 h-4 text-[#EA580C]" />
                  <span>Edit {editingSection} / अनुभाग बदलें</span>
                </h3>
                <p className="text-xs text-slate-400">
                  What should change? / क्या बदलना है?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="w-8 h-8 rounded-lg bg-[#120B08] border border-[#2A1E17] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isRevising ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
                <div className="w-8 h-8 border-2 border-[#EA580C] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-300 font-medium">
                  Applying revision with strict fact validation...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tap the microphone and describe what you want updated in the {editingSection}.
                </p>

                {revisionError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/50 text-xs text-red-300">
                    {revisionError}
                  </div>
                )}

                <div className="flex justify-center pt-2">
                  <VoiceInputButton
                    field={reviseFieldSpec}
                    speakingLanguage={speakingLanguage || 'hi'}
                    onValueConfirmed={handleVoiceRevisionConfirmed}
                    maxDurationSeconds={60}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Bottom Approval Action Bar ("Looks good / ठीक है") */}
      {!isGenerating && listingExists && (
        <div
          className="pt-4 border-t border-[#2A1E17] flex flex-col sm:flex-row items-center justify-between gap-4"
          data-testid="preview-approval-bar"
        >
          <div className="space-y-0.5 text-center sm:text-left">
            <p className="text-xs font-semibold text-white">
              {draft.listing_approved
                ? 'Listing is approved and ready! / विवरण स्वीकृत है!'
                : 'Approve this listing to proceed / आगे बढ़ने के लिए विवरण स्वीकार करें'}
            </p>
            <p className="text-[11px] text-slate-400">
              You can make pricing decisions in the next step.
            </p>
          </div>

          <button
            type="button"
            onClick={handleApprove}
            className={`min-h-[52px] w-full sm:w-auto px-8 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl cursor-pointer ${
              draft.listing_approved
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                : 'bg-[#EA580C] hover:bg-[#F97316] text-white shadow-[#EA580C]/20 hover:shadow-[#EA580C]/30'
            }`}
            data-testid="looks-good-btn"
          >
            <CheckCircle className="w-5 h-5 text-white" />
            <span>{draft.listing_approved ? 'Approved / स्वीकृत ✓' : 'Looks good / ठीक है'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
