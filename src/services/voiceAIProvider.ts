import { Capacitor } from '@capacitor/core';
import { KaaragirAINative } from './nativeAIApi';

export interface VoiceAIProvider {
  transcribeAudio(audioUri: string): Promise<string>;
}

export class MockVoiceAIProvider implements VoiceAIProvider {
  async transcribeAudio(audioUri: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return "Mujhe chhe feet ka dining table chahiye, sagwan teak wood ka, chhe logon ke liye, carved legs aur brass inlay ke saath.";
  }
}

export class LocalWhisperVoiceAIProvider implements VoiceAIProvider {
  async transcribeAudio(audioUri: string): Promise<string> {
    try {
      const response = await KaaragirAINative.transcribeAudio({ audioUri });
      if (response.success) {
        return response.transcript;
      }
      throw new Error("Local Whisper failed to transcribe");
    } catch (e) {
      console.error("Whisper execution error", e);
      throw e;
    }
  }
}

let currentVoiceProvider: VoiceAIProvider = Capacitor.isNativePlatform() 
  ? new LocalWhisperVoiceAIProvider() 
  : new MockVoiceAIProvider();

export function getVoiceAIProvider(): VoiceAIProvider {
  return currentVoiceProvider;
}

export function setVoiceAIProvider(provider: VoiceAIProvider) {
  currentVoiceProvider = provider;
}
