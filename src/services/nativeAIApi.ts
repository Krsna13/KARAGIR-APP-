import { registerPlugin } from '@capacitor/core';
import type { CraftSpecification } from '../types/copilot';

export interface DeviceCapabilities {
  bridgeConnected: boolean;
  platform: string;
  architecture: string;
  deviceModel: string;
  androidVersion: string;
  runtime: string;
  npuAvailable: boolean;
  gpuAvailable: boolean;
}

export interface KaaragirAIPlugin {
  getDeviceCapabilities(): Promise<DeviceCapabilities>;
  analyzeImageAndText(options: { text: string | null, imageUri: string | null }): Promise<{ success: boolean, specification: CraftSpecification, debug_text_received: string | null, debug_image_received: string | null }>;
  transcribeAudio(options: { audioUri: string }): Promise<{ success: boolean, transcript: string, debug_audio_received: string }>;
}

export const KaaragirAINative = registerPlugin<KaaragirAIPlugin>('KaaragirAI');
