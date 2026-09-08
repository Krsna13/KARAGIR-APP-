import React, { useEffect, useState } from 'react';
import { Cpu, X, Server, ShieldCheck, Smartphone, CheckCircle2 } from 'lucide-react';
import { KaaragirAINative } from '../../services/nativeAIApi';
import type { DeviceCapabilities } from '../../services/nativeAIApi';
import { Capacitor } from '@capacitor/core';

interface OnDeviceAIDebugScreenProps {
  onClose: () => void;
}

export const OnDeviceAIDebugScreen: React.FC<OnDeviceAIDebugScreenProps> = ({ onClose }) => {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const fetchCapabilities = async () => {
      try {
        if (isNative) {
          const caps = await KaaragirAINative.getDeviceCapabilities();
          setCapabilities(caps);
        } else {
           setError("Running in Browser (No Native Bridge)");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    fetchCapabilities();
  }, [isNative]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#120B08] border border-[#EA580C]/50 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#2A1E17] bg-[#1A120E]">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-[#EA580C]" />
            <h3 className="text-sm font-bold text-white tracking-wider">KAARAGIR ON-DEVICE AI</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
           <div className="flex items-center space-x-3 bg-[#1A120E] p-3 rounded-lg border border-[#3E2E24]">
             <ShieldCheck className={`w-6 h-6 ${isNative && capabilities?.bridgeConnected ? 'text-emerald-500' : 'text-slate-500'}`} />
             <div>
               <p className="text-slate-400 uppercase font-bold tracking-widest text-[10px]">Native Bridge</p>
               <p className="font-mono font-bold text-white flex items-center">
                 {isNative && capabilities?.bridgeConnected ? (
                   <><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span> Connected</>
                 ) : (
                   <><span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> Disconnected</>
                 )}
               </p>
             </div>
           </div>

           <div className="space-y-2 border border-[#2A1E17] rounded-lg p-3">
             <div className="flex items-center text-slate-300 pb-2 border-b border-[#2A1E17]">
               <Smartphone className="w-4 h-4 mr-2 text-slate-400" />
               <span className="font-bold">Hardware Target</span>
             </div>
             
             <div className="grid grid-cols-2 gap-y-2 pt-1 font-mono text-[11px]">
               <span className="text-slate-500">Device</span>
               <span className="text-white text-right">{capabilities?.deviceModel || 'N/A'}</span>
               
               <span className="text-slate-500">Android</span>
               <span className="text-white text-right">{capabilities?.androidVersion ? `v${capabilities?.androidVersion}` : 'N/A'}</span>
               
               <span className="text-slate-500">Architecture</span>
               <span className="text-white text-right">{capabilities?.architecture || 'N/A'}</span>
             </div>
           </div>

           <div className="space-y-2 border border-[#2A1E17] rounded-lg p-3">
             <div className="flex items-center text-slate-300 pb-2 border-b border-[#2A1E17]">
               <Server className="w-4 h-4 mr-2 text-slate-400" />
               <span className="font-bold">AI Runtime</span>
             </div>
             
             <div className="grid grid-cols-2 gap-y-2 pt-1 font-mono text-[11px]">
               <span className="text-slate-500">GenieX SDK</span>
               <span className="text-slate-400 text-right italic">Not initialized</span>
               
               <span className="text-slate-500">Qwen3-VL</span>
               <span className="text-slate-400 text-right italic">Not loaded</span>
               
               <span className="text-slate-500">Whisper</span>
               <span className="text-slate-400 text-right italic">Not loaded</span>
               
               <span className="text-slate-500">NPU Status</span>
               <span className="text-slate-400 text-right italic">Not verified</span>
             </div>
           </div>
           
           {error && (
             <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-red-400 font-mono text-[10px]">
               {error}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
