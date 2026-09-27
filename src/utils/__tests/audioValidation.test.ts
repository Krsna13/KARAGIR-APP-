import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateAudioQuality } from '../audioValidation';

describe('validateAudioQuality', () => {
  let mockDecodeAudioData: any;

  beforeEach(() => {
    mockDecodeAudioData = vi.fn();

    class MockAudioContext {
      decodeAudioData = mockDecodeAudioData;
    }

    vi.stubGlobal('window', {
      ...globalThis.window,
      AudioContext: MockAudioContext,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Helper to create a fake AudioBuffer
  const createMockAudioBuffer = (duration: number, rms: number) => {
    const length = 44100; // 1 second at 44.1kHz
    const channelData = new Float32Array(length);
    
    // Fill channelData with a constant value to simulate RMS
    // RMS of constant value X is X.
    for (let i = 0; i < length; i++) {
      channelData[i] = rms;
    }

    return {
      duration,
      numberOfChannels: 1,
      getChannelData: () => channelData,
    };
  };

  it('rejects an empty blob immediately', async () => {
    const emptyBlob = new Blob([], { type: 'audio/webm' });
    const result = await validateAudioQuality(emptyBlob);
    expect(result).toBe(false);
    expect(mockDecodeAudioData).not.toHaveBeenCalled();
  });

  it('rejects an audio buffer that is too short', async () => {
    const blob = new Blob(['dummy-data'], { type: 'audio/webm' });
    mockDecodeAudioData.mockResolvedValue(createMockAudioBuffer(0.5, 0.5)); // 0.5s duration, loud enough
    
    const result = await validateAudioQuality(blob, { minDurationSeconds: 1.2 });
    expect(result).toBe(false);
  });

  it('rejects a silent audio buffer (below RMS threshold)', async () => {
    const blob = new Blob(['dummy-data'], { type: 'audio/webm' });
    mockDecodeAudioData.mockResolvedValue(createMockAudioBuffer(2.0, 0.005)); // 2.0s duration, RMS 0.005
    
    const result = await validateAudioQuality(blob, { minDurationSeconds: 1.2, minRmsThreshold: 0.01 });
    expect(result).toBe(false);
  });

  it('accepts a valid audio buffer (long enough and loud enough)', async () => {
    const blob = new Blob(['dummy-data'], { type: 'audio/webm' });
    mockDecodeAudioData.mockResolvedValue(createMockAudioBuffer(1.5, 0.05)); // 1.5s duration, RMS 0.05
    
    const result = await validateAudioQuality(blob, { minDurationSeconds: 1.2, minRmsThreshold: 0.01 });
    expect(result).toBe(true);
  });

  it('returns true if decodeAudioData throws an error (e.g. corrupt audio or unsupported format on Android)', async () => {
    const blob = new Blob(['corrupt-data'], { type: 'audio/webm' });
    mockDecodeAudioData.mockRejectedValue(new Error('EncodingError'));
    
    const result = await validateAudioQuality(blob);
    expect(result).toBe(true);
  });
});
