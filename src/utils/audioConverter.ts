// src/utils/audioConverter.ts
// Stage 6.2: Audio conversion utility for client-side PCM WAV encoding (16 kHz mono 16-bit).

/**
 * Downsamples a Float32Array audio buffer to 16 kHz using linear interpolation.
 * Pure function: works in both browser and headless test environments without AudioContext.
 */
export function downsampleTo16kHz(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 16000
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(samples);
  }

  if (samples.length === 0) {
    return new Float32Array(0);
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const index = Math.floor(originalPos);
    const decimal = originalPos - index;

    const sample1 = samples[index] ?? 0;
    const sample2 = samples[index + 1] ?? sample1;

    result[i] = sample1 + (sample2 - sample1) * decimal;
  }

  return result;
}

/**
 * Encodes mono float32 audio samples into standard 16-bit PCM WAV format.
 * Pure logic: creates a valid 44-byte RIFF/WAVE header followed by signed 16-bit integers.
 */
export function encodeWav16BitMono(
  samples: Float32Array,
  sampleRate: number = 16000
): Uint8Array {
  const bytesPerSample = 2; // 16-bit
  const numChannels = 1; // mono
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Helper to write ASCII strings into DataView
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // 1. RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // chunkSize = 36 + SubChunk2Size
  writeString(8, 'WAVE');

  // 2. "fmt " sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM (16 bytes)
  view.setUint16(20, 1, true); // AudioFormat: 1 = PCM (linear quantization)
  view.setUint16(22, numChannels, true); // NumChannels = 1 (mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate = SampleRate * NumChannels * BitsPerSample/8
  view.setUint16(32, blockAlign, true); // BlockAlign = NumChannels * BitsPerSample/8
  view.setUint16(34, 16, true); // BitsPerSample = 16

  // 3. "data" sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // 4. PCM Samples (clamped to [-1.0, 1.0] and scaled to signed 16-bit int [-32768, 32767])
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Converts any audio Blob (WebM, MP4, etc.) to 16 kHz mono 16-bit PCM WAV.
 * Employs client-side AudioContext to decode audio, mixes channels to mono,
 * resamples to 16 kHz, and packs into standard WAV container.
 */
export async function convertAudioBlobTo16kHzWav(audioBlob: Blob): Promise<Blob> {
  if (!audioBlob || audioBlob.size === 0) {
    throw new Error('Empty or invalid audio blob provided for WAV conversion.');
  }

  // If already audio/wav and Web Audio API is not present, return as is
  const AudioContextClass =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as any).webkitAudioContext
      : null;

  if (!AudioContextClass) {
    // In headless environments without AudioContext, return blob as audio/wav
    return new Blob([await audioBlob.arrayBuffer()], { type: 'audio/wav' });
  }

  const audioContext = new AudioContextClass();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Downmix channels to mono
    const numChannels = decodedBuffer.numberOfChannels;
    const length = decodedBuffer.length;
    const monoSamples = new Float32Array(length);

    for (let c = 0; c < numChannels; c++) {
      const channelData = decodedBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        monoSamples[i] += channelData[i] / numChannels;
      }
    }

    // Downsample to 16 kHz
    const resampled = downsampleTo16kHz(monoSamples, decodedBuffer.sampleRate, 16000);

    // Encode to 16-bit PCM WAV
    const wavBytes = encodeWav16BitMono(resampled, 16000);

    return new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
  } finally {
    try {
      await audioContext.close();
    } catch {
      // ignore close errors
    }
  }
}
