// src/components/voice/__tests__/VoiceInputButton.test.tsx
// Stage 6.2: Component test suite for VoiceInputButton.
//
// TEST SUITE ARCHITECTURE & BOUNDARY DECLARATIONS:
// - MOCKS:
//   1. MediaRecorder Web API & navigator.mediaDevices.getUserMedia:
//      Mocked at hardware boundary because physical microphones, audio drivers,
//      and hardware Opus/WebM codecs are unavailable in headless CI/Node.js/JSDOM.
//   2. window.SpeechSynthesis & SpeechSynthesisUtterance:
//      Mocked at browser platform boundary because audio output speakers and OS speech
//      engines are unavailable in headless CI environments.
//   3. supabase.functions.invoke('transcribe-voice'):
//      Mocked at network boundary to test client state transitions and avoid hitting
//      live paid cloud APIs during automated unit testing.
// - REAL LOGIC:
//   1. Real validation rules (validateVoiceResult),
//   2. Real dimension merging and partial prompt builder (mergeDimensions, getMissingDimensionsPrompt),
//   3. Real 16-bit PCM WAV encoding and sample math (encodeWav16BitMono, downsampleTo16kHz),
//   4. Real React component state transitions (idle -> listening -> understanding -> confirm -> done),
//   5. Real user click interactions and callback dispatches.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceInputButton } from '../VoiceInputButton';
import type { VoiceFieldSpec } from '../../../types/voice';
import * as voiceService from '../../../services/voiceTranscriptionService';

// Mock MockMediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string = 'audio/webm';
  ondataavailable: ((event: any) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: any, options?: any) {
    if (options?.mimeType) {
      this.mimeType = options.mimeType;
    }
  }

  start(_timeslice?: number) {
    this.state = 'recording';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['mock-audio-chunk'], { type: this.mimeType }),
      });
    }
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['mock-audio-final'], { type: this.mimeType }),
      });
    }
    if (this.onstop) {
      this.onstop();
    }
  }

  static isTypeSupported(_mime: string) {
    return true;
  }
}

