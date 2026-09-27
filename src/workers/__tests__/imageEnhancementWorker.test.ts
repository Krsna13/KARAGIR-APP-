import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorkerRequest } from '../imageEnhancementWorker';
import * as opencvEnhancer from '../../services/opencvEnhancer';

// Mock the processImageWithOpenCV logic since we are only testing the worker boundary
vi.mock('../../services/opencvEnhancer', () => {
  return {
    processImageWithOpenCV: vi.fn(),
  };
});

describe('imageEnhancementWorker message protocol (mocked Worker boundary)', () => {
  let mockPostMessage: any;
  let messageHandler: ((event: MessageEvent<WorkerRequest>) => Promise<void>) | null = null;
  
  beforeEach(async () => {
    // 1. Mock the global Worker environment
    mockPostMessage = vi.fn();
    
    // We mock 'self' as a global before the worker file is evaluated
    vi.stubGlobal('self', {
      postMessage: mockPostMessage,
      // Intercept the onmessage assignment to test it
      set onmessage(handler: any) {
        messageHandler = handler;
      },
      testOpenCVInstance: {
        Mat: class {},
      }
    });

    vi.stubGlobal('importScripts', vi.fn());

    // 2. Isolate module import to evaluate the worker script fresh each time
    vi.resetModules();
    await import('../imageEnhancementWorker');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    messageHandler = null;
  });

  it('receives ENHANCE_IMAGE request, extracts pixels, and posts ENHANCE_IMAGE_RESULT with transferable buffer', async () => {
    // Arrange
    expect(messageHandler).toBeDefined();

    const mockInputData = new Uint8ClampedArray(400); // 10x10 rgba
    const mockOutputData = new Uint8ClampedArray(400);
    
    // Mock the pixel logic return value
    vi.mocked(opencvEnhancer.processImageWithOpenCV).mockReturnValue({
      outputPixels: {
        data: mockOutputData,
        width: 10,
        height: 10
      },
      log: { mockLog: true } as any
    });

    const request: WorkerRequest = {
      id: 'test-msg-123',
      type: 'ENHANCE_IMAGE',
      payload: {
        pixelData: mockInputData,
        width: 10,
        height: 10,
        enhancement_mode: 'studio',
        noiseEstimate: 0,
        initialBlurScore: 0
      }
    };

    const mockEvent = {
      data: request
    } as MessageEvent<WorkerRequest>;

    // Act
    await messageHandler!(mockEvent);

    // Assert: Check the pixel logic was called with correct structure
    expect(opencvEnhancer.processImageWithOpenCV).toHaveBeenCalledTimes(1);
    const calledArgs = vi.mocked(opencvEnhancer.processImageWithOpenCV).mock.calls[0];
    expect(calledArgs[1].pixels.data).toBe(mockInputData);
    expect(calledArgs[1].pixels.width).toBe(10);
    expect(calledArgs[1].enhancement_mode).toBe('studio');

    // Assert: Check the worker posted the success message back
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [response, transferList] = mockPostMessage.mock.calls[0];
    
    expect(response).toMatchObject({
      id: 'test-msg-123',
      type: 'ENHANCE_IMAGE_RESULT',
      success: true,
      payload: {
        outputPixelData: mockOutputData,
        width: 10,
        height: 10,
        log: { mockLog: true }
      }
    });

    // Verify Transferable Objects usage (ArrayBuffer transferred)
    expect(transferList).toBeDefined();
    expect(transferList[0]).toBe(mockOutputData.buffer);
  });

  it('catches synchronous errors in pixel logic and posts honest failure response', async () => {
    // Arrange
    expect(messageHandler).toBeDefined();

    vi.mocked(opencvEnhancer.processImageWithOpenCV).mockImplementation(() => {
      throw new Error('Simulated memory out of bounds error');
    });

    const request: WorkerRequest = {
      id: 'test-err-456',
      type: 'ENHANCE_IMAGE',
      payload: {
        pixelData: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
        enhancement_mode: 'light_only',
        noiseEstimate: 0,
        initialBlurScore: 0
      }
    };

    const mockEvent = { data: request } as MessageEvent<WorkerRequest>;

    // Act
    await messageHandler!(mockEvent);

    // Assert: Worker returns an error response, never a silent hang
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [response, transferList] = mockPostMessage.mock.calls[0];
    
    expect(response).toEqual({
      id: 'test-err-456',
      type: 'ENHANCE_IMAGE_RESULT',
      success: false,
      error: 'Simulated memory out of bounds error'
    });
    
    // Error responses don't have transfer buffers
    expect(transferList).toBeUndefined();
  });
});
