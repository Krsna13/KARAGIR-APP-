import type { CraftSpecification } from './copilot';

export interface CraftHandoffPackage {
  version: "1.0";
  handoffId: string;
  createdAt: string;
  source: "mobile_copilot";
  customerId: string; // Or a session ID
  craftSpecification: CraftSpecification;
  referenceImage: {
    available: boolean;
    localUri: string | null;
  };
  voiceTranscript: string | null;
  artisanBrief: string | null;
  estimatedPrice: number | null;
}
