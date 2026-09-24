// src/components/dev/DevDeviceCheckPage.tsx
// Dev diagnostic test page for device hardware, Capacitor bridge, microphone, camera, and on-device AI.
// Gated by VITE_ENABLE_DEV_TOOLS.

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Cpu,
  Smartphone,
  ShieldCheck,
  Mic,
  Camera,
  Wifi,
  RefreshCw,
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Volume2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { KaaragirAINative } from '../../services/nativeAIApi';
import type { DeviceCapabilities } from '../../services/nativeAIApi';
import { OnDeviceAIDebugScreen } from '../copilot/OnDeviceAIDebugScreen';

export interface DevDeviceCheckPageProps {
  onBack: () => void;
  onNavigateToVoiceInput?: () => void;
}

interface DiagnosticState {
  micStatus: 'untested' | 'testing' | 'granted' | 'denied';
  micError?: string;
  micLevel: number;
  cameraStatus: 'untested' | 'testing' | 'available' | 'unavailable';
  storageStatus: 'ok' | 'error';
  onlineStatus: boolean;
}

export const DevDeviceCheckPage: React.FC<DevDeviceCheckPageProps> = ({
  onBack,
  onNavigateToVoiceInput,
}) => {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState<boolean>(true);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);

  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({
    micStatus: 'untested',
    micLevel: 0,
    cameraStatus: 'untested',
    storageStatus: 'ok',
    onlineStatus: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 1. Fetch Capacitor Bridge / Device Capabilities
  const checkBridgeCapabilities = async () => {
    setBridgeLoading(true);
    setBridgeError(null);
    try {
      if (isNative) {
        const caps = await KaaragirAINative.getDeviceCapabilities();
        setCapabilities(caps);
      } else {
        setCapabilities({
          bridgeConnected: false,
          platform: 'web',
          architecture: 'browser-emulated',
          deviceModel: navigator.userAgent.slice(0, 30),
          androidVersion: 'N/A (Web)',
          runtime: 'V8 / Browser Engine',
          npuAvailable: false,
          gpuAvailable: true,
        });
      }
    } catch (err) {
      setBridgeError(err instanceof Error ? err.message : String(err));
    } finally {
      setBridgeLoading(false);
    }
  };

  useEffect(() => {
    checkBridgeCapabilities();
  }, []);

  // 2. Test Microphone & Audio Input Stream
  const testMicrophone = async () => {
    setDiagnostics(prev => ({ ...prev, micStatus: 'testing', micError: undefined }));

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia not supported on this browser/webview');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setDiagnostics(prev => ({ ...prev, micStatus: 'granted' }));

      // Monitor audio level
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setDiagnostics(prev => ({ ...prev, micLevel: normalized }));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      setDiagnostics(prev => ({
        ...prev,
        micStatus: 'denied',
        micError: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  // 3. Test Camera Availability
  const testCamera = async () => {
    setDiagnostics(prev => ({ ...prev, cameraStatus: 'testing' }));
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInput = devices.some(d => d.kind === 'videoinput');
        setDiagnostics(prev => ({ ...prev, cameraStatus: videoInput ? 'available' : 'unavailable' }));
      } else {
        setDiagnostics(prev => ({ ...prev, cameraStatus: 'unavailable' }));
      }
    } catch {
      setDiagnostics(prev => ({ ...prev, cameraStatus: 'unavailable' }));
    }
  };

  // Clean up audio streams on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="min-h-full bg-[#120B08] text-white flex flex-col font-sans">
      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-[#120B08]/95 backdrop-blur-md border-b border-[#2A1E17] px-4 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl text-stone-400 hover:text-white hover:bg-[#2A1E17]/60 transition-colors flex items-center space-x-1"
          aria-label="Back to home"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-semibold">Back</span>
        </button>
        <div className="flex flex-col items-center">
          <div className="flex items-center space-x-1.5">
            <Cpu className="w-4 h-4 text-[#EA580C]" />
            <h1 className="text-sm font-bold text-white tracking-wide">Device Check</h1>
          </div>
          <span className="text-[10px] text-[#EA580C] font-mono font-bold tracking-wider">
            /dev/device-check
          </span>
        </div>
        <button
          onClick={checkBridgeCapabilities}
          className="p-2 -mr-2 rounded-xl text-stone-400 hover:text-white hover:bg-[#2A1E17]/60 transition-colors"
          title="Refresh diagnostics"
        >
          <RefreshCw className={`w-4 h-4 ${bridgeLoading ? 'animate-spin text-[#EA580C]' : ''}`} />
        </button>
      </div>

      {/* Notice Banner */}
      <div className="px-4 pt-3 pb-1">
        <div className="p-2.5 rounded-xl bg-[#1A120E] border border-[#EA580C]/30 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold text-stone-300">VITE_ENABLE_DEV_TOOLS Active</span>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#2A1E17] text-[#EA580C] font-bold">
            {platform.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main Content Sections */}
      <div className="p-4 space-y-4 flex-1">
        {/* Section 1: Native Bridge & Platform Status */}
        <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#2A1E17] pb-2">
            <div className="flex items-center space-x-2">
              <ShieldCheck className={`w-5 h-5 ${isNative && capabilities?.bridgeConnected ? 'text-emerald-500' : 'text-[#EA580C]'}`} />
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-300">Capacitor Native Bridge</h2>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
              isNative ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' : 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
            }`}>
              {isNative ? 'NATIVE APK' : 'BROWSER WEB'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17]">
              <span className="text-stone-500 text-[10px] block">Bridge Status</span>
              <span className="text-white font-bold flex items-center mt-1">
                {isNative && capabilities?.bridgeConnected ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mr-1" />
                    Connected
                  </>
                ) : isNative ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 mr-1" />
                    Plugin Missing
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5 text-amber-400 mr-1" />
                    Web Simulator
                  </>
                )}
              </span>
            </div>

            <div className="bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17]">
              <span className="text-stone-500 text-[10px] block">Platform Type</span>
              <span className="text-white font-bold block mt-1 capitalize">{platform}</span>
            </div>
          </div>

          {bridgeError && (
            <div className="p-2.5 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-[11px] font-mono">
              {bridgeError}
            </div>
          )}
        </div>

        {/* Section 2: Hardware Specifications */}
        <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#2A1E17] pb-2">
            <div className="flex items-center space-x-2">
              <Smartphone className="w-5 h-5 text-stone-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-300">Device Hardware Specs</h2>
            </div>
            <button
              onClick={() => setShowAiModal(true)}
              className="text-[10px] text-[#EA580C] font-semibold hover:underline flex items-center space-x-1"
            >
              <span>AI Modal</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-[#2A1E17]/60">
              <span className="text-stone-500">Device Model</span>
              <span className="text-white text-right font-medium">{capabilities?.deviceModel || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2A1E17]/60">
              <span className="text-stone-500">OS Version</span>
              <span className="text-white text-right font-medium">
                {capabilities?.androidVersion ? `Android ${capabilities.androidVersion}` : 'Web OS'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#2A1E17]/60">
              <span className="text-stone-500">Architecture</span>
              <span className="text-white text-right font-medium">{capabilities?.architecture || 'Unknown'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-stone-500">NPU Acceleration</span>
              <span className={`text-right font-medium ${capabilities?.npuAvailable ? 'text-emerald-400' : 'text-stone-400'}`}>
                {capabilities?.npuAvailable ? 'Available' : 'CPU / Emulated'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Media & Sensor Test (Microphone & Camera) */}
        <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#2A1E17] pb-2">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-amber-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-300">Hardware Sensor Tests</h2>
            </div>
          </div>

          {/* Microphone Test */}
          <div className="bg-[#120B08] p-3 rounded-xl border border-[#2A1E17] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-[#EA580C]" />
                <span className="text-xs font-bold text-white">Microphone Input</span>
              </div>
              <button
                onClick={testMicrophone}
                disabled={diagnostics.micStatus === 'testing'}
                className="px-2.5 py-1 bg-[#EA580C] hover:bg-[#EA580C]/80 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold tracking-wide"
              >
                {diagnostics.micStatus === 'granted' ? 'Re-Test Mic' : 'Test Microphone'}
              </button>
            </div>

            {diagnostics.micStatus === 'granted' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span className="flex items-center space-x-1">
                    <Volume2 className="w-3 h-3 text-emerald-400" />
                    <span>Live Input Level</span>
                  </span>
                  <span className="font-mono text-emerald-400">{diagnostics.micLevel}%</span>
                </div>
                <div className="w-full bg-[#2A1E17] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-75"
                    style={{ width: `${diagnostics.micLevel}%` }}
                  />
                </div>
              </div>
            )}

            {diagnostics.micError && (
              <p className="text-[10px] font-mono text-red-400 pt-1">{diagnostics.micError}</p>
            )}
          </div>

          {/* Camera Test */}
          <div className="bg-[#120B08] p-3 rounded-xl border border-[#2A1E17] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Camera className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-xs font-bold text-white block">Camera Sensor</span>
                <span className="text-[10px] text-stone-400">
                  {diagnostics.cameraStatus === 'untested'
                    ? 'Not tested yet'
                    : diagnostics.cameraStatus === 'available'
                    ? 'Sensor detected'
                    : 'Camera unavailable'}
                </span>
              </div>
            </div>
            <button
              onClick={testCamera}
              disabled={diagnostics.cameraStatus === 'testing'}
              className="px-2.5 py-1 bg-[#2A1E17] hover:bg-[#3E2E24] text-white rounded-lg text-[10px] font-bold tracking-wide"
            >
              Check Camera
            </button>
          </div>

          {/* Network & Storage */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            <div className="bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17] flex items-center space-x-2">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-stone-500 text-[9px] block">Network</span>
                <span className="text-white text-[11px] font-bold">
                  {diagnostics.onlineStatus ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
            <div className="bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17] flex items-center space-x-2">
              <Server className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-stone-500 text-[9px] block">Storage</span>
                <span className="text-white text-[11px] font-bold">Ready</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Quick Navigation to /dev/voice-input */}
        <div className="bg-gradient-to-br from-[#EA580C]/20 to-[#1A120E] border border-[#EA580C]/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-white">Voice Input Test Suite</h3>
              <p className="text-[11px] text-stone-300">
                Interactive voice testing across text, price, dimensions, and technique.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (onNavigateToVoiceInput) {
                onNavigateToVoiceInput();
              } else {
                window.location.hash = '/dev/voice-input';
              }
            }}
            className="w-full mt-2 py-2.5 bg-[#EA580C] hover:bg-[#EA580C]/90 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-colors shadow-lg shadow-[#EA580C]/20 flex items-center justify-center space-x-2"
          >
            <Mic className="w-4 h-4" />
            <span>Open /dev/voice-input</span>
          </button>
        </div>
      </div>

      {/* Optional Full On-Device AI Debug Screen Modal */}
      {showAiModal && (
        <OnDeviceAIDebugScreen onClose={() => setShowAiModal(false)} />
      )}
    </div>
  );
};
