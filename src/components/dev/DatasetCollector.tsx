import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Sun,
  Layers,
  Database,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { AIDevBackendToggle } from './AIDevBackendToggle';

export type DatasetCategory =
  | 'Woodwork'
  | 'Pottery'
  | 'Brasscraft'
  | 'Textile'
  | 'Furniture'
  | 'Metal';

export type LightingCondition = 'Good' | 'Poor' | 'Mixed';
export type BackgroundType = 'Clean' | 'Cluttered';

export interface DatasetSample {
  id: string;
  storage_path: string;
  category: DatasetCategory;
  lighting_condition: LightingCondition;
  background_type: BackgroundType;
  created_at: string;
  public_url?: string;
}

const CATEGORIES: DatasetCategory[] = [
  'Woodwork',
  'Pottery',
  'Brasscraft',
  'Textile',
  'Furniture',
  'Metal',
];

const LIGHTING_OPTIONS: LightingCondition[] = ['Good', 'Poor', 'Mixed'];
const BACKGROUND_OPTIONS: BackgroundType[] = ['Clean', 'Cluttered'];
const TARGET_PER_CATEGORY = 50;
const STORAGE_BUCKET = 'dataset-raw-photos';
const LOCAL_STORAGE_BACKUP_KEY = 'kaaragir_dev_dataset_samples_v1';

type CollectorStage = 'capture' | 'progress' | 'gallery';

interface DatasetCollectorProps {
  onBack?: () => void;
}

/**
 * Dev-only internal screen for collecting and labeling raw product photos.
 * Used for building and benchmarking AI Image Enhancer models (Stage 0.3).
 * Rendered only when import.meta.env.DEV is true.
 */
