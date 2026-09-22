/**
 * Corrects lighting of a given image blob (auto white balance and contrast normalization).
 * Preserves the alpha channel (transparency).
 * 
 * @param imageBlob The image to correct
 * @returns A Promise resolving to the corrected image Blob
 */
export async function correctLighting(imageBlob: Blob): Promise<Blob> {
  if (!imageBlob || imageBlob.size === 0) {
    throw new Error('Invalid image Blob');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2d canvas context'));
        return;
      }
      
      // Draw the image
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // 1. Auto White Balance (Gray World Assumption)
      let rSum = 0, gSum = 0, bSum = 0, count = 0;

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) { // Only consider non-transparent pixels
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          count++;
        }
      }

      if (count > 0) {
        const rAvg = rSum / count;
        const gAvg = gSum / count;
        const bAvg = bSum / count;
        
        // Target gray is the average of the color averages
        const grayAvg = (rAvg + gAvg + bAvg) / 3;

        // Scaling factors for each channel to reach the target gray
        const rScale = rAvg > 0 ? grayAvg / rAvg : 1;
        const gScale = gAvg > 0 ? grayAvg / gAvg : 1;
        const bScale = bAvg > 0 ? grayAvg / bAvg : 1;

        // 2. Contrast Normalization (Histogram stretching, clipping outlier 1st and 99th percentiles)
        const lumHistogram = new Int32Array(256);
        
        // First pass: apply white balance and build luminance histogram
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0) {
            data[i] = Math.min(255, data[i] * rScale);
            data[i + 1] = Math.min(255, data[i + 1] * gScale);
            data[i + 2] = Math.min(255, data[i + 2] * bScale);

            // Calculate luminance
            const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            const clampedLum = Math.max(0, Math.min(255, lum));
            lumHistogram[clampedLum]++;
          }
        }

        let minL = 0;
        let maxL = 255;
        
        // Find 1st percentile
        let cumulative = 0;
        const targetP1 = count * 0.01;
        for (let i = 0; i < 256; i++) {
          cumulative += lumHistogram[i];
          if (cumulative >= targetP1) {
            minL = i;
            break;
          }
        }

        // Find 99th percentile
        cumulative = 0;
        const targetP99 = count * 0.01;
        for (let i = 255; i >= 0; i--) {
          cumulative += lumHistogram[i];
          if (cumulative >= targetP99) {
            maxL = i;
            break;
          }
        }

        // Second pass: apply contrast stretch based on percentiles
        if (maxL > minL) {
          const scale = 255 / (maxL - minL);
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) {
              data[i] = Math.max(0, Math.min(255, (data[i] - minL) * scale));
              data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - minL) * scale));
              data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - minL) * scale));
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // Fallback/typings for testing environments
      const toBlobProp = canvas.toBlob as any;
      if (typeof toBlobProp === 'function') {
        toBlobProp.call(canvas, (blob: Blob | null) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, imageBlob.type || 'image/png');
      } else {
        reject(new Error('canvas.toBlob not implemented'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image Blob'));
    };

    img.src = url;
  });
}
