export interface MultimodalCraftRequest {
  text: string | null;
  voiceTranscript: string | null;
  referenceImage: string | null;
}

export interface CraftSpecification {
  product: string | null;
  category: string | null;
  material: string | null;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  seating_capacity: number | null;
  finish: string | null;
  style: string | null;
  features: string[];
  notes: string | null;
}
