import { describe, it, expect } from 'vitest';
import { createCanvas, Image } from 'canvas';
import { correctLighting } from '../lightingCorrectionService';

describe('lightingCorrectionService', () => {
  it('should realistically correct a dark image and preserve transparency (testing pixel values)', async () => {
    // 1. Mock DOM APIs to use 'canvas' package since jsdom doesn't support canvas/Image natively
    const blobMap = new Map<string, ArrayBuffer>();
    
    const originalCreateObjectURL = globalThis.URL.createObjectURL;
    const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
    const originalImage = globalThis.Image;
    const originalCreateElement = globalThis.document.createElement;

    try {
      globalThis.URL.createObjectURL = (blob: Blob) => {
        const url = `blob:test-${Math.random()}`;
        blob.arrayBuffer().then((buf) => blobMap.set(url, buf));
        return url;
      };
      
      globalThis.URL.revokeObjectURL = (url: string) => {
        blobMap.delete(url);
      };
      
      globalThis.Image = function() {
        const img = new Image();
        const originalSetSrc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(img), 'src')!.set;
        
        let customOnload: any = null;
        let customOnerror: any = null;

        Object.defineProperty(img, 'src', {
          get: function() { return (this as any)._src; },
          set: function(val: string) {
            (this as any)._src = val;
            const checkAndLoad = () => {
              try {
                if (blobMap.has(val)) {
                  const RealNodeBuffer = eval('require("buffer").Buffer');
                  originalSetSrc!.call(img, RealNodeBuffer.from(blobMap.get(val)!));
                  if (customOnload) customOnload();
                } else {
                  setTimeout(checkAndLoad, 5);
                }
              } catch (err) {
                if (customOnerror) customOnerror(err);
              }
            };
            setTimeout(checkAndLoad, 5);
          }
        });

        Object.defineProperty(img, 'onload', {
          get: () => customOnload,
          set: (fn) => customOnload = fn
        });
        Object.defineProperty(img, 'onerror', {
          get: () => customOnerror,
          set: (fn) => customOnerror = fn
        });

        return img;
      } as any;
      
      globalThis.document.createElement = ((tagName: string) => {
        if (tagName === 'canvas') {
          const c = createCanvas(10, 10);
          (c as any).toBlob = function(cb: Function, type: string) {
            const buf = this.toBuffer(type);
            cb(new Blob([new Uint8Array(buf)], { type }));
          };
          return c;
        }
        return originalCreateElement.call(document, tagName);
      }) as any;

      // 2. Generate a deliberately DARK test image with an opaque center and transparent border
      const canvas = createCanvas(10, 10);
      const ctx = canvas.getContext('2d');
      
      // Transparent background
      ctx.clearRect(0, 0, 10, 10);
      
      // Very dark colors to force contrast stretching
      ctx.fillStyle = 'rgba(20, 10, 10, 1)';
      ctx.fillRect(2, 2, 2, 2);
      
      ctx.fillStyle = 'rgba(40, 20, 20, 1)';
      ctx.fillRect(4, 2, 2, 2);
      
      ctx.fillStyle = 'rgba(10, 5, 5, 1)'; // Close to black
      ctx.fillRect(2, 4, 4, 2);
      
      const inputBuffer = canvas.toBuffer('image/png');
      const inputBlob = new Blob([new Uint8Array(inputBuffer)], { type: 'image/png' });

      // 3. Run real correctLighting logic
      const outputBlob = await correctLighting(inputBlob);
      expect(outputBlob).toBeInstanceOf(Blob);

      // 4. Decode the output and verify actual pixel values
      const outputBuffer = await outputBlob.arrayBuffer();
      const outImg = new Image();
      
      await new Promise<void>((resolve, reject) => {
        outImg.onload = () => resolve();
        outImg.onerror = reject;
        const RealNodeBuffer = eval('require("buffer").Buffer');
        outImg.src = RealNodeBuffer.from(outputBuffer);
      });

      const outCanvas = createCanvas(10, 10);
      const outCtx = outCanvas.getContext('2d');
      outCtx.drawImage(outImg, 0, 0);
      
      const outData = outCtx.getImageData(0, 0, 10, 10).data;

      // Check pixel at (4,2) which was originally rgba(40, 20, 20, 255)
      // Because it's the brightest pixel, contrast stretching will pull it up towards 255.
      
      const centerIndex = (2 * 10 + 4) * 4; // y=2, x=4
      const r = outData[centerIndex];
      const g = outData[centerIndex + 1];
      const b = outData[centerIndex + 2];
      const a = outData[centerIndex + 3];

      expect(a).toBe(255); // Alpha preserved
      
      // Since it was dark but the brightest in the image, it should be significantly brighter
      const originalLum = 0.299 * 40 + 0.587 * 20 + 0.114 * 20;
      const newLum = 0.299 * r + 0.587 * g + 0.114 * b;
      
      expect(newLum).toBeGreaterThan(originalLum + 100); // Should be much brighter
      
      // Check pixel at (0,0) which was originally transparent
      const borderIndex = 0;
      expect(outData[borderIndex + 3]).toBe(0); // Alpha preserved (still transparent)

    } finally {
      // Restore globals
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
      globalThis.Image = originalImage;
      globalThis.document.createElement = originalCreateElement;
    }
  }, 15000);
});
