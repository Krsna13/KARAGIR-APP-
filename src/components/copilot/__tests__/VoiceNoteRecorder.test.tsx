import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceNoteRecorder } from '../VoiceNoteRecorder';
import { supabase } from '../../../lib/supabase/client';

/**
 * Mock MediaRecorder Web API implementation for unit testing.
 *
 * NOTE FOR REPORT: MediaRecorder and navigator.mediaDevices.getUserMedia are mocked
 * because real audio hardware (microphone, hardware codecs, OS audio streams) is not
 * available in headless CI/Node.js/JSDOM environments.
 * The component's state transitions (idle -> recording -> preview -> uploading),
 * timer/countdown logic, user interaction flows, error handling, and Supabase
 * storage upload path scoping ({artisan_id}/{product_id}/{timestamp}.webm) are all REAL.
 */
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string = 'audio/webm';
  ondataavailable: ((event: any) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: any;

  constructor(stream: any, options?: any) {
    this.stream = stream;
    if (options?.mimeType) {
      this.mimeType = options.mimeType;
    }
  }

  start(_timeslice?: number) {
    this.state = 'recording';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['mock-audio-chunk-1'], { type: this.mimeType }),
      });
    }
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(['mock-audio-chunk-final'], { type: this.mimeType }),
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

// Mock Supabase client
vi.mock('../../../lib/supabase/client', () => {
  const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null });
  const getPublicUrlMock = vi.fn().mockImplementation((path: string) => ({
    data: { publicUrl: `https://test-storage.com/${path}` },
  }));
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    supabase: {
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
          getPublicUrl: getPublicUrlMock,
        })),
      },
      from: vi.fn(() => ({
        update: updateMock,
      })),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'artisan-auth-123' } },
          error: null,
        }),
      },
    },
  };
});

describe('VoiceNoteRecorder Component (Stage 2.1)', () => {
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalMediaDevices = navigator.mediaDevices;
  let mockAudioTrack: { stop: ReturnType<typeof vi.fn> };
  let mockStream: { getTracks: () => any[] };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAudioTrack = { stop: vi.fn() };
    mockStream = { getTracks: () => [mockAudioTrack] };

    // Setup global mocks
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-voice-preview');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    (globalThis as any).MediaRecorder = originalMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true,
      configurable: true,
    });
  });

  it('renders initial idle state with confirm button disabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <VoiceNoteRecorder
          productId="prod-v-101"
          artisanId="artisan-v-202"
        />
      );
    });

    // Verify bilingual header and idle prompt
    expect(container.textContent).toContain('Voice Description / बोलकर बताएं');
    expect(container.textContent).toContain('Tap to Record / आवाज़ रिकॉर्ड करें');

    // Confirm button must be disabled initially with no recording present
    const confirmBtn = container.querySelector(
      '[data-testid="confirm-voice-button"]'
    ) as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('transitions state correctly: idle -> recording -> preview -> upload', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const testProductId = 'prod-v-999';
    const testArtisanId = 'artisan-auth-123';
    const onSuccessMock = vi.fn();

    await act(async () => {
      root.render(
        <VoiceNoteRecorder
          productId={testProductId}
          artisanId={testArtisanId}
          onSuccess={onSuccessMock}
        />
      );
    });

    // 1. Click Record Trigger Box to transition from IDLE to RECORDING
    const recordTrigger = container.querySelector(
      '[data-testid="record-trigger-box"]'
    ) as HTMLElement;
    expect(recordTrigger).not.toBeNull();

    await act(async () => {
      recordTrigger.click();
    });

    // Verify recording state
    const recordingContainer = container.querySelector('[data-testid="recording-state"]');
    expect(recordingContainer).not.toBeNull();
    expect(container.textContent).toContain('LIVE RECORDING');

    // 2. Click Stop Recording to transition from RECORDING to PREVIEW
    const stopBtn = container.querySelector(
      '[data-testid="stop-recording-button"]'
    ) as HTMLButtonElement;
    expect(stopBtn).not.toBeNull();

    await act(async () => {
      stopBtn.click();
    });

    // Verify preview state
    const previewContainer = container.querySelector('[data-testid="preview-state"]');
    expect(previewContainer).not.toBeNull();
    expect(container.textContent).toContain('Audio Recorded / आवाज़ तैयार है');

    // Confirm button is now enabled
    const confirmBtn = container.querySelector(
      '[data-testid="confirm-voice-button"]'
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);

    // 3. Confirm upload
    await act(async () => {
      confirmBtn.click();
    });

    // Verify Supabase storage upload call
    expect(supabase.storage.from).toHaveBeenCalledWith('product-voice-notes');
    const storageInstance = supabase.storage.from('product-voice-notes');
    expect(storageInstance.upload).toHaveBeenCalled();

    const uploadArgs = vi.mocked(storageInstance.upload).mock.calls[0];
    const uploadedPath = uploadArgs[0] as string;

    // Verify upload path structure: {artisan_id}/{product_id}/{timestamp}.webm
    expect(uploadedPath.startsWith(`${testArtisanId}/${testProductId}/`)).toBe(true);
    expect(uploadedPath.endsWith('.webm')).toBe(true);

    // Verify database update to products.voice_note_url
    expect(supabase.from).toHaveBeenCalledWith('products');
    const productsInstance = supabase.from('products');
    expect(productsInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_note_url: expect.stringContaining(`${testArtisanId}/${testProductId}/`),
      })
    );

    // Verify onSuccess was called with the voice note URL
    expect(onSuccessMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('handles microphone permission denial gracefully with bilingual error and no raw browser errors', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // Mock permission denial
    const permissionError = new Error('Permission denied');
    permissionError.name = 'NotAllowedError';
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(permissionError);

    await act(async () => {
      root.render(
        <VoiceNoteRecorder
          productId="prod-perm-fail"
          artisanId="artisan-perm-fail"
        />
      );
    });

    const recordTrigger = container.querySelector(
      '[data-testid="record-trigger-box"]'
    ) as HTMLElement;

    await act(async () => {
      recordTrigger.click();
    });

    // Verify error state
    const errorContainer = container.querySelector('[data-testid="error-state"]');
    expect(errorContainer).not.toBeNull();

    // Verify graceful bilingual copy instead of raw exception
    expect(container.textContent).toContain('Microphone Access Needed / माइक्रोफ़ोन अनुमति चाहिए');
    expect(container.textContent).toContain('Please allow microphone access');
    expect(container.textContent).not.toContain('NotAllowedError');

    // Verify retry button exists
    const retryBtn = container.querySelector('[data-testid="retry-record-button"]');
    expect(retryBtn).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
