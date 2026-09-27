import { processImageWithOpenCV, type OpenCVEnhancerInput } from '../services/opencvEnhancer';

const ctx: Worker = self as any;

let cvInstance: any = null;
let cvInitPromise: Promise<any> | null = null;

function loadOpenCV(): Promise<any> {
  if (cvInstance) return Promise.resolve(cvInstance);
  if (cvInitPromise) return cvInitPromise;

  cvInitPromise = new Promise((resolve, reject) => {
    try {
      // In testing environments (like JSDOM), we might inject a mock cv on the global scope
      if ((self as any).testOpenCVInstance) {
        cvInstance = (self as any).testOpenCVInstance;
        return resolve(cvInstance);
      }

      // Set up OpenCV runtime initialized callback
      (self as any).Module = {
        onRuntimeInitialized: () => {
          cvInstance = (self as any).cv;
          resolve(cvInstance);
        },
      };

      if (typeof (self as any).importScripts === 'function') {
        (self as any).importScripts('https://docs.opencv.org/4.9.0/opencv.js');
      } else {
        reject(new Error('importScripts is not available in this worker environment'));
      }
    } catch (err) {
      reject(err);
    }
  });

  return cvInitPromise;
}

export type WorkerRequest = {
  id: string;
  type: 'ENHANCE_IMAGE';
  payload: Omit<OpenCVEnhancerInput, 'pixels'> & {
    pixelData: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
  };
};

export type WorkerResponse = {
  id: string;
  type: 'ENHANCE_IMAGE_RESULT';
  success: true;
  payload: {
    outputPixelData: Uint8ClampedArray;
    width: number;
    height: number;
    log: any;
  };
} | {
  id: string;
  type: 'ENHANCE_IMAGE_RESULT';
  success: false;
  error: string;
};

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type !== 'ENHANCE_IMAGE') return;

  try {
    const cv = await loadOpenCV();
    
    const input: OpenCVEnhancerInput = {
      ...req.payload,
      pixels: {
        data: req.payload.pixelData,
        width: req.payload.width,
        height: req.payload.height
      }
    };

    const result = processImageWithOpenCV(cv, input);

    const outData = result.outputPixels.data as Uint8ClampedArray;

    const response: WorkerResponse = {
      id: req.id,
      type: 'ENHANCE_IMAGE_RESULT',
      success: true,
      payload: {
        outputPixelData: outData,
        width: result.outputPixels.width,
        height: result.outputPixels.height,
        log: result.log
      }
    };

    // Transfer the ArrayBuffer back to the main thread to avoid copying memory
    ctx.postMessage(response, [outData.buffer]);

  } catch (error: any) {
    const errResp: WorkerResponse = {
      id: req.id,
      type: 'ENHANCE_IMAGE_RESULT',
      success: false,
      error: error.message || String(error)
    };
    ctx.postMessage(errResp);
  }
};
