import React, { useState } from 'react';
import { Mic, Square, RotateCcw, Check, Loader2 } from 'lucide-react';
import { getVoiceAIProvider } from '../../services/voiceAIProvider';

interface VoiceInputProps {
  onTranscriptChange: (transcript: string | null) => void;
}

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'recorded';

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscriptChange }) => {
  const [state, setState] = useState<VoiceState>('idle');
  const [localTranscript, setLocalTranscript] = useState<string>('');

  const handleStartRecording = () => {
    setState('recording');
    setLocalTranscript('');
    onTranscriptChange(null);
  };

  const handleStopRecording = async () => {
    setState('transcribing');
    try {
      const provider = getVoiceAIProvider();
      // Using a mock content:// URI for simulation of audio capture
      const transcript = await provider.transcribeAudio("content://media/external/audio/media/1");
      setLocalTranscript(transcript);
      setState('recorded');
    } catch (e) {
      console.error(e);
      setLocalTranscript("Transcription failed. Please try again or type your requirement.");
      setState('recorded');
    }
  };

  const handleUseRecording = () => {
    onTranscriptChange(localTranscript);
    setState('idle'); // Reset visually after using, or stay recorded. Let's stay recorded but update parent.
  };

  const handleDiscard = () => {
    setState('idle');
    setLocalTranscript('');
    onTranscriptChange(null);
  };

  return (
    <div className="p-4 bg-[#1A120E] border border-[#2A1E17] rounded-xl flex flex-col items-center justify-center space-y-3 transition-all">
      {state === 'idle' && (
        <button
          onClick={handleStartRecording}
          className="flex flex-col items-center justify-center p-4 rounded-full bg-[#EA580C]/10 border border-[#EA580C]/30 hover:bg-[#EA580C]/20 transition-all group"
        >
          <Mic className="w-8 h-8 text-[#EA580C] mb-2 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold text-[#EA580C]">Speak Requirement</span>
        </button>
      )}

      {state === 'recording' && (
        <div className="flex flex-col items-center space-y-3">
          <div className="relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-30"></span>
            <div className="p-4 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center">
               <Mic className="w-8 h-8 text-red-500 animate-pulse" />
            </div>
          </div>
          <span className="text-xs font-bold text-red-400 animate-pulse">Recording...</span>
          <button
            onClick={handleStopRecording}
            className="px-4 py-2 bg-[#120B08] border border-[#2A1E17] rounded-lg text-xs font-bold text-white flex items-center hover:bg-[#261B15] transition-all"
          >
            <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> Stop
          </button>
        </div>
      )}

      {state === 'transcribing' && (
        <div className="flex flex-col items-center space-y-3 py-2">
          <Loader2 className="w-8 h-8 text-[#EA580C] animate-spin" />
          <span className="text-xs font-bold text-[#EA580C]">Transcribing on device...</span>
        </div>
      )}

      {state === 'recorded' && (
        <div className="w-full space-y-3">
          <textarea
            value={localTranscript}
            onChange={(e) => setLocalTranscript(e.target.value)}
            className="w-full p-3 bg-[#120B08] border border-[#2A1E17] focus:border-[#EA580C] rounded-lg text-xs text-white resize-none shadow-inner transition-all"
            rows={3}
          />
          <div className="flex space-x-2">
            <button
              onClick={handleDiscard}
              className="flex-1 px-3 py-2 bg-[#120B08] border border-[#2A1E17] rounded-lg text-xs font-bold text-slate-400 flex items-center justify-center hover:bg-[#261B15] transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Discard
            </button>
            <button
              onClick={handleUseRecording}
              className="flex-1 px-3 py-2 bg-[#EA580C] text-white rounded-lg text-xs font-bold flex items-center justify-center hover:bg-[#F97316] shadow-md transition-all"
            >
              <Check className="w-3.5 h-3.5 mr-1.5" /> Use Voice
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
