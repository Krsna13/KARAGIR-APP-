import React, { useRef, useState } from 'react';
import { Camera, Trash2, Check } from 'lucide-react';

interface ReferenceImageInputProps {
  onImageChange: (imageUrl: string | null) => void;
}

export const ReferenceImageInput: React.FC<ReferenceImageInputProps> = ({ onImageChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setLocalUrl(url);
      onImageChange(url);
    }
  };

  const handleRemove = () => {
    setLocalUrl(null);
    onImageChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {localUrl ? (
        <div className="bg-[#1A120E] border border-[#EA580C]/40 rounded-xl p-3 flex flex-col space-y-2 relative shadow-inner">
           <img
              src={localUrl}
              alt="Reference"
              className="w-full h-32 object-cover rounded-lg border border-[#3E2E24]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-400 font-mono flex items-center font-bold">
                <Check className="w-3 h-3 mr-1" /> Image Added
              </span>
              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 rounded-md bg-[#120B08] text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-[#2A1E17] transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-full min-h-[100px] border border-dashed border-[#3E2E24] hover:border-[#EA580C]/60 bg-[#1A120E] hover:bg-[#1F1510] rounded-xl flex flex-col items-center justify-center p-4 transition-all group"
        >
          <div className="p-2 bg-[#120B08] rounded-full text-slate-400 group-hover:text-[#EA580C] mb-2 transition-colors">
            <Camera className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-300 group-hover:text-white">Add Reference Image</span>
          <span className="text-[10px] text-slate-500 mt-1 text-center">Upload inspiration for the AI</span>
        </button>
      )}
    </div>
  );
};
