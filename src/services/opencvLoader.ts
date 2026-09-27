/**
 * HARD RULE: Never use generative image editing on the product. Product pixels
 * come only from the original photo. Only background, framing, lighting,
 * contrast, noise, and sharpness may change.
 *
 * Stage 6.3b: OpenCV.js Lazy Loader.
 *
 * LOADING METHOD:
 * Dynamic DOM script tag injection loaded strictly on-demand when the image enhancer runs.
 * It is NEVER imported in the initial app bundle, keeping initial page load bundle impact at 0 KB.
 *
 * SIZE REPORT:
 * - Uncompressed OpenCV.js wasm/asm runtime: ~8.5 MB
 * - Gzipped network transfer size: ~2.1 MB
 * - Initial bundle impact: 0 KB (lazy-loaded on demand only)
 *
 * GRACEFUL FALLBACK:
 * If OpenCV.js fails to load (offline, network error, or runtime initialization failure),
 * this loader returns null, allowing the pipeline to seamlessly fall back to correctLighting().
 */

declare global {
  interface Window {
    cv?: any;
    Module?: any;
  }
}

const OPENCV_CDN_URL = 'https://docs.opencv.org/4.9.0/opencv.js';
const OPENCV_LOAD_TIMEOUT_MS = 15000;

let openCVPromise: Promise<any | null> | null = null;
let testOpenCVInstance: any | null = null;

/**
 * Injects a mock or custom OpenCV instance for testing environments.
 */
export function setOpenCVForTesting(mockCv: any | null): void {
  testOpenCVInstance = mockCv;
  openCVPromise = mockCv ? Promise.resolve(mockCv) : null;
}

/**
 * Resets the loader state (primarily for test teardown).
 */
export function resetOpenCVLoader(): void {
  testOpenCVInstance = null;
  openCVPromise = null;
}

/**
 * Returns true if OpenCV is already initialized in memory.
 */
export function isOpenCVLoaded(): boolean {
  if (testOpenCVInstance) return true;
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
    return true;
  }
  return false;
}

/**
 * Lazy loads OpenCV.js asynchronously. Returns the `cv` object, or null if loading fails.
 */
export async function getOpenCV(cdnUrl: string = OPENCV_CDN_URL): Promise<any | null> {
  if (testOpenCVInstance) {
    return testOpenCVInstance;
  }

  if (typeof window === 'undefined') {
    // Node / headless test environment
    return null;
  }

  // Already loaded on window
  if (window.cv && window.cv.Mat) {
    return window.cv;
  }

  if (openCVPromise) {
    return openCVPromise;
  }

  openCVPromise = new Promise<any | null>((resolve) => {
    try {
      // In JSDOM without script loader support, fail fast to fallback
      if (navigator?.userAgent?.includes('jsdom')) {
        console.warn('[OpenCVLoader] JSDOM environment detected. Using fallback enhancer.');
        return resolve(null);
      }

      const existingScript = document.querySelector<HTMLScriptElement>('script[src*="opencv.js"]');
      if (existingScript && window.cv && window.cv.Mat) {
        return resolve(window.cv);
      }

      const script: HTMLScriptElement = existingScript || document.createElement('script');
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn(`[OpenCVLoader] Loading timed out after ${OPENCV_LOAD_TIMEOUT_MS}ms. Falling back.`);
          resolve(null);
        }
      }, OPENCV_LOAD_TIMEOUT_MS);

      const checkReady = () => {
        if (resolved) return;
        if (window.cv && window.cv.Mat) {
          resolved = true;
          clearTimeout(timeout);
          console.log('[OpenCVLoader] OpenCV.js initialized successfully.');
          resolve(window.cv);
        }
      };

      // Set up OpenCV runtime initialized callback if not yet ready
      window.Module = window.Module || {};
      const prevInit = window.Module.onRuntimeInitialized;
      window.Module.onRuntimeInitialized = () => {
        if (prevInit) prevInit();
        checkReady();
      };

      if (!existingScript) {
        script.setAttribute('src', cdnUrl);
        script.setAttribute('async', 'true');
        script.setAttribute('type', 'text/javascript');

        script.onload = () => {
          // If cv is already initialized (e.g. asm.js build)
          if (window.cv && window.cv.Mat) {
            checkReady();
          }
        };

        script.onerror = (err: Event | string) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.warn('[OpenCVLoader] Failed to download OpenCV.js script. Falling back:', err);
            resolve(null);
          }
        };

        document.body.appendChild(script);
      }
    } catch (err) {
      console.warn('[OpenCVLoader] Exception during OpenCV.js dynamic load. Falling back:', err);
      resolve(null);
    }
  });

  return openCVPromise;
}
