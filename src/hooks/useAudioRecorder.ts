// src/hooks/useAudioRecorder.ts
// Stage 6.2: Extracted shared audio recorder hook for VoiceNoteRecorder and VoiceInputButton.
// Encapsulates MediaRecorder lifecycle, live timer ticks, max duration limits, and error handling.

import { useState, useRef, useEffect, useCallback } from 'react';

export interface VoiceRecorderError {
  title: string;
  subtitle: string;
}

export interface UseAudioRecorderOptions {
  maxDurationSeconds?: number;
  timesliceMs?: number;
  onRecordingComplete?: (blob: Blob, previewUrl: string) => void;
}

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  audioBlob: Blob | null;
  previewUrl: string | null;
  errorInfo: VoiceRecorderError | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
  clearError: () => void;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const { maxDurationSeconds = 60, timesliceMs = 250, onRecordingComplete } = options;

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<VoiceRecorderError | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up timers, streams, and object URLs on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const stopRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('[useAudioRecorder] Error stopping mediaRecorder:', err);
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  const reset = useCallback(() => {
    stopRecording();
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setAudioBlob(null);
    setPreviewUrl(null);
    setElapsedSeconds(0);
    setErrorInfo(null);
    setIsRecording(false);
  }, [previewUrl, stopRecording]);

  const clearError = useCallback(() => {
    setErrorInfo(null);
  }, []);

  const startRecording = async () => {
    reset();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported in this environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Select supported audio mimeType
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || mimeType || 'audio/webm';
        const compiledBlob = new Blob(audioChunksRef.current, { type: finalType });
        const objectUrl = URL.createObjectURL(compiledBlob);

        setAudioBlob(compiledBlob);
        setPreviewUrl(objectUrl);
        setIsRecording(false);

        if (onRecordingComplete) {
          onRecordingComplete(compiledBlob, objectUrl);
        }
      };

      recorder.start(timesliceMs);
      setIsRecording(true);

      // Live timer and max duration enforcement
      let secondsTicked = 0;
      timerIntervalRef.current = setInterval(() => {
        secondsTicked += 1;
        setElapsedSeconds(secondsTicked);

        if (secondsTicked >= maxDurationSeconds) {
          stopRecording();
        }
      }, 1000);
    } catch (err: unknown) {
      const errStr = String(err).toLowerCase();
      const errName = err instanceof Error ? err.name : '';

      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errStr.includes('permission') ||
        errStr.includes('denied')
      ) {
        setErrorInfo({
          title: 'Microphone Access Needed / माइक्रोफ़ोन अनुमति चाहिए',
          subtitle: 'Please allow microphone access in browser or phone settings to record.',
        });
      } else {
        setErrorInfo({
          title: 'Microphone Unavailable / माइक्रोफ़ोन शुरू नहीं हुआ',
          subtitle: 'Could not connect to microphone. Tap below to retry.',
        });
      }

      setIsRecording(false);
    }
  };

  const remainingSeconds = Math.max(0, maxDurationSeconds - elapsedSeconds);

  return {
    isRecording,
    elapsedSeconds,
    remainingSeconds,
    audioBlob,
    previewUrl,
    errorInfo,
    startRecording,
    stopRecording,
    reset,
    clearError,
  };
}
