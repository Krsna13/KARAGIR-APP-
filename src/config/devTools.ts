/**
 * src/config/devTools.ts
 *
 * Gating configuration for dev-only routes and tools:
 * - /dev/device-check
 * - /dev/voice-input
 * - /dev/dataset-collector
 *
 * Rule:
 * In production web builds (npm run build), VITE_ENABLE_DEV_TOOLS is unset/false
 * and import.meta.env.DEV is false, ensuring dev tools are strictly disabled.
 * When building for testing (e.g. build:android with VITE_ENABLE_DEV_TOOLS=true),
 * dev tools pages are enabled. In local dev (npm run dev), import.meta.env.DEV is true.
 */

export interface DevToolsEnv {
  VITE_ENABLE_DEV_TOOLS?: string | boolean;
  DEV?: boolean;
}

/**
 * Pure helper to determine if dev tools should be enabled based on environment variables.
 */
export function checkDevToolsEnabled(env: DevToolsEnv = import.meta.env): boolean {
  if (env.VITE_ENABLE_DEV_TOOLS !== undefined) {
    return env.VITE_ENABLE_DEV_TOOLS === 'true' || env.VITE_ENABLE_DEV_TOOLS === true;
  }
  return Boolean(env.DEV);
}

export const isDevToolsEnabled: boolean = checkDevToolsEnabled();

export type DevRoute = 'device-check' | 'voice-input' | 'dataset-collector' | null;

/**
 * Helper to identify which dev route is active from a URL path and hash.
 * Returns null if dev tools are disabled or URL is not a dev route.
 */
export function getActiveDevRoute(
  pathname: string = window.location.pathname,
  hash: string = window.location.hash,
  devToolsAllowed: boolean = isDevToolsEnabled
): DevRoute {
  if (!devToolsAllowed) return null;

  const target = `${pathname} ${hash}`.toLowerCase();

  if (target.includes('/dev/device-check')) {
    return 'device-check';
  }
  if (target.includes('/dev/voice-input')) {
    return 'voice-input';
  }
  if (target.includes('/dev/dataset-collector')) {
    return 'dataset-collector';
  }

  return null;
}
