import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProductRecord } from '../../../types/product';
import { 
  getOrCreateDraft, 
  saveDraft, 
  debouncedSaveDraft, 
  hasDraftContent, 
  deleteDraft 
} from '../../../services/draftService';
import * as storageService from '../../../services/storageService';
import { isIdentifyStepComplete } from './steps/identifyLogic';
import { describeAnswersFromDraft, isDescribeStepComplete } from './steps/describeLogic';
import { canProceedPreview } from './steps/listingLogic';

export interface UseAddItemWizardProps {
  artisanId: string;
  speakingLanguage?: string | null;
  initialDraft?: ProductRecord | null;
  onExit: (savedMessage?: string | null) => void;
  onLanguageSelected?: (lang: string) => void;
}

export const WIZARD_STEPS = [
  { id: 'photos', labelEn: 'Photos', labelHi: 'फोटो', labelMr: 'फोटो', stepIndex: 0 },
  { id: 'identify', labelEn: 'Identify', labelHi: 'पहचान', labelMr: 'ओळख', stepIndex: 1 },
  { id: 'describe', labelEn: 'Describe', labelHi: 'विवरण', labelMr: 'वर्णन', stepIndex: 2 },
  { id: 'preview', labelEn: 'Preview', labelHi: 'पूर्वावलोकन', labelMr: 'पूर्वावलोकन', stepIndex: 3 },
  { id: 'price', labelEn: 'Price', labelHi: 'कीमत', labelMr: 'किंमत', stepIndex: 4 },
  { id: 'publish', labelEn: 'Publish', labelHi: 'प्रकाशित', labelMr: 'प्रकाशित करा', stepIndex: 5 },
] as const;

export const useAddItemWizard = ({
  artisanId,
  speakingLanguage: initialLanguage,
  initialDraft,
  onExit,
  onLanguageSelected,
}: UseAddItemWizardProps) => {
  // If speaking_language is null/undefined/empty, start on 'language_picker'
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(initialLanguage || null);
  const [isLanguageStep, setIsLanguageStep] = useState<boolean>(!initialLanguage);

  useEffect(() => {
    if (initialLanguage && initialLanguage !== selectedLanguage) {
      setSelectedLanguage(initialLanguage);
      setIsLanguageStep(false);
    }
  }, [initialLanguage]);

  const [currentStep, setCurrentStep] = useState<number>(initialDraft?.wizard_step || 0);
  const [draftProduct, setDraftProduct] = useState<ProductRecord | null>(initialDraft || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [exitNotification, setExitNotification] = useState<string | null>(null);
  // Stage 6.2: photos saved on step 0 (reported by PhotosStep)
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState<number>(0);

  // Store draft in ref for unmount flush & silent cleanup checks
  const draftRef = useRef<ProductRecord | null>(draftProduct);
  draftRef.current = draftProduct;
  const uploadedPhotoCountRef = useRef<number>(uploadedPhotoCount);
  uploadedPhotoCountRef.current = uploadedPhotoCount;

  // Initialize or resume draft
  useEffect(() => {
    let isMounted = true;

    const initDraft = async () => {
      if (draftProduct) return;
      if (isLanguageStep) return; // Wait until language is chosen

      setIsLoading(true);
      try {
        const draft = await getOrCreateDraft(artisanId);
        if (isMounted && draft) {
          setDraftProduct(draft);
          setCurrentStep(draft.wizard_step || 0);
        }
      } catch (err) {
        console.error('Failed to initialize draft:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initDraft();

    return () => {
      isMounted = false;
    };
  }, [artisanId, draftProduct, isLanguageStep]);

  // Flush any pending debounced saves on unmount
  useEffect(() => {
    return () => {
      if (draftRef.current?.id) {
        debouncedSaveDraft.flush(draftRef.current.id);
      }
    };
  }, []);

  // Per-step canProceed hook point
  const canProceed = useCallback(
    (step: number): boolean => {
      // Step 0 (Photos): at least one photo uploaded. Enhancement may still be running.
      if (step === 0) return uploadedPhotoCount >= 1;
      // Step 1 (Identify): item_type, material, category, complexity, shape_profile confirmed.
      if (step === 1) return isIdentifyStepComplete(draftProduct);
      // Step 2 (Describe): dimensions, technique, labor_days, availability + matching count.
      if (step === 2) return isDescribeStepComplete(describeAnswersFromDraft(draftProduct), draftProduct?.shape_profile ?? null);
      // Step 3 (Preview): listing present and listing_approved is true.
      if (step === 3) return canProceedPreview(draftProduct);
      return true;
    },
    [uploadedPhotoCount, draftProduct]
  );

  /** Steps report what they saved so canProceed() and later steps see it. */
  const patchDraft = useCallback((patch: Partial<ProductRecord>) => {
    setDraftProduct((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // Save selected speaking language to profile
  const handleSelectLanguage = async (langCode: string) => {
    setSelectedLanguage(langCode);
    setIsLanguageStep(false);
    onLanguageSelected?.(langCode);

    try {
      await storageService.updateArtisanProfile(artisanId, {
        speaking_language: langCode,
      });
    } catch (err) {
      console.warn('Could not save language to profile:', err);
    }
  };

  // Step Navigation: Next
  const handleNext = async () => {
    if (currentStep >= WIZARD_STEPS.length - 1) return;
    if (!canProceed(currentStep)) return;

    const nextStep = currentStep + 1;

    // Flush any pending debounced field saves first
    if (draftProduct?.id) {
      await debouncedSaveDraft.flush(draftProduct.id);
      // Immediately persist step change
      await saveDraft(draftProduct.id, { wizard_step: nextStep });
      setDraftProduct((prev) => (prev ? { ...prev, wizard_step: nextStep } : null));
    }

    setCurrentStep(nextStep);
  };

  // Step Navigation: Back
  const handleBack = async () => {
    if (currentStep <= 0) {
      // Exit wizard
      await handleExit();
      return;
    }

    const prevStep = currentStep - 1;

    if (draftProduct?.id) {
      await debouncedSaveDraft.flush(draftProduct.id);
      await saveDraft(draftProduct.id, { wizard_step: prevStep });
      setDraftProduct((prev) => (prev ? { ...prev, wizard_step: prevStep } : null));
    }

    setCurrentStep(prevStep);
  };

  // Exit Wizard
  const handleExit = async () => {
    const activeDraft = draftRef.current;

    if (activeDraft?.id) {
      // Flush pending saves
      await debouncedSaveDraft.flush(activeDraft.id);

      // Check if draft has content. Photos count even though the local draft
      // object has not been refreshed with the cover fields synced onto products.
      if (!hasDraftContent(activeDraft) && uploadedPhotoCountRef.current === 0) {
        // Requirement 4: Delete silently without showing saved message
        await deleteDraft(activeDraft.id);
        onExit(null);
        return;
      }
    }

    // Has content: show bilingual saved notification
    const msg = 'Saved. You can continue later / सहेजा गया। बाद में जारी रखें';
    setExitNotification(msg);
    setTimeout(() => {
      onExit(msg);
    }, 400);
  };

  return {
    isLanguageStep,
    selectedLanguage,
    currentStep,
    draftProduct,
    isLoading,
    exitNotification,
    canProceed,
    uploadedPhotoCount,
    setUploadedPhotoCount,
    patchDraft,
    handleSelectLanguage,
    handleNext,
    handleBack,
    handleExit,
    setCurrentStep,
    setDraftProduct,
  };
};