const DatasetCollectorInner: React.FC<DatasetCollectorProps> = ({ onBack }) => {
  const [activeStage, setActiveStage] = useState<CollectorStage>('capture');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<DatasetCategory>('Woodwork');
  const [lighting, setLighting] = useState<LightingCondition>('Good');
  const [background, setBackground] = useState<BackgroundType>('Clean');

  const [samples, setSamples] = useState<DatasetSample[]>([]);
  const [isLoadingSamples, setIsLoadingSamples] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load samples from Supabase (with fallback to local storage if running with mock credentials)
  const fetchSamples = useCallback(async () => {
    setIsLoadingSamples(true);
    try {
      const { data, error } = await supabase
        .from('dataset_samples')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (data && Array.isArray(data)) {
        const enriched: DatasetSample[] = data.map((item) => {
          const { data: pubData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(item.storage_path);
          return {
            ...item,
            category: item.category as DatasetCategory,
            lighting_condition: item.lighting_condition as LightingCondition,
            background_type: item.background_type as BackgroundType,
            public_url: pubData?.publicUrl,
          };
        });
        setSamples(enriched);
      } else {
        setSamples([]);
      }
    } catch {
      // Fallback to local dev cache when Supabase is in mock/offline mode
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
        if (cached) {
          setSamples(JSON.parse(cached));
        } else {
          setSamples([]);
        }
      } catch {
        setSamples([]);
      }
    } finally {
      setIsLoadingSamples(false);
    }
  }, []);

  useEffect(() => {
    fetchSamples();
  }, [fetchSamples]);

  // Clean up object URL previews
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatusMessage({
        type: 'error',
        text: 'Please select a valid image file (JPEG, PNG, WEBP).',
      });
      return;
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStatusMessage(null);
  };

  const handleClearSelected = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setStatusMessage({ type: 'error', text: 'Please select or capture a photo first.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const timestamp = Date.now();
    const cleanName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${category.toLowerCase()}/${timestamp}_${cleanName}`;

    try {
      // 1. Upload raw photo to Supabase Storage bucket 'dataset-raw-photos'
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) {
        console.warn('[DatasetCollector] Storage upload warning (falling back to mock preview if offline):', storageError.message);
      }

      // 2. Insert metadata row in 'dataset_samples' table
      const { data: dbData, error: dbError } = await supabase
        .from('dataset_samples')
        .insert({
          storage_path: storagePath,
          category,
          lighting_condition: lighting,
          background_type: background,
        })
        .select()
        .single();

      if (dbError) {
        throw dbError;
      }

      const { data: pubData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const newSample: DatasetSample = {
        id: dbData ? dbData.id : `sample-${timestamp}`,
        storage_path: storagePath,
        category,
        lighting_condition: lighting,
        background_type: background,
        created_at: new Date().toISOString(),
        public_url: pubData?.publicUrl || previewUrl || undefined,
      };

      setSamples((prev) => {
        const next = [newSample, ...prev];
        try {
          localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(next));
        } catch {
          // ignore storage quota error
        }
        return next;
      });

      setStatusMessage({
        type: 'success',
        text: `Sample saved for ${category}! (Lighting: ${lighting}, Background: ${background})`,
      });

      handleClearSelected();
    } catch (err: unknown) {
      // Offline fallback: save to local state and dev storage
      const fallbackSample: DatasetSample = {
        id: `local-${timestamp}`,
        storage_path: storagePath,
        category,
        lighting_condition: lighting,
        background_type: background,
        created_at: new Date().toISOString(),
        public_url: previewUrl || undefined,
      };

      setSamples((prev) => {
        const next = [fallbackSample, ...prev];
        try {
          localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(next));
        } catch {
          // ignore storage error
        }
        return next;
      });

      const errorMessage = err instanceof Error ? err.message : String(err);
      setStatusMessage({
        type: 'info',
        text: `Saved to local dev dataset cache (${errorMessage.includes('placeholder') ? 'Demo mode' : 'Offline'}).`,
      });
      handleClearSelected();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSample = async (sample: DatasetSample) => {
    if (!window.confirm(`Delete sample "${sample.storage_path}"?`)) {
      return;
    }

    try {
      await supabase.from('dataset_samples').delete().eq('id', sample.id);
      await supabase.storage.from(STORAGE_BUCKET).remove([sample.storage_path]);
    } catch {
      // ignore deletion error on demo client
    }

    setSamples((prev) => {
      const filtered = prev.filter((s) => s.id !== sample.id);
      try {
        localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(filtered));
      } catch {
        // ignore
      }
      return filtered;
    });
  };

  // Progress metrics
  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = samples.filter((s) => s.category === cat).length;
    return acc;
  }, {} as Record<DatasetCategory, number>);

  const totalCollected = samples.length;
  const totalTarget = TARGET_PER_CATEGORY * CATEGORIES.length;
  const overallPercentage = Math.min(100, Math.round((totalCollected / totalTarget) * 100));

  const filteredSamples = selectedFilterCategory === 'all'
    ? samples
    : samples.filter((s) => s.category === selectedFilterCategory);

  return (
    <div className="w-full min-h-full bg-[#0C0806] text-slate-100 pb-16">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-[#120B08]/95 backdrop-blur-md border-b border-[#2A1E17] px-3.5 py-2.5 space-y-2.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                type="button"
                className="p-1.5 rounded-lg bg-[#1F1510] text-slate-300 hover:text-white border border-[#2A1E17] active:scale-95 transition-all shrink-0"
                title="Return to marketplace"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <h1 className="text-sm font-bold text-white tracking-wide truncate">
                  AI Dataset Collector
                </h1>
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                  Stage 0.3 · DEV
                </span>
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-1">
                Collect & tag artisan photos for background removal & lighting models
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <AIDevBackendToggle />
            <button
              onClick={fetchSamples}
              type="button"
              className="p-1.5 rounded-lg bg-[#1F1510] text-slate-300 hover:text-white border border-[#2A1E17] hover:border-[#EA580C]/50 transition-all"
              title="Refresh Samples"
              aria-label="Refresh Samples"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSamples ? 'animate-spin text-[#EA580C]' : ''}`} />
            </button>
          </div>
        </div>

        {/* 3-Stage Pill Navigation Stepper */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveStage('capture')}
            className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center space-x-1 border ${
              activeStage === 'capture'
                ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-md glow-orange'
                : 'bg-[#1F140F] text-slate-400 border-[#2A1E17] hover:text-white'
            }`}
          >
            <Camera className="w-3 h-3" />
            <span>1. Capture</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStage('progress')}
            className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center space-x-1 border ${
              activeStage === 'progress'
                ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-md glow-orange'
                : 'bg-[#1F140F] text-slate-400 border-[#2A1E17] hover:text-white'
            }`}
          >
            <Database className="w-3 h-3" />
            <span>2. Progress</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStage('gallery')}
            className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center space-x-1 border ${
              activeStage === 'gallery'
                ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-md glow-orange'
                : 'bg-[#1F140F] text-slate-400 border-[#2A1E17] hover:text-white'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>3. Gallery ({totalCollected})</span>
          </button>
        </div>
      </header>

      <div className="w-full px-3 pt-3 space-y-4">
        {/* ========================================================================= */}
        {/* 📸 STAGE 1: CAPTURE & TAGGING FORM                                       */}
        {/* ========================================================================= */}
        <div className={activeStage === 'capture' ? 'space-y-4 animate-fadeIn' : 'hidden'}>
          <section className="p-4 rounded-2xl bg-[#170E0A] border border-[#2A1E17] shadow-lg space-y-3.5">
            <div className="flex items-center space-x-2 pb-2 border-b border-[#2A1E17]">
              <Sliders className="w-4 h-4 text-[#EA580C]" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Capture / Upload New Sample
              </h2>
            </div>

            <form onSubmit={handleUploadSample} className="space-y-3.5">
              {/* File Capture / Drag & Drop Dropzone */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Product Photo
                </label>

                {previewUrl ? (
                  <div className="relative rounded-xl border border-[#3A2A20] overflow-hidden bg-black/40 flex items-center justify-center max-h-56 group">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-56 w-auto object-contain mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-red-950/80 hover:bg-red-800 text-red-300 border border-red-500/40 transition-colors"
                      title="Remove image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#3A2A20] hover:border-[#EA580C] rounded-xl p-5 text-center cursor-pointer transition-colors bg-[#1A110B]/50 hover:bg-[#1F140F] group shadow-inner"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="flex justify-center space-x-3 text-slate-400 mb-2 group-hover:text-[#EA580C] transition-colors">
                      <Camera className="w-6 h-6" />
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-slate-200 mb-0.5">
                      Tap to snap photo or click to browse
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Supports JPEG, PNG, WEBP · Mobile camera capture enabled
                    </p>
                  </div>
                )}
              </div>

              {/* Tagging Controls: Category, Lighting, Background */}
              <div className="space-y-3 pt-1">
                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center space-x-1">
                    <Layers className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span>Category</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`px-2.5 py-2 rounded-xl text-xs font-medium border transition-all text-left truncate ${
                          category === cat
                            ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-sm font-semibold glow-orange'
                            : 'bg-[#1F140F] text-slate-300 border-[#2A1E17] hover:border-slate-500'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lighting Condition */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center space-x-1">
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Lighting Condition</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {LIGHTING_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setLighting(opt)}
                        className={`px-2 py-2 rounded-xl text-xs font-medium border transition-all text-center flex flex-col items-center justify-center gap-1 ${
                          lighting === opt
                            ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 shadow-sm font-semibold'
                            : 'bg-[#1F140F] text-slate-300 border-[#2A1E17] hover:border-slate-500'
                        }`}
                      >
                        <span>{opt} Lighting</span>
                        {lighting === opt && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Type */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center space-x-1">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Background Type</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {BACKGROUND_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setBackground(opt)}
                        className={`px-2.5 py-2 rounded-xl text-xs font-medium border transition-all text-center flex items-center justify-center space-x-1.5 ${
                          background === opt
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50 shadow-sm font-semibold'
                            : 'bg-[#1F140F] text-slate-300 border-[#2A1E17] hover:border-slate-500'
                        }`}
                      >
                        <span>{opt} Background</span>
                        {background === opt && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Alert */}
              {statusMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-500/30'
                      : statusMessage.type === 'error'
                      ? 'bg-red-950/60 text-red-200 border border-red-500/30'
                      : 'bg-sky-950/60 text-sky-200 border border-sky-500/30'
                  }`}
                >
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center space-x-2 ${
                    !selectedFile || isSubmitting
                      ? 'bg-[#2A1E17] text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-[#d14f0a] hover:to-amber-500 active:scale-98 cursor-pointer glow-orange'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Uploading to bucket & saving sample...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Save Tagged Sample ({category} · {lighting} · {background})</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Quick Stage Shortcuts */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveStage('progress')}
              className="p-2.5 rounded-xl bg-[#170E0A] hover:bg-[#20140E] border border-[#2A1E17] text-slate-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Goals ({totalCollected}/{totalTarget})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveStage('gallery')}
              className="p-2.5 rounded-xl bg-[#170E0A] hover:bg-[#20140E] border border-[#2A1E17] text-slate-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Gallery ({totalCollected})</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 📊 STAGE 2: PROGRESS TOWARD TARGETS                                      */}
        {/* ========================================================================= */}
        <div className={activeStage === 'progress' ? 'space-y-4 animate-fadeIn' : 'hidden'}>
          <section className="p-4 rounded-2xl bg-[#170E0A] border border-[#2A1E17] shadow-lg space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-[#2A1E17]">
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Database className="w-4 h-4 text-[#EA580C]" />
                  <span>Dataset Collection Progress</span>
                </h2>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Goal: {TARGET_PER_CATEGORY} photos per craft category ({totalTarget} total)
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-bold text-[#EA580C] font-mono">
                  {totalCollected}
                </span>
                <span className="text-xs text-slate-400 font-mono"> / {totalTarget}</span>
                <div className="text-[10px] text-slate-400 font-bold">{overallPercentage}% overall</div>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full bg-[#241711] h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#EA580C] to-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${overallPercentage}%` }}
              />
            </div>

            {/* Per-Category Progress Grid (2 Columns on mobile) */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {CATEGORIES.map((cat) => {
                const count = categoryCounts[cat] || 0;
                const pct = Math.min(100, Math.round((count / TARGET_PER_CATEGORY) * 100));
                const isTargetReached = count >= TARGET_PER_CATEGORY;

                return (
                  <div
                    key={cat}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isTargetReached
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                        : 'bg-[#1F140F] border-[#2A1E17] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-medium mb-1">
                      <span className="truncate font-semibold">{cat}</span>
                      <span className="font-mono text-[10px] font-bold">
                        {count}/{TARGET_PER_CATEGORY}
                      </span>
                    </div>
                    <div className="w-full bg-[#2D1C14] h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isTargetReached ? 'bg-emerald-400' : 'bg-[#EA580C]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Navigation Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveStage('capture')}
              className="py-3 px-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md glow-orange"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>← Back to Capture</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveStage('gallery')}
              className="py-3 px-3 rounded-xl bg-[#170E0A] hover:bg-[#20140E] border border-[#2A1E17] text-slate-300 text-xs font-bold flex items-center justify-center space-x-1.5"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>View Gallery ({totalCollected}) →</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 🖼️ STAGE 3: GALLERY VIEW                                                 */}
        {/* ========================================================================= */}
        <div className={activeStage === 'gallery' ? 'space-y-4 animate-fadeIn' : 'hidden'}>
          <section className="space-y-3.5">
            <div className="flex flex-col gap-2">
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <ImageIcon className="w-4 h-4 text-[#EA580C]" />
                  <span>Collected Samples Gallery ({filteredSamples.length})</span>
                </h2>
                <p className="text-[10px] text-slate-400">
                  Browse labeled samples in bucket <span className="font-mono text-slate-300">dataset-raw-photos</span>
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-xs custom-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedFilterCategory('all')}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap transition-all ${
                    selectedFilterCategory === 'all'
                      ? 'bg-[#EA580C] text-white border-[#EA580C]'
                      : 'bg-[#1F140F] text-slate-300 border-[#2A1E17] hover:border-slate-500'
                  }`}
                >
                  All ({totalCollected})
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedFilterCategory(cat)}
                    className={`px-2 py-1 rounded-lg border text-xs font-medium whitespace-nowrap transition-all ${
                      selectedFilterCategory === cat
                        ? 'bg-[#EA580C] text-white border-[#EA580C]'
                        : 'bg-[#1F140F] text-slate-300 border-[#2A1E17] hover:border-slate-500'
                    }`}
                  >
                    {cat} ({categoryCounts[cat] || 0})
                  </button>
                ))}
              </div>
            </div>

            {/* Empty State: exactly 0 samples */}
            {filteredSamples.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#170E0A] border border-[#2A1E17] text-center space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-[#241711] border border-[#3A2A20] flex items-center justify-center mx-auto text-slate-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-white">0 Samples in Gallery</h3>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    {selectedFilterCategory === 'all'
                      ? 'No product photos have been uploaded yet. Snap or upload an artisan craft photo in Stage 1 to begin building the training dataset.'
                      : `No photos tagged as '${selectedFilterCategory}' yet. Select this category in Stage 1 to upload your first sample.`}
                  </p>
                </div>
              </div>
            ) : (
              /* Gallery Cards Grid */
              <div className="grid grid-cols-1 gap-2.5">
                {filteredSamples.map((sample) => (
                  <div
                    key={sample.id}
                    className="rounded-xl bg-[#170E0A] border border-[#2A1E17] overflow-hidden shadow-md flex flex-col hover:border-[#3A2A20] transition-all group"
                  >
                    {/* Image container */}
                    <div className="relative aspect-video bg-black/60 overflow-hidden flex items-center justify-center">
                      {sample.public_url ? (
                        <img
                          src={sample.public_url}
                          alt={sample.category}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" fill="%231F1510"><rect width="300" height="200"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23EA580C" font-size="14" font-family="sans-serif">Dataset Sample</text></svg>';
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center text-slate-500 text-xs">
                          <ImageIcon className="w-7 h-7 mb-1" />
                          <span>Preview Unavailable</span>
                        </div>
                      )}
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/75 text-white border border-white/20">
                        {sample.category}
                      </span>
                      <button
                        onClick={() => handleDeleteSample(sample)}
                        type="button"
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-red-950/80 hover:bg-red-800 text-red-300 border border-red-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete sample"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Metadata and Tags */}
                    <div className="p-2.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          {/* Lighting Tag */}
                          <span
                            className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                              sample.lighting_condition === 'Good'
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                                : sample.lighting_condition === 'Poor'
                                ? 'bg-amber-950/70 text-amber-300 border-amber-500/30'
                                : 'bg-purple-950/70 text-purple-300 border-purple-500/30'
                            }`}
                          >
                            <Sun className="w-2.5 h-2.5" />
                            <span>{sample.lighting_condition} Light</span>
                          </span>

                          {/* Background Tag */}
                          <span
                            className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                              sample.background_type === 'Clean'
                                ? 'bg-sky-950/70 text-sky-300 border-sky-500/30'
                                : 'bg-orange-950/70 text-orange-300 border-orange-500/30'
                            }`}
                          >
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>{sample.background_type} BG</span>
                          </span>
                        </div>

                        <div className="font-mono text-[10px] text-slate-400 truncate" title={sample.storage_path}>
                          {sample.storage_path}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[#2A1E17] text-[10px] text-slate-400">
                        <span>
                          {new Date(sample.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {sample.public_url && (
                          <a
                            href={sample.public_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#EA580C] hover:underline flex items-center space-x-0.5"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Back to Capture Button */}
          <button
            type="button"
            onClick={() => setActiveStage('capture')}
            className="w-full py-3 px-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md glow-orange"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>← Back to Camera Capture</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Dev-only export: in production builds (import.meta.env.DEV is false),
 * this component renders nothing (null), guaranteeing strict invisibility in prod.
 */
export const DatasetCollector: React.FC<DatasetCollectorProps> = (props) => {
  if (!import.meta.env.DEV) {
    return null;
  }
  return <DatasetCollectorInner {...props} />;
};
