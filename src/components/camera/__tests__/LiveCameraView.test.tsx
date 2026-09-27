import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveCameraView } from '../LiveCameraView';

// explicitly mock video/canvas frame source to test live status decision logic
HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLVideoElement.prototype.pause = vi.fn();
Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1920 });
Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1080 });
Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, get: () => 4 });

const mockGetImageData = vi.fn();
HTMLCanvasElement.prototype.getContext = vi.fn((contextId) => {
  if (contextId === '2d') {
    return {
      drawImage: vi.fn(),
      getImageData: mockGetImageData,
    } as unknown as CanvasRenderingContext2D;
  }
  return null;
}) as any;
HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob()));

// Mock pointer capture for JSDOM
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();

// Mock media devices
Object.defineProperty(globalThis, 'navigator', {
  value: {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    }
  },
  writable: true,
});

describe('LiveCameraView', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetImageData.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
    if (root) {
      root.unmount();
      root = null;
    }
  });

  it('renders without crashing and requests camera', async () => {
    await act(async () => {
      root = createRoot(container!);
      root.render(<LiveCameraView onCapture={vi.fn()} onCancel={vi.fn()} onFallbackToFile={vi.fn()} />);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('shows "Good" status when no issues detected', async () => {
    // Generate valid gray data
    const fakeData = new Uint8ClampedArray(320 * 240 * 4);
    for(let i=0; i<fakeData.length; i+=4) {
      fakeData[i] = 120; // R
      fakeData[i+1] = 120; // G
      fakeData[i+2] = 120; // B
      fakeData[i+3] = 255; // A
    }
    mockGetImageData.mockReturnValue({
      data: fakeData,
      width: 320,
      height: 240,
    });

    await act(async () => {
      root = createRoot(container!);
      root.render(<LiveCameraView onCapture={vi.fn()} onCancel={vi.fn()} onFallbackToFile={vi.fn()} />);
    });
    
    let found = false;
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      if (container!.textContent?.includes('Good')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('prioritizes shake detection over exposure', async () => {
    // Frame 1
    const fakeData1 = new Uint8ClampedArray(320 * 240 * 4);
    for(let i=0; i<fakeData1.length; i+=4) {
      fakeData1[i] = 10;
      fakeData1[i+1] = 10;
      fakeData1[i+2] = 10;
      fakeData1[i+3] = 255;
    }
    mockGetImageData.mockReturnValueOnce({ data: fakeData1, width: 320, height: 240 });

    await act(async () => {
      root = createRoot(container!);
      root.render(<LiveCameraView onCapture={vi.fn()} onCancel={vi.fn()} onFallbackToFile={vi.fn()} />);
    });
    
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(500); // Frame 1
    });

    // Frame 2: totally different (shake) AND still dark
    const fakeData2 = new Uint8ClampedArray(320 * 240 * 4);
    for(let i=0; i<fakeData2.length; i+=4) {
      fakeData2[i] = 40; 
      fakeData2[i+1] = 40;
      fakeData2[i+2] = 40;
      fakeData2[i+3] = 255;
    }
    mockGetImageData.mockReturnValueOnce({ data: fakeData2, width: 320, height: 240 });

    let found = false;
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      if (container!.textContent?.includes('Hold still')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('executes quick tap capture instantly', async () => {
    mockGetImageData.mockReturnValue({ data: new Uint8ClampedArray(320 * 240 * 4), width: 320, height: 240 });
    const onCapture = vi.fn();
    await act(async () => {
      root = createRoot(container!);
      root.render(<LiveCameraView onCapture={onCapture} onCancel={vi.fn()} onFallbackToFile={vi.fn()} />);
    });
    
    // Quick tap
    const btn = container!.querySelector('[data-testid="camera-capture-btn"]') as HTMLElement;
    
    await act(async () => {
      // simulate pointer events
      const downEvent = new Event('pointerdown', { bubbles: true });
      (downEvent as any).pointerId = 1;
      btn.dispatchEvent(downEvent);
      
      const upEvent = new Event('pointerup', { bubbles: true });
      (upEvent as any).pointerId = 1;
      btn.dispatchEvent(upEvent);
    });

    expect(onCapture).toHaveBeenCalled();
  });

  it('executes burst capture on hold', async () => {
    const onCapture = vi.fn();
    await act(async () => {
      root = createRoot(container!);
      root.render(<LiveCameraView onCapture={onCapture} onCancel={vi.fn()} onFallbackToFile={vi.fn()} />);
    });
    
    const fakeData = new Uint8ClampedArray(320 * 240 * 4);
    mockGetImageData.mockReturnValue({ data: fakeData, width: 320, height: 240 });

    const btn = container!.querySelector('[data-testid="camera-capture-btn"]') as HTMLElement;
    
    await act(async () => {
      const downEvent = new Event('pointerdown', { bubbles: true });
      (downEvent as any).pointerId = 1;
      btn.dispatchEvent(downEvent);
    });
    
    await act(async () => {
      vi.advanceTimersByTime(1000); // Held for 1 sec
    });
    
    await act(async () => {
      const upEvent = new Event('pointerup', { bubbles: true });
      (upEvent as any).pointerId = 1;
      btn.dispatchEvent(upEvent);
    });

    expect(onCapture).toHaveBeenCalled();
  });
});
