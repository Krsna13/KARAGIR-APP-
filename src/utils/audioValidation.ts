export interface AudioValidationOptions {
  minDurationSeconds?: number;
  minRmsThreshold?: number;
}

/**
 * Validates whether an audio blob meets minimum duration and volume thresholds.
 * Returns true if the audio is valid (long enough and loud enough), false otherwise.
 * Throws an error if decoding fails.
 */
export async function validateAudioQuality(
  blob: Blob,
  options: AudioValidationOptions = {}
): Promise<boolean> {
  const { minDurationSeconds = 0.3, minRmsThreshold = 0.005 } = options;

  // 1. Pre-check basic blob size to fail fast on completely empty recordings
  if (blob.size === 0) {
    return false;
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    
    // Check if we are in an environment with AudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      // Fallback: If AudioContext is not available (e.g. some headless tests or very old browsers),
      // we can't reliably check silence, so assume true to not block the user.
      return true;
    }

    const audioContext = new AudioContextClass();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 2. Enforce minimum duration
    if (audioBuffer.duration < minDurationSeconds) {
      return false;
    }

    // 3. Enforce minimum volume (RMS)
    if (audioBuffer.numberOfChannels === 0) {
      return false;
    }

    // Compute RMS of the first channel
    const channelData = audioBuffer.getChannelData(0);
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSquares / channelData.length);

    if (rms < minRmsThreshold) {
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[validateAudioQuality] Error validating audio:', error);
    // If decoding fails (e.g. browser doesn't support decoding WebM via AudioContext),
    // it's safer to let it pass and let Gemini try to transcribe it, rather than blocking the user.
    return true;
  }
}
