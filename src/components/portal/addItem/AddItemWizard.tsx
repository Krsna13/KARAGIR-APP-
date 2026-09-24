import React from 'react';
import { 
  Camera, 
  Sparkles, 
  FileText, 
  Eye, 
  IndianRupee, 
  Send, 
  Check, 
  ArrowLeft, 
  ArrowRight, 
  Volume2, 
  X,
  Clock
} from 'lucide-react';
import type { ProductRecord } from '../../../types/product';
import { useAddItemWizard, WIZARD_STEPS } from './useAddItemWizard';
import { SUPPORTED_LANGUAGES, speakLanguageName } from '../../../config/languages';
import { PhotosStep } from './steps/PhotosStep';
import { IdentifyStep } from './steps/IdentifyStep';
import { DescribeStep } from './steps/DescribeStep';
import { PreviewStep } from './steps/PreviewStep';

interface AddItemWizardProps {
  artisanId: string;
  speakingLanguage?: string | null;
  initialDraft?: ProductRecord | null;
  onExit: (savedMessage?: string | null) => void;
  onLanguageSelected?: (lang: string) => void;
}

const STEP_ICONS = [
  Camera,      // Step 0: Photos / फोटो
  Sparkles,    // Step 1: Identify / पहचान
  FileText,    // Step 2: Describe / विवरण
  Eye,         // Step 3: Preview / पूर्वावलोकन
  IndianRupee, // Step 4: Price / कीमत
  Send,        // Step 5: Publish / प्रकाशित
];

interface WizardTranslation {
  addItemTitle: string;
  exit: string;
  stepOf: (step: number) => string;
  comingSoon: string;
  back: string;
  next: string;
  publishDisabled: string;
  photosRequiredHint: string;
  identifyRequiredHint: string;
  describeRequiredHint: string;
  previewRequiredHint: string;
}

const WIZARD_TRANSLATIONS: Record<'hi' | 'mr' | 'en', WizardTranslation> = {
  mr: {
    addItemTitle: 'Add Item / नवीन वस्तू जोडा',
    exit: 'Exit / बाहेर पडा',
    stepOf: (step: number) => `टप्पा ${step} / 6`,
    comingSoon: 'This step is coming soon / हा टप्पा लवकरच येत आहे',
    back: 'Back / मागे',
    next: 'Next / पुढे',
    publishDisabled: 'Publish / प्रकाशित करा (Disabled)',
    photosRequiredHint: 'Add at least 1 photo / किमान 1 फोटो जोडा',
    identifyRequiredHint: 'Answer all 5 questions / सर्व 5 प्रश्नांची उत्तरे द्या',
    describeRequiredHint: 'Finish size, technique, time & availability / आकार, तंत्र, वेळ आणि उपलब्धता पूर्ण करा',
    previewRequiredHint: 'Approve your listing to proceed / पुढे जाण्यासाठी सूची मंजूर करा',
  },
  hi: {
    addItemTitle: 'Add Item / नया आइटम जोड़ें',
    exit: 'Exit / बाहर निकलें',
    stepOf: (step: number) => `Step ${step} of 6`,
    comingSoon: 'This step is coming soon / यह चरण जल्द आ रहा है',
    back: 'Back / पीछे',
    next: 'Next / आगे',
    publishDisabled: 'Publish / प्रकाशित (Disabled)',
    photosRequiredHint: 'Add at least 1 photo / कम से कम 1 फोटो जोड़ें',
    identifyRequiredHint: 'Answer all 5 questions / सभी 5 सवालों के जवाब दें',
    describeRequiredHint: 'Finish size, technique, time & availability / आकार, तकनीक, समय और उपलब्धता पूरी करें',
    previewRequiredHint: 'Approve your listing to proceed / आगे बढ़ने के लिए विवरण स्वीकार करें',
  },
  en: {
    addItemTitle: 'Add Item',
    exit: 'Exit',
    stepOf: (step: number) => `Step ${step} of 6`,
    comingSoon: 'This step is coming soon',
    back: 'Back',
    next: 'Next',
    publishDisabled: 'Publish (Disabled)',
    photosRequiredHint: 'Add at least 1 photo',
    identifyRequiredHint: 'Answer all 5 questions',
    describeRequiredHint: 'Finish size, technique, time & availability',
    previewRequiredHint: 'Approve your listing to proceed',
  },
};

