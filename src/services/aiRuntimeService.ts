import { Capacitor } from '@capacitor/core';

export type AIBackend = 'on-device' | 'cloud';

export class NotImplementedError extends Error {
  public readonly feature: string;
  public readonly backend: AIBackend;

  constructor(feature: string, backend: AIBackend) {
    super(`[AIRuntimeService] Feature '${feature}' is not implemented yet for backend '${backend}'.`);
    this.name = 'NotImplementedError';
    this.feature = feature;
    this.backend = backend;
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}

// In-memory dev override for testing & developer toggling
let devBackendOverride: AIBackend | null = null;

/**
 * Manually override the active AI backend (for dev testing & debug toggle).
 * Pass `null` to reset to automatic detection.
 */
export function setDevBackendOverride(backend: AIBackend | null): void {
  devBackendOverride = backend;
}

/**
 * Get current manual dev override, if one is active.
 */
export function getDevBackendOverride(): AIBackend | null {
  return devBackendOverride;
}

/**
 * Toggle active backend between 'cloud' and 'on-device'.
 * Useful for dev UI controls.
 */
export function toggleDevBackend(): AIBackend {
  const current = getActiveBackend();
  const next: AIBackend = current === 'cloud' ? 'on-device' : 'cloud';
  setDevBackendOverride(next);
  return next;
}

/**
 * Determines the active AI backend:
 * 1. Checks manual dev override (if set).
 * 2. Reads VITE_AI_BACKEND environment variable ('on-device' | 'cloud').
 * 3. Defaults to 'on-device' for Capacitor native platforms (Android).
 * 4. Defaults to 'cloud' for web browsers and development environments.
 */
export function getActiveBackend(): AIBackend {
  // 1. Check explicit dev override
  if (devBackendOverride !== null) {
    return devBackendOverride;
  }

  // 2. Check environment variable (Vite import.meta.env or Node process.env in tests)
  let envBackend: string | undefined;
  try {
    envBackend = (import.meta as { env?: Record<string, string> })?.env?.VITE_AI_BACKEND;
  } catch {
    // import.meta may be undefined in certain test runners
  }

  const procEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    ?.process?.env?.VITE_AI_BACKEND;
  if (!envBackend && procEnv) {
    envBackend = procEnv;
  }

  if (envBackend === 'on-device' || envBackend === 'cloud') {
    return envBackend;
  }

  // 3. Platform detection via Capacitor
  try {
    if (Capacitor.isNativePlatform()) {
      return 'on-device';
    }
  } catch {
    // Non-Capacitor environment
  }

  // 4. Default for web dev
  return 'cloud';
}

/**
 * TODO (Hardware Integration Milestone):
 * The true on-device NPU execution path via Qualcomm GenieX / QNN requires native
 * Android C++ / Java SDK bindings and physical Snapdragon NPU hardware.
 * In this stage, runSegmentation() runs via client-side WebAssembly/WebGL ML inference
 * (using @imgly/background-removal) which executes on-device within the browser/WebView runtime.
 * Once the native GenieX Capacitor bridge is packaged, this function will route
 * on-device calls to the Snapdragon NPU accelerator.
 * 
 * Runs image segmentation/background removal model.
 * 
 * @param imageBlob Raw image blob of product/craft
 * @returns Processed image blob with isolated product mask
 */
export async function runSegmentation(imageBlob: Blob): Promise<Blob> {
  const backend = getActiveBackend();
  console.log(`[AIRuntimeService] runSegmentation invoked on backend: '${backend}', input size: ${imageBlob?.size ?? 0} bytes`);

  if (!imageBlob || imageBlob.size === 0) {
    throw new Error('[AIRuntimeService] runSegmentation failed: Empty or invalid image Blob provided.');
  }

  try {
    const { removeBackground } = await import('@imgly/background-removal');
    const resultBlob = await removeBackground(imageBlob);
    return resultBlob;
  } catch (error: unknown) {
    console.error(`[AIRuntimeService] Background removal failed on backend '${backend}':`, error);
    throw error;
  }
}

/**
 * Runs speech-to-text model on audio input.
 * 
 * @param audioBlob Raw recorded audio snippet
 * @param language Target language code (e.g. 'hi', 'en', 'mr')
 * @returns Transcribed text string
 * @throws NotImplementedError stub for Stage 0.2
 */
export async function runSTT(audioBlob: Blob, language: string): Promise<string> {
  const backend = getActiveBackend();
  console.log(`[AIRuntimeService] runSTT invoked on backend: '${backend}', language: '${language}', audio size: ${audioBlob.size} bytes`);
  throw new NotImplementedError('runSTT', backend);
}

/**
 * Runs small language model for structured specification extraction and auto-cataloging.
 * 
 * @param prompt Input user prompt or multimodal description
 * @param schema Optional JSON schema definition for structured output
 * @returns Model output string (JSON or natural language description)
 * @throws NotImplementedError stub for Stage 0.2
 */
export async function runSLM(prompt: string, schema?: object): Promise<string> {
  const backend = getActiveBackend();
  console.log(`[AIRuntimeService] runSLM invoked on backend: '${backend}', prompt length: ${prompt.length} chars, schema present: ${Boolean(schema)}`);
  throw new NotImplementedError('runSLM', backend);
}
