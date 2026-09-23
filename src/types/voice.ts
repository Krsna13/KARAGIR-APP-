// src/types/voice.ts
// Stage 6.2: Multimodal Voice Engine Types

export type VoiceFieldType = 'text' | 'long_text' | 'number' | 'dimensions' | 'choice';

export interface VoiceFieldChoice {
  id: string;
  label_en: string;
  label_hi?: string;
}

/** Stage 6.5: which dimensions a 'dimensions' field asks for (shape-aware). */
export type DimensionKey = 'length' | 'width' | 'height' | 'diameter' | 'thickness';

export interface VoiceFieldSpec {
  key: string;
  question_en: string;
  question_hi?: string;
  type: VoiceFieldType;
  choices?: VoiceFieldChoice[];
  unit_hint?: string;
  /** For type 'dimensions': which keys to ask for/accept. Defaults to length/width/height if omitted. */
  dimension_keys?: DimensionKey[];
}

export interface VoiceDimensionsValue {
  length: number | null;
  width: number | null;
  height: number | null;
  /** Stage 6.5: round shapes (pots, vases). */
  diameter: number | null;
  /** Stage 6.5: optional for flat shapes (textiles, wall panels). */
  thickness: number | null;
  unit: 'ft' | 'in' | 'cm' | 'm' | null;
  /** Stage 6.5: true when the artisan hedged the answer (e.g. "lagbhag 6 foot" / "around 6 feet"). */
  approximate: boolean;
}

export interface VoiceTextValue {
  original: string;
  en: string;
}

export type VoiceTranscriptionStatus = 'ok' | 'unclear' | 'off_topic';

export interface VoiceTranscriptionResult {
  status: VoiceTranscriptionStatus;
  transcript_original: string;
  value: VoiceTextValue | number | VoiceDimensionsValue | string | null;
  value_display_en: string;
  value_display_hi: string;
  value_display_spoken: string;
  confidence: number;
}