describe('VoiceInputButton Component (Stage 6.2)', () => {
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalMediaDevices = navigator.mediaDevices;
  let mockStream: any;
  let mockUtterances: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUtterances = [];

    mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    };

    (globalThis as any).MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-audio');
    globalThis.URL.revokeObjectURL = vi.fn();

    // Mock SpeechSynthesis
    class MockUtterance {
      text: string;
      voice: any = null;
      lang: string = 'hi-IN';
      rate: number = 0.9;
      pitch: number = 1.0;
      constructor(text: string) {
        this.text = text;
        mockUtterances.push(this);
      }
    }
    (globalThis as any).SpeechSynthesisUtterance = MockUtterance;
    (globalThis as any).window.SpeechSynthesisUtterance = MockUtterance;

    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn().mockReturnValue([
          { lang: 'hi-IN', name: 'Hindi Voice' },
          { lang: 'mr-IN', name: 'Marathi Voice' },
          { lang: 'en-IN', name: 'English Voice' },
        ]),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    (globalThis as any).MediaRecorder = originalMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true,
      configurable: true,
    });
  });

  it('renders initial idle state with 56px mic button', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const field: VoiceFieldSpec = {
      key: 'product_name',
      type: 'text',
      question_en: 'What is the name of your craft product?',
    };

    await act(async () => {
      root.render(
        <VoiceInputButton
          field={field}
          onValueConfirmed={vi.fn()}
        />
      );
    });

    const micBtn = container.querySelector(
      '[data-testid="voice-input-mic-button"]'
    ) as HTMLButtonElement;
    expect(micBtn).not.toBeNull();
    expect(micBtn.className).toContain('min-w-[56px]');
    expect(micBtn.className).toContain('min-h-[56px]');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('transitions through listening -> understanding -> confirm modal on speech', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onValueConfirmedMock = vi.fn();
    const field: VoiceFieldSpec = {
      key: 'price',
      type: 'number',
      question_en: 'Price?',
    };

    // Mock transcribeForField service call
    vi.spyOn(voiceService, 'transcribeForField').mockResolvedValue({
      status: 'ok',
      transcript_original: 'दो हजार पांच सौ रुपये',
      value: 2500,
      value_display_en: '₹2,500',
      value_display_hi: '₹2,500',
      value_display_spoken: 'दो हजार पांच सौ रुपये',
      confidence: 0.95,
    });

    await act(async () => {
      root.render(
        <VoiceInputButton
          field={field}
          speakingLanguage="hi"
          onValueConfirmed={onValueConfirmedMock}
        />
      );
    });

    // 1. Click mic to start listening
    const micBtn = container.querySelector('[data-testid="voice-input-mic-button"]') as HTMLButtonElement;
    await act(async () => {
      micBtn.click();
    });

    expect(container.querySelector('[data-testid="voice-listening-indicator"]')).not.toBeNull();

    // 2. Click stop to finish recording
    const stopBtn = container.querySelector('[data-testid="voice-stop-button"]') as HTMLButtonElement;
    await act(async () => {
      stopBtn.click();
    });

    // Fast-forward delay for processing
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // 3. Confirm modal must now be displayed
    const confirmModal = document.body.querySelector('[data-testid="voice-confirm-modal"]');
    expect(confirmModal).not.toBeNull();
    expect(confirmModal?.textContent).toContain('दो हजार पांच सौ रुपये');
    expect(confirmModal?.textContent).toContain('We Understood / हमने यह समझा');

    // 4. Verification that TTS speak was called automatically
    expect(window.speechSynthesis.speak).toHaveBeenCalled();

    // 5. Test "Say again": must NOT confirm value
    const sayAgainBtn = document.body.querySelector(
      '[data-testid="voice-say-again-button"]'
    ) as HTMLButtonElement;
    expect(sayAgainBtn).not.toBeNull();

    await act(async () => {
      sayAgainBtn.click();
    });

    // Field must NOT have been called
    expect(onValueConfirmedMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('calls onValueConfirmed only when "Yes, correct / हाँ, सही है" is confirmed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onValueConfirmedMock = vi.fn();
    const field: VoiceFieldSpec = {
      key: 'technique',
      type: 'choice',
      question_en: 'Technique?',
      choices: [{ id: 'hand-carved', label_en: 'Hand-Carved' }],
    };

    vi.spyOn(voiceService, 'transcribeForField').mockResolvedValue({
      status: 'ok',
      transcript_original: 'हाथ से नक्काशी',
      value: 'hand-carved',
      value_display_en: 'Hand-Carved',
      value_display_hi: 'हस्त-नक्काशी',
      value_display_spoken: 'हस्त नक्काशी',
      confidence: 0.96,
    });

    await act(async () => {
      root.render(
        <VoiceInputButton
          field={field}
          speakingLanguage="hi"
          onValueConfirmed={onValueConfirmedMock}
        />
      );
    });

    // Start & Stop
    await act(async () => {
      (container.querySelector('[data-testid="voice-input-mic-button"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      (container.querySelector('[data-testid="voice-stop-button"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Confirm Modal is visible
    const yesBtn = document.body.querySelector(
      '[data-testid="voice-confirm-yes-button"]'
    ) as HTMLButtonElement;
    expect(yesBtn).not.toBeNull();

    await act(async () => {
      yesBtn.click();
    });

    // Successfully called with typed value!
    expect(onValueConfirmedMock).toHaveBeenCalledWith('hand-carved');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('handles partial dimension answers: does NOT show confirm step, prompts follow-up', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onValueConfirmedMock = vi.fn();
    const field: VoiceFieldSpec = {
      key: 'size',
      type: 'dimensions',
      question_en: 'Size?',
    };

    // Return partial dimension: only width was heard
    vi.spyOn(voiceService, 'transcribeForField').mockResolvedValue({
      status: 'ok',
      transcript_original: 'दो फीट चौड़ा',
      value: {
        length: null,
        width: 2,
        height: null,
        diameter: null,
        thickness: null,
        unit: 'ft',
        approximate: false,
      },
      value_display_en: 'Width: 2 ft',
      value_display_hi: 'चौड़ाई: 2 फीट',
      value_display_spoken: 'चौड़ाई 2 फीट',
      confidence: 0.9,
    });

    await act(async () => {
      root.render(
        <VoiceInputButton
          field={field}
          speakingLanguage="hi"
          onValueConfirmed={onValueConfirmedMock}
        />
      );
    });

    // Start & Stop
    await act(async () => {
      (container.querySelector('[data-testid="voice-input-mic-button"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      (container.querySelector('[data-testid="voice-stop-button"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // MUST NOT show the confirm modal
    expect(document.body.querySelector('[data-testid="voice-confirm-modal"]')).toBeNull();

    // MUST show the partial dimensions modal with follow-up
    const partialModal = document.body.querySelector('[data-testid="voice-partial-dimensions-modal"]');
    expect(partialModal).not.toBeNull();
    expect(partialModal?.textContent).toContain('More Dimensions Needed');
    expect(partialModal?.textContent).toContain('मैंने चौड़ाई 2 फीट सुनी। कृपया लंबाई और ऊंचाई बताइए।');

    // Confirm that TTS spoke the follow-up prompt
    expect(window.speechSynthesis.speak).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('handles unclear speech with bilingual retry modal and does not fill field', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onValueConfirmedMock = vi.fn();
    const field: VoiceFieldSpec = {
      key: 'product_name',
      type: 'text',
      question_en: 'Name?',
    };

    vi.spyOn(voiceService, 'transcribeForField').mockResolvedValue({
      status: 'unclear',
      transcript_original: '...',
      value: null,
      value_display_en: 'Not understood',
      value_display_hi: 'समझ नहीं आया',
      value_display_spoken: 'समझ नहीं आया',
      confidence: 0.1,
    });

    await act(async () => {
      root.render(
        <VoiceInputButton
          field={field}
          speakingLanguage="hi"
          onValueConfirmed={onValueConfirmedMock}
        />
      );
    });

    await act(async () => {
      (container.querySelector('[data-testid="voice-input-mic-button"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      (container.querySelector('[data-testid="voice-stop-button"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    const unclearModal = document.body.querySelector('[data-testid="voice-unclear-modal"]');
    expect(unclearModal).not.toBeNull();
    expect(unclearModal?.textContent).toContain('Could Not Understand');
    expect(unclearModal?.textContent).toContain('मैं समझ नहीं पाया, कृपया फिर से बोलें।');

    // Field must not be filled
    expect(onValueConfirmedMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('handles microphone permission denial gracefully with bilingual notice and no raw browser errors', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // Mock getUserMedia rejecting with NotAllowedError
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
      },
      writable: true,
      configurable: true,
    });

    const field: VoiceFieldSpec = {
      key: 'price',
      type: 'number',
      question_en: 'Price?',
    };

    await act(async () => {
      root.render(
        <VoiceInputButton
          field={field}
          onValueConfirmed={vi.fn()}
        />
      );
    });

    await act(async () => {
      (container.querySelector('[data-testid="voice-input-mic-button"]') as HTMLButtonElement).click();
    });

    const errorModal = document.body.querySelector('[data-testid="voice-error-modal"]');
    expect(errorModal).not.toBeNull();
    expect(errorModal?.textContent).toContain('Microphone Access Needed / माइक्रोफ़ोन अनुमति चाहिए');
    // Ensure no raw browser crash messages
    expect(errorModal?.textContent).not.toContain('DOMException');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
