/**
 * AI Model Configurations & Model Placeholders
 * 
 * Defines target model identifiers and runtime metadata for the Kaaragir AI abstraction layer.
 * Model weights, execution graphs, and quantization configurations will be integrated in future stages.
 */

export interface SegmentationModelConfig {
  name: string;
  version: string;
  description: string;
  targetResolution: [number, number];
}

export interface STTModelConfig {
  name: string;
  version: string;
  defaultLanguage: string;
  supportedLanguages: string[];
}

export interface SLMModelConfig {
  name: string;
  version: string;
  contextWindow: number;
  description: string;
}

// TODO (Stage 1.x): Configure specific segmentation model (e.g. BiRefNet / MobileSAM for on-device background removal)
export const SEGMENTATION_MODEL: SegmentationModelConfig = {
  name: 'birefnet-general-lite',
  version: '1.0.0',
  description: 'High-precision artisan product segmentation and background isolation',
  targetResolution: [1024, 1024],
};

// TODO (Stage 2.x): Configure on-device STT model variant (e.g. Whisper-Base int8 on NPU / fallback cloud Whisper API)
export const STT_MODEL: STTModelConfig = {
  name: 'whisper-base',
  version: '2024.1',
  defaultLanguage: 'hi', // Defaulting to Hindi/English bilingual artisan speech
  supportedLanguages: ['en', 'hi', 'mr'],
};

// TODO (Stage 3.x): Configure target SLM variant (e.g. Qwen2.5-3B-Instruct / Llama-3.2-3B via GenieX / Cloud fallback)
export const SLM_MODEL: SLMModelConfig = {
  name: 'qwen-2.5-3b-instruct',
  version: 'q4_k_m',
  contextWindow: 4096,
  description: 'Small Language Model for structured craft specification extraction and multilingual cataloging',
};
