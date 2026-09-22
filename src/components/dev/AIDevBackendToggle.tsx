import React, { useState } from 'react';
import { Cpu, Cloud } from 'lucide-react';
import { getActiveBackend, toggleDevBackend, type AIBackend } from '../../services/aiRuntimeService';

/**
 * Dev-only debug toggle letting developers manually switch the AI backend
 * between 'cloud' and 'on-device' during local testing.
 * Automatically omitted in production builds.
 */
export const AIDevBackendToggle: React.FC = () => {
  const [backend, setBackend] = useState<AIBackend>(() => getActiveBackend());

  if (!import.meta.env.DEV) {
    return null;
  }

  const handleToggle = () => {
    const next = toggleDevBackend();
    setBackend(next);
  };

  const isOnDevice = backend === 'on-device';

  return (
    <button
      onClick={handleToggle}
      type="button"
      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-all cursor-pointer shadow-sm select-none ${
        isOnDevice
          ? 'bg-purple-950/90 text-purple-300 border-purple-500 hover:bg-purple-900 active:scale-95'
          : 'bg-sky-950/90 text-sky-300 border-sky-500 hover:bg-sky-900 active:scale-95'
      }`}
      title={`[DEV] AI Runtime Backend: ${backend}. Click to toggle.`}
      aria-label={`Toggle AI runtime backend. Current: ${backend}`}
    >
      {isOnDevice ? (
        <Cpu className="w-2.5 h-2.5 text-purple-400 shrink-0" />
      ) : (
        <Cloud className="w-2.5 h-2.5 text-sky-400 shrink-0" />
      )}
      <span className="tracking-tight">AI:{backend}</span>
    </button>
  );
};
