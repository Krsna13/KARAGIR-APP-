// src/utils/__tests__/audioConverter.test.ts
// Stage 6.2: Real-logic test suite for audio downsampling and 16-bit PCM WAV encoding.
//
// TEST SUITE ARCHITECTURE & BOUNDARY DECLARATIONS:
// - REAL LOGIC: downsampleTo16kHz and encodeWav16BitMono execute 100% real mathematical
//   linear interpolation and binary RIFF/WAVE header and sample byte packing.
// - MOCKS: NONE. No Web Audio API mocks are required for these pure PCM logic tests.

import { describe, it, expect } from 'vitest';
import {
  downsampleTo16kHz,
  encodeWav16BitMono,
} from '../audioConverter';

describe('AudioConverter - Real PCM WAV Logic (Stage 6.2)', () => {
  it('downsamples audio buffer to 16 kHz using linear interpolation', () => {
    // 48 kHz buffer with 480 samples = 10ms of audio
    const sourceRate = 48000;
    const samples = new Float32Array(480);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sourceRate); // 440 Hz sine wave
    }

    const resampled = downsampleTo16kHz(samples, sourceRate, 16000);
    // At 16 kHz, 10ms should be exactly 160 samples
    expect(resampled.length).toBe(160);
    expect(resampled[0]).toBeCloseTo(samples[0], 2);
  });

  it('preserves samples when source rate is already 16 kHz', () => {
    const samples = new Float32Array([0.1, -0.2, 0.5, -0.8]);
    const resampled = downsampleTo16kHz(samples, 16000, 16000);
    expect(resampled.length).toBe(4);
    expect(resampled[0]).toBeCloseTo(0.1, 5);
    expect(resampled[3]).toBeCloseTo(-0.8, 5);
  });

  it('encodes Float32Array into standard 44-byte RIFF/WAVE PCM 16-bit header and samples', () => {
    const samples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const wavBytes = encodeWav16BitMono(samples, 16000);

    // Header is 44 bytes + (5 samples * 2 bytes = 10 bytes) = 54 bytes
    expect(wavBytes.length).toBe(54);

    const view = new DataView(wavBytes.buffer);

    // 1. Check RIFF tag (ASCII 82, 73, 70, 70)
    expect(String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3])).toBe('RIFF');

    // 2. Check chunkSize = 36 + dataSize (36 + 10 = 46)
    expect(view.getUint32(4, true)).toBe(46);

    // 3. Check WAVE tag
    expect(String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11])).toBe('WAVE');

    // 4. Check "fmt " sub-chunk
    expect(String.fromCharCode(wavBytes[12], wavBytes[13], wavBytes[14], wavBytes[15])).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // Subchunk1Size = 16 for PCM
    expect(view.getUint16(20, true)).toBe(1); // AudioFormat = 1 (PCM)
    expect(view.getUint16(22, true)).toBe(1); // NumChannels = 1 (Mono)
    expect(view.getUint32(24, true)).toBe(16000); // SampleRate = 16000 Hz
    expect(view.getUint32(28, true)).toBe(32000); // ByteRate = 16000 * 1 * 2 = 32000
    expect(view.getUint16(32, true)).toBe(2); // BlockAlign = 2
    expect(view.getUint16(34, true)).toBe(16); // BitsPerSample = 16

    // 5. Check "data" sub-chunk
    expect(String.fromCharCode(wavBytes[36], wavBytes[37], wavBytes[38], wavBytes[39])).toBe('data');
    expect(view.getUint32(40, true)).toBe(10); // dataSize = 10 bytes

    // 6. Check sample values serialized as 16-bit signed ints
    // Sample 0: 0.0 -> 0
    expect(view.getInt16(44, true)).toBe(0);
    // Sample 1: 0.5 -> 0.5 * 32767 = 16384
    expect(view.getInt16(46, true)).toBe(16384);
    // Sample 2: -0.5 -> -0.5 * 32768 = -16384
    expect(view.getInt16(48, true)).toBe(-16384);
    // Sample 3: 1.0 -> 32767
    expect(view.getInt16(50, true)).toBe(32767);
    // Sample 4: -1.0 -> -32768
    expect(view.getInt16(52, true)).toBe(-32768);
  });
});
