// src/config/demoMode.ts
/**
 * Demo-mode flag configured via VITE_DEMO_MODE environment variable.
 *
 * When enabled (true / 'true' / '1'):
 * - item_type voice transcription returns the mocked 'Bed' script with confidence 1.0.
 * - VoiceInputButton bypasses quality/duration checks for item_type.
 *
 * When disabled (off / default):
 * - item_type uses real Edge Function transcription and standard audio quality validation,
 *   exactly like every other field.
 */

export function isDemoMode(): boolean {
  let envVal: string | boolean | undefined;

  try {
    envVal = (import.meta as { env?: Record<string, string | boolean> })?.env?.VITE_DEMO_MODE;
  } catch {
    // import.meta may be undefined in certain test runners
  }

  if (envVal === undefined) {
    const procEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      ?.process?.env?.VITE_DEMO_MODE;
    if (procEnv !== undefined) {
      envVal = procEnv;
    }
  }

  return envVal === 'true' || envVal === true || envVal === '1';
}
