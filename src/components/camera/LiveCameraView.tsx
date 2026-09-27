// src/components/camera/LiveCameraView.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, SwitchCamera, X, AlertCircle, FolderOpen, RefreshCw, Check, AlertTriangle, Sun } from 'lucide-react';
import {
  computeGrayscale,
  downscaleGrayscale,
  computeVarianceOfLaplacian,
  computeLuminanceHistogramAndExposure,
  computeFrameDifference,
  DEFAULT_QUALITY_THRESHOLDS
} from '../../services/photoQualityService';

export interface LiveCameraViewProps {
  onCapture: (blob: Blob, previewUrl: string) => void;
  onCancel: () => void;
  onFallbackToFile: () => void;
  title?: string;
  titleHi?: string;
}

interface CameraErrorState {
  type: 'permission' | 'not_found' | 'device';
  title: string;
  subtitle: string;
}

/**
 * In-app live camera viewfinder for web (desktop & mobile browser).
 * Preferentially connects to the rear camera ('environment') on phones,
 * supports camera switching when multiple inputs exist, captures full-resolution
 * JPEG frames to the standard enhancement pipeline, and cleanly releases all
 * media tracks on capture, cancel, or unmount.
 */
export const LiveCameraView: React.FC<LiveCameraViewProps> = ({
  onCapture,
  onCancel,
  onFallbackToFile,
  title = 'Take Photo',
  titleHi = 'फोटो लें',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState<number>(0);
  const [currentFacingMode, setCurrentFacingMode] = useState<'environment' | 'user'>('environment');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [error, setError] = useState<CameraErrorState | null>(null);

  type LiveStatus = 'none' | 'good' | 'shake' | 'dark' | 'bright';
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('none');
  const [isBursting, setIsBursting] = useState<boolean>(false);

  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevGrayRef = useRef<Float32Array | null>(null);
  const samplingIntervalRef = useRef<number | null>(null);

  const burstTimeoutRef = useRef<number | null>(null);
  const burstIntervalRef = useRef<number | null>(null);
  const burstFramesRef = useRef<{ canvas: HTMLCanvasElement; score: number }[]>([]);

  const stopSampling = useCallback(() => {
    if (samplingIntervalRef.current) {
      window.clearInterval(samplingIntervalRef.current);
      samplingIntervalRef.current = null;
    }
  }, []);

  const startSampling = useCallback(() => {
    stopSampling();
    samplingIntervalRef.current = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || isCapturing || isBursting) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const sw = 320;
      const sh = Math.max(1, Math.round(vh * (320 / vw)));

      if (!sampleCanvasRef.current) {
        sampleCanvasRef.current = document.createElement('canvas');
      }
      const canvas = sampleCanvasRef.current;
      if (canvas.width !== sw) {
        canvas.width = sw;
        canvas.height = sh;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, sw, sh);
      const imgData = ctx.getImageData(0, 0, sw, sh);
      const gray = computeGrayscale(imgData.data, sw, sh);

      let shake = false;
      if (prevGrayRef.current && prevGrayRef.current.length === gray.length) {
        const diff = computeFrameDifference(gray, prevGrayRef.current);
        if (diff > DEFAULT_QUALITY_THRESHOLDS.steadinessThreshold) {
          shake = true;
        }
      }
      prevGrayRef.current = gray;

      const exp = computeLuminanceHistogramAndExposure(imgData.data, sw, sh);

      let status: LiveStatus = 'good';
      if (shake) {
        status = 'shake';
      } else if (exp.darkFraction > DEFAULT_QUALITY_THRESHOLDS.maxDarkPixelFraction) {
        status = 'dark';
      } else if (exp.overexposedFraction > DEFAULT_QUALITY_THRESHOLDS.maxOverexposedPixelFraction) {
        status = 'bright';
      }

      setLiveStatus(status);
    }, 500);
  }, [isCapturing, isBursting, stopSampling]);

  /**
   * Immediately stops all active media stream tracks and clears the ref.
   */
  const stopMediaTracks = useCallback(() => {
    stopSampling();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  /**
   * Clean up tracks on unmount.
   */
  useEffect(() => {
    return () => {
      stopMediaTracks();
    };
  }, [stopMediaTracks]);

  /**
   * Enumerate available video devices.
   */
  const updateAvailableDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setAvailableDevices(videoInputs);
    } catch {
      // Enumeration is optional/best-effort
    }
  }, []);

  /**
   * Starts video streaming with preferred constraints (rear camera first).
   */
  const startCamera = useCallback(
    async (deviceId?: string, preferredFacing: 'environment' | 'user' = 'environment') => {
      stopMediaTracks();
      setIsLoading(true);
      setError(null);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError({
          type: 'device',
          title: 'Camera Not Supported / कैमरा समर्थित नहीं है',
          subtitle:
            'Your browser does not support in-app camera access. Please choose a photo from files / आपका ब्राउज़र कैमरा एक्सेस समर्थित नहीं करता। कृपया फाइल से फोटो चुनें।',
        });
        setIsLoading(false);
        return;
      }

      let stream: MediaStream | null = null;

      try {
        // Build constraints: explicit deviceId if selected, otherwise ideal facingMode
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: { ideal: preferredFacing },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (firstErr: any) {
          // If overconstrained or ideal facingMode failed, fall back to basic video
          if (
            firstErr?.name === 'OverconstrainedError' ||
            firstErr?.name === 'ConstraintNotSatisfiedError' ||
            !deviceId
          ) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: true,
            });
          } else {
            throw firstErr;
          }
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            startSampling();
          } catch {
            // Auto-play could require user gesture in some contexts; playsInline helps
          }
        }

        await updateAvailableDevices();
        setIsLoading(false);
      } catch (err: any) {
        stopMediaTracks();
        setIsLoading(false);

        const errName = err?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setError({
            type: 'permission',
            title: 'Camera Permission Needed / कैमरा अनुमति चाहिए',
            subtitle:
              'Please allow camera permission in your browser to take photos directly / कृपया सीधे फोटो लेने के लिए ब्राउज़र में कैमरा अनुमति दें।',
          });
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setError({
            type: 'not_found',
            title: 'No Camera Found / कोई कैमरा नहीं मिला',
            subtitle:
              'No camera device was detected on your device / आपके डिवाइस पर कोई कैमरा नहीं मिला।',
          });
        } else {
          setError({
            type: 'device',
            title: 'Camera Unavailable / कैमरा शुरू नहीं हुआ',
            subtitle:
              'Could not start camera feed. Please choose a photo from files / कैमरा फीड शुरू नहीं हो सकी। कृपया फाइल से फोटो चुनें।',
          });
        }
      }
    },
    [stopMediaTracks, updateAvailableDevices]
  );

  // Initialize camera on mount
  useEffect(() => {
    startCamera(undefined, currentFacingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Switch between available cameras (front/rear or device cycle).
   */
  const handleSwitchCamera = useCallback(() => {
    if (availableDevices.length <= 1) return;

    const nextIndex = (currentDeviceIndex + 1) % availableDevices.length;
    setCurrentDeviceIndex(nextIndex);

    const nextDevice = availableDevices[nextIndex];
    const nextFacing = currentFacingMode === 'environment' ? 'user' : 'environment';
    setCurrentFacingMode(nextFacing);

    if (nextDevice?.deviceId) {
      startCamera(nextDevice.deviceId, nextFacing);
    } else {
      startCamera(undefined, nextFacing);
    }
  }, [availableDevices, currentDeviceIndex, currentFacingMode, startCamera]);

  const captureSingleFrame = useCallback((video: HTMLVideoElement): { canvas: HTMLCanvasElement; score: number } | null => {
    const vw = video.videoWidth || (video.clientWidth > 0 ? video.clientWidth : 1280);
    const vh = video.videoHeight || (video.clientHeight > 0 ? video.clientHeight : 720);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(vw, 320);
    canvas.height = Math.max(vh, 240);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Quick score using 320px downscale for burst mode sharpness selection
    const sw = 320;
    const sh = Math.max(1, Math.round(canvas.height * (320 / canvas.width)));
    const sCanvas = document.createElement('canvas');
    sCanvas.width = sw;
    sCanvas.height = sh;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    
    if (!sCtx) return { canvas, score: 0 };
    sCtx.drawImage(canvas, 0, 0, sw, sh);
    const imgData = sCtx.getImageData(0, 0, sw, sh);
    const gray = computeGrayscale(imgData.data, sw, sh);

    const downscaled = downscaleGrayscale(gray, sw, sh, DEFAULT_QUALITY_THRESHOLDS.blurDownscaleMaxSide);
    const score = computeVarianceOfLaplacian(downscaled.data, downscaled.width, downscaled.height);

    return { canvas, score };
  }, []);

  const finishCapture = useCallback((canvas: HTMLCanvasElement) => {
    let toBlobTimeout: number | undefined;

    const handleBlob = (blob: Blob | null) => {
      if (toBlobTimeout !== undefined) {
        window.clearTimeout(toBlobTimeout);
        toBlobTimeout = undefined;
      }
      
      if (!blob) {
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          fetch(dataUrl)
            .then((res) => res.blob())
            .then((b) => {
              const previewUrl = URL.createObjectURL(b);
              stopMediaTracks();
              onCapture(b, previewUrl);
            })
            .catch(() => {
              setIsCapturing(false);
              setError({
                type: 'device',
                title: 'Capture Failed / फोटो नहीं ली जा सकी',
                subtitle: 'Could not create image from camera frame / कैमरा फ्रेम से फोटो नहीं बन सकी।',
              });
            });
          return;
        } catch {
          setIsCapturing(false);
          setError({
            type: 'device',
            title: 'Capture Failed / फोटो नहीं ली जा सकी',
            subtitle: 'Could not create image from camera frame / कैमरा फ्रेम से फोटो नहीं बन सकी।',
          });
          return;
        }
      }

      const previewUrl = URL.createObjectURL(blob);
      stopMediaTracks();
      onCapture(blob, previewUrl);
    };

    if (typeof canvas.toBlob === 'function') {
      let resolved = false;
      canvas.toBlob((b) => {
        if (resolved) return;
        resolved = true;
        handleBlob(b);
      }, 'image/jpeg', 0.92);
      
      toBlobTimeout = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        console.warn('canvas.toBlob timed out, falling back toDataURL');
        handleBlob(null);
      }, 1500);
    } else {
      handleBlob(null);
    }
  }, [onCapture, stopMediaTracks]);

  const endBurst = useCallback(() => {
    if (burstIntervalRef.current) {
      window.clearInterval(burstIntervalRef.current);
      burstIntervalRef.current = null;
    }

    if (burstFramesRef.current.length > 0) {
      setIsCapturing(true);
      const best = burstFramesRef.current.reduce(
        (max, f) => (f.score > max.score ? f : max),
        burstFramesRef.current[0]
      );
      finishCapture(best.canvas);
      burstFramesRef.current = [];
    }
    setIsBursting(false);
  }, [finishCapture]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isLoading || isCapturing || error) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      burstTimeoutRef.current = window.setTimeout(() => {
        setIsBursting(true);
        burstFramesRef.current = [];
        const video = videoRef.current;
        if (video) {
          const frame = captureSingleFrame(video);
          if (frame) burstFramesRef.current.push(frame);
        }

        burstIntervalRef.current = window.setInterval(() => {
          const vid = videoRef.current;
          if (vid && burstFramesRef.current.length < 5) {
            const f = captureSingleFrame(vid);
            if (f) burstFramesRef.current.push(f);
          }
          if (burstFramesRef.current.length >= 5) {
            endBurst();
          }
        }, 150);
      }, 200);
    },
    [isLoading, isCapturing, error, captureSingleFrame, endBurst]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (burstTimeoutRef.current) {
        window.clearTimeout(burstTimeoutRef.current);
        burstTimeoutRef.current = null;
      }

      if (isBursting) {
        endBurst();
      } else {
        const video = videoRef.current;
        if (video && !isCapturing) {
          setIsCapturing(true);
          const frame = captureSingleFrame(video);
          if (frame) {
            finishCapture(frame.canvas);
          } else {
            setIsCapturing(false);
            setError({
              type: 'device',
              title: 'Capture Failed / फोटो नहीं ली जा सकी',
              subtitle: 'Error reading video frame / कैमरा फ्रेम पढ़ने में समस्या आई।',
            });
          }
        }
      }
    },
    [isBursting, isCapturing, captureSingleFrame, finishCapture, endBurst]
  );

  /**
   * Cancel and close camera.
   */
  const handleCancel = useCallback(() => {
    stopMediaTracks();
    onCancel();
  }, [onCancel, stopMediaTracks]);

  /**
   * Fallback to file picker.
   */
  const handleFallback = useCallback(() => {
    stopMediaTracks();
    onFallbackToFile();
  }, [onFallbackToFile, stopMediaTracks]);

  return (
    <div
      className="fixed inset-0 z-[1300] flex flex-col justify-between bg-black text-white select-none animate-in fade-in duration-200"
      data-testid="live-camera-view"
      role="dialog"
      aria-modal="true"
      aria-label="Live camera viewfinder"
    >
      {/* Top Bar: Title & Cancel Button */}
      <div className="relative z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-white">{title}</h2>
            <p className="text-xs text-stone-300 font-hindi">{titleHi}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCancel}
          data-testid="camera-cancel-btn"
          aria-label="Cancel / रद्द करें"
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Center Viewfinder or Error Card */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div
            className="mx-6 max-w-sm rounded-2xl bg-stone-900 border border-stone-800 p-6 text-center shadow-2xl"
            data-testid="camera-error-message"
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">{error.title}</h3>
            <p className="text-xs text-stone-300 mb-6 leading-relaxed">{error.subtitle}</p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleFallback}
                data-testid="camera-fallback-btn"
                className="w-full py-3 px-4 rounded-xl bg-[#EAB308] hover:bg-[#CA8A04] text-stone-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Choose Photo from Files / फाइल से फोटो चुनें</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs transition-colors"
              >
                Cancel / रद्द करें
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Live Video Stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              data-testid="camera-video-preview"
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Studio Framing Guide (Corners) */}
            <div className="pointer-events-none absolute inset-x-8 inset-y-16 max-w-md mx-auto border-2 border-white/20 rounded-3xl flex items-center justify-center">
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#EAB308] rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#EAB308] rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#EAB308] rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#EAB308] rounded-br-2xl" />

              <span className="text-[11px] font-medium tracking-wider uppercase text-white/50 bg-black/40 px-3 py-1 rounded-full backdrop-blur-xs">
                Center Product / वस्तु को बीच में रखें
              </span>
            </div>

            {/* Live Status Indicator */}
            {isBursting ? (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 text-stone-900 shadow-lg animate-pulse font-bold text-sm z-20 pointer-events-none">
                <Camera className="w-4 h-4" />
                <span>Burst Mode / बर्स्ट मोड</span>
              </div>
            ) : liveStatus !== 'none' && !isCapturing && !isLoading ? (
              <div
                className={`absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-lg backdrop-blur-md transition-all z-20 pointer-events-none ${
                  liveStatus === 'good' ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400' :
                  liveStatus === 'shake' ? 'bg-amber-950/80 border-amber-500/50 text-amber-400' :
                  liveStatus === 'dark' ? 'bg-blue-950/80 border-blue-500/50 text-blue-400' :
                  'bg-rose-950/80 border-rose-500/50 text-rose-400'
                }`}
              >
                {liveStatus === 'good' && <Check className="w-4 h-4" />}
                {liveStatus === 'shake' && <AlertCircle className="w-4 h-4" />}
                {liveStatus === 'dark' && <AlertTriangle className="w-4 h-4" />}
                {liveStatus === 'bright' && <Sun className="w-4 h-4" />}
                <span className="text-xs font-medium text-white">
                  {liveStatus === 'good' ? 'Good / अच्छा' :
                   liveStatus === 'shake' ? 'Hold still / हिलाइए मत' :
                   liveStatus === 'dark' ? 'Move to light / रोशनी में जाइए' :
                   'Too bright / बहुत तेज़ रोशनी'}
                </span>
              </div>
            ) : null}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-xs">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-[#EAB308] animate-spin" />
                  <p className="text-xs text-stone-300 font-medium">Starting Camera / कैमरा शुरू हो रहा है...</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="relative z-10 flex items-center justify-around px-6 py-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
        {/* Left: Fallback / Files Button */}
        <div className="w-16 flex justify-center">
          <button
            type="button"
            onClick={handleFallback}
            data-testid="camera-files-btn"
            title="Choose from Files / फाइल से चुनें"
            className="flex flex-col items-center gap-1 text-stone-400 hover:text-white transition-colors active:scale-95"
          >
            <div className="p-2.5 rounded-full bg-white/10 hover:bg-white/20">
              <FolderOpen className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Files</span>
          </button>
        </div>

        {/* Center: Large Shutter Capture Button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            disabled={isLoading || isCapturing || !!error}
            data-testid="camera-capture-btn"
            aria-label="Capture photo / फोटो खींचें"
            className={`relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-white transition-transform ${
              isBursting ? 'scale-110 border-amber-400' : 'active:scale-90'
            } ${
              isLoading || isCapturing || error ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-black/50 ${
              isBursting ? 'bg-amber-400' : 'bg-white hover:bg-amber-100'
            }`}>
              <Camera className={`w-7 h-7 ${isBursting ? 'text-white animate-pulse' : 'text-stone-900'}`} />
            </div>
          </button>
        </div>

        {/* Right: Switch Camera Button (Visible when multiple cameras exist) */}
        <div className="w-16 flex justify-center">
          {availableDevices.length > 1 ? (
            <button
              type="button"
              onClick={handleSwitchCamera}
              disabled={isLoading || isCapturing || !!error}
              data-testid="camera-switch-btn"
              title="Switch Camera / कैमरा बदलें"
              aria-label="Switch Camera / कैमरा बदलें"
              className="flex flex-col items-center gap-1 text-stone-400 hover:text-white transition-colors active:scale-95"
            >
              <div className="p-2.5 rounded-full bg-white/10 hover:bg-white/20">
                <SwitchCamera className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-medium">Flip</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </div>
    </div>
  );
};