const getStepLabel = (step: (typeof WIZARD_STEPS)[number], lang?: string | null) => {
  if (lang === 'mr') return step.labelMr;
  if (lang === 'en') return step.labelEn;
  return step.labelHi;
};

export const AddItemWizard: React.FC<AddItemWizardProps> = ({
  artisanId,
  speakingLanguage,
  initialDraft,
  onExit,
  onLanguageSelected,
}) => {
  const {
    isLanguageStep,
    currentStep,
    draftProduct,
    isLoading,
    exitNotification,
    canProceed,
    setUploadedPhotoCount,
    patchDraft,
    selectedLanguage,
    handleSelectLanguage,
    handleNext,
    handleBack,
    handleExit,
  } = useAddItemWizard({
    artisanId,
    speakingLanguage,
    initialDraft,
    onExit,
    onLanguageSelected,
  });

  const langKey = selectedLanguage === 'mr' ? 'mr' : selectedLanguage === 'en' ? 'en' : 'hi';
  const t = WIZARD_TRANSLATIONS[langKey];

  // 1. Language Picker Screen (Shown if artisan speaking_language is null/not set)
  if (isLanguageStep) {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#1A120E] border border-[#2A1E17] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-6 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2A1E17] pb-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] animate-pulse" />
              <span>Choose Your Language / भाषा चुनें / भाषा निवडा</span>
            </h2>
            <p className="text-xs text-slate-400">
              Select your spoken language for audio guidance & assistant.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExit}
            className="w-12 h-12 rounded-xl bg-[#120B08] border border-[#2A1E17] text-slate-400 hover:text-white flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
            aria-label="Exit wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Large Language Cards */}
        <div className="space-y-3.5">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <div
              key={lang.code}
              className="group relative bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] rounded-2xl p-4 transition-all duration-200 flex items-center justify-between shadow-md hover:shadow-[#EA580C]/10 active:scale-[0.99] cursor-pointer min-h-[64px]"
              onClick={() => handleSelectLanguage(lang.code)}
            >
              <div className="flex items-center space-x-4">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shadow-inner"
                  style={{ backgroundColor: `${lang.accentColor}20`, color: lang.accentColor, border: `1px solid ${lang.accentColor}40` }}
                >
                  {lang.nativeName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white tracking-wide">
                    {lang.nativeName}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {lang.name}
                  </p>
                </div>
              </div>

              {/* TTS Audio Button (Min 48x48px touch target) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  speakLanguageName(lang.code, lang.nativeName);
                }}
                className="w-12 h-12 rounded-xl bg-[#1A120E] border border-[#2A1E17] hover:border-[#EA580C] text-[#EA580C] flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow"
                aria-label={`Listen to ${lang.name}`}
                title={`Listen to ${lang.name}`}
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 text-center pt-2">
          You can change this anytime in your Workshop Profile settings.
        </p>
      </div>
    );
  }

  // 2. Wizard Shell with Progress Bar & Step Content
  const CurrentIcon = STEP_ICONS[currentStep] || Camera;
  const currentStepConfig = WIZARD_STEPS[currentStep] || WIZARD_STEPS[0];
  const isPublishStep = currentStep === 5;
  const canGoNext = canProceed(currentStep);

  return (
    <div className="w-full max-w-2xl mx-auto bg-[#1A120E] border border-[#2A1E17] rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6 font-sans">
      
      {/* Top Bar: Title & Exit Button */}
      <div className="flex items-center justify-between border-b border-[#2A1E17] pb-3.5">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#120B08] border border-[#EA580C]/80 flex items-center justify-center text-[#EA580C] shadow-inner">
            <CurrentIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm sm:text-base font-bold text-white">
                {t.addItemTitle}
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EA580C]/15 text-[#EA580C] border border-[#EA580C]/30 font-bold">
                {t.stepOf(currentStep + 1)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {currentStepConfig.labelEn} / {getStepLabel(currentStepConfig, selectedLanguage)}
            </p>
          </div>
        </div>

        {/* Exit Button (Min 48x48px touch target) */}
        <button
          type="button"
          onClick={handleExit}
          className="min-h-[48px] px-3.5 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
          aria-label="Exit wizard"
        >
          <X className="w-4 h-4 text-slate-400" />
          <span className="hidden sm:inline">{t.exit}</span>
        </button>
      </div>

      {/* Exit Notification Toast / Banner */}
      {exitNotification && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{exitNotification}</span>
        </div>
      )}

      {/* 6-Step Icon Progress Bar */}
      <div className="bg-[#120B08] border border-[#2A1E17] rounded-2xl p-2.5 sm:p-3 shadow-inner">
        <div className="grid grid-cols-6 gap-1 sm:gap-2">
          {WIZARD_STEPS.map((step, idx) => {
            const IconComponent = STEP_ICONS[idx];
            const isCurrent = idx === currentStep;
            const isCompleted = idx < currentStep;

            return (
              <div
                key={step.id}
                className="flex flex-col items-center text-center space-y-1"
              >
                {/* Step Circle (Min 48x48px touchable footprint) */}
                <div
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all ${
                    isCurrent
                      ? 'bg-[#EA580C] text-white shadow-lg ring-2 ring-[#EA580C]/40 ring-offset-2 ring-offset-[#120B08] scale-105'
                      : isCompleted
                      ? 'bg-emerald-950/80 border border-emerald-600/60 text-emerald-400'
                      : 'bg-[#1A120E] border border-[#2A1E17] text-slate-500'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  ) : (
                    <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </div>

                {/* Localized Step Label */}
                <div className="space-y-0.5 max-w-[56px] sm:max-w-none">
                  <p
                    className={`text-[9px] sm:text-[10px] font-bold leading-tight truncate ${
                      isCurrent
                        ? 'text-white'
                        : isCompleted
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.labelEn}
                  </p>
                  <p className="text-[8px] sm:text-[9px] text-slate-500 leading-none truncate">
                    {getStepLabel(step, selectedLanguage)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Loading state while initializing draft */}
      {(currentStep === 0 || currentStep === 1) && (!draftProduct || isLoading) ? (
        <div className="py-16 px-4 sm:px-8 flex flex-col items-center justify-center border-2 border-dashed border-[#2A1E17] bg-[#120B08]/70 rounded-2xl text-center space-y-3 shadow-inner min-h-[220px]" data-testid="wizard-loading-spinner">
          <div className="w-10 h-10 border-2 border-[#EA580C] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">
            {selectedLanguage === 'mr'
              ? 'कृपया थांबा, तयारी करत आहोत...'
              : selectedLanguage === 'en'
              ? 'Please wait, setting up draft...'
              : 'कृपया प्रतीक्षा करें, तैयारी हो रही है...'}
          </p>
        </div>
      ) : currentStep === 0 && draftProduct ? (
        <PhotosStep
          productId={draftProduct.id}
          artisanId={artisanId}
          speakingLanguage={selectedLanguage}
          onUploadedCountChange={setUploadedPhotoCount}
        />
      ) : currentStep === 1 && draftProduct ? (
        <IdentifyStep
          productId={draftProduct.id}
          draft={draftProduct}
          speakingLanguage={selectedLanguage}
          onDraftPatch={patchDraft}
        />
      ) : currentStep === 2 && draftProduct ? (
        <DescribeStep
          productId={draftProduct.id}
          draft={draftProduct}
          speakingLanguage={selectedLanguage}
          onDraftPatch={patchDraft}
        />
      ) : currentStep === 3 && draftProduct ? (
        <PreviewStep
          productId={draftProduct.id}
          draft={draftProduct}
          speakingLanguage={selectedLanguage}
          onDraftPatch={patchDraft}
          artisanId={artisanId}
        />
      ) : (
      /* Step Placeholder Content Panel (Stage 6.1 Skeleton for Steps 2-5) */
      <div className="py-10 px-4 sm:px-8 flex flex-col items-center justify-center border-2 border-dashed border-[#2A1E17] bg-[#120B08]/70 rounded-2xl text-center space-y-3 shadow-inner min-h-[220px]">
        <div className="w-14 h-14 rounded-2xl bg-[#1A120E] border border-[#EA580C]/40 flex items-center justify-center text-[#EA580C] shadow-md">
          <CurrentIcon className="w-7 h-7" />
        </div>

        <div className="space-y-1.5 max-w-md">
          <h3 className="text-sm sm:text-base font-bold text-white">
            {currentStepConfig.labelEn} / {getStepLabel(currentStepConfig, selectedLanguage)}
          </h3>
          <p className="text-xs text-[#EAB308] font-semibold">
            {t.comingSoon}
          </p>
          <p className="text-[11px] text-slate-400">
            {currentStep === 3 && (selectedLanguage === 'mr' ? 'कारागीर पूर्वावलोकन आणि 3D कार्ड लवकरच जोडले जाईल.' : 'Artisan preview and 3D preview card will be added in Stage 6.6.')}
            {currentStep === 4 && (selectedLanguage === 'mr' ? 'AI किंमत सहाय्यक लवकरच जोडले जाईल.' : 'AI dynamic pricing assistant will be wired in Stage 6.7.')}
            {currentStep === 5 && (selectedLanguage === 'mr' ? 'स्टोअरफ्रंट प्रकाशन लवकरच सक्षम केले जाईल.' : 'Storefront publishing and verification will be enabled in Stage 6.9.')}
          </p>
        </div>

        {draftProduct && (
          <div className="pt-2 text-[10px] text-slate-500 font-mono flex items-center space-x-1.5">
            <Clock className="w-3 h-3 text-[#EA580C]" />
            <span>Draft ID: {draftProduct.id.substring(0, 8)}...</span>
            <span>• Step: {draftProduct.wizard_step ?? 0}</span>
          </div>
        )}
      </div>
      )}

      {/* Bottom Action Buttons (Min 48px Touch Targets) */}
      <div className="flex items-center justify-between pt-2 border-t border-[#2A1E17]">
        {/* Back / Exit Button */}
        <button
          type="button"
          onClick={handleBack}
          className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-[#EA580C] text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center space-x-2 active:scale-95 cursor-pointer shadow"
        >
          <ArrowLeft className="w-4 h-4 text-[#EA580C]" />
          <span>
            {currentStep === 0 ? t.exit : t.back}
          </span>
        </button>

        {/* Next or Publish Button */}
        {isPublishStep ? (
          <button
            type="button"
            disabled={true}
            className="min-h-[48px] px-6 py-2.5 rounded-xl bg-slate-800 text-slate-500 border border-slate-700 text-xs font-bold flex items-center space-x-2 opacity-60 cursor-not-allowed shadow"
            title="Publishing will be enabled in Stage 6.9"
          >
            <Send className="w-4 h-4" />
            <span>{t.publishDisabled}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all flex items-center space-x-2 active:scale-95 cursor-pointer shadow-lg hover:shadow-[#EA580C]/20 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
            data-testid="wizard-next-button"
          >
            <span>{t.next}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {currentStep === 0 && !canGoNext && (
        <p className="text-[11px] text-slate-400 text-center -mt-3" data-testid="photos-required-hint">
          <Camera className="inline w-3.5 h-3.5 text-[#EA580C] mr-1" />
          {t.photosRequiredHint}
        </p>
      )}

      {currentStep === 1 && !canGoNext && (
        <p className="text-[11px] text-slate-400 text-center -mt-3" data-testid="identify-required-hint">
          <Sparkles className="inline w-3.5 h-3.5 text-[#EA580C] mr-1" />
          {t.identifyRequiredHint}
        </p>
      )}

      {currentStep === 2 && !canGoNext && (
        <p className="text-[11px] text-slate-400 text-center -mt-3" data-testid="describe-required-hint">
          <FileText className="inline w-3.5 h-3.5 text-[#EA580C] mr-1" />
          {t.describeRequiredHint}
        </p>
      )}

      {currentStep === 3 && !canGoNext && (
        <p className="text-[11px] text-slate-400 text-center -mt-3" data-testid="preview-required-hint">
          <Eye className="inline w-3.5 h-3.5 text-[#EA580C] mr-1" />
          {t.previewRequiredHint}
        </p>
      )}

    </div>
  );
};
