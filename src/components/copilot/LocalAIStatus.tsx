import React from 'react';
import { Cpu } from 'lucide-react';

interface LocalAIStatusProps {
  onClick?: () => void;
}

export const LocalAIStatus: React.FC<LocalAIStatusProps> = ({ onClick }) => {
  return (
    <button 
      onClick={onClick}
      className="flex items-center space-x-2 bg-[#120B08] border border-[#2A1E17] px-3 py-1.5 rounded-full shadow-inner hover:bg-[#1A120E] transition-colors cursor-pointer text-left"
    >
      <div className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EA580C] opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EA580C]"></span>
      </div>
      <Cpu className="w-3.5 h-3.5 text-slate-400" />
      <div className="flex flex-col">
        <span className="text-[9px] font-bold text-white uppercase tracking-wider leading-none">Kaaragir AI</span>
        <span className="text-[8px] text-slate-500 font-mono leading-none mt-0.5">Prototype Mode • Click for Status</span>
      </div>
    </button>
  );
};
