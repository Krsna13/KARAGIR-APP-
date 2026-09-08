import React, { useState, useEffect } from 'react';
import { Wifi, Battery } from 'lucide-react';

export const MobileStatusBar: React.FC = () => {
  const [time, setTime] = useState('09:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-7 bg-[#120B08] flex items-center justify-between px-5 text-[11px] font-semibold text-slate-300 select-none z-[1001] shrink-0 border-b border-[#2A1E17]/40">
      {/* Time */}
      <span className="font-mono tracking-tight text-white">{time}</span>

      {/* Center Camera Punchhole Mockup */}
      <div className="w-3.5 h-3.5 rounded-full bg-black border border-[#2A1E17] flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A]"></div>
      </div>

      {/* Network & Battery Status Icons */}
      <div className="flex items-center space-x-2 text-slate-300">
        <span className="text-[10px] font-bold text-emerald-400 font-mono">5G</span>
        <Wifi className="w-3.5 h-3.5 text-slate-300" />
        <div className="flex items-center space-x-0.5">
          <span className="text-[9px] font-mono text-slate-400">98%</span>
          <Battery className="w-4 h-4 text-emerald-400 fill-emerald-400/30" />
        </div>
      </div>
    </div>
  );
};
