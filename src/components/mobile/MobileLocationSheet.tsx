import React, { useState } from 'react';
import { MapPin, X, Check, Search } from 'lucide-react';
import type { LocationPin } from '../../types';
import { NASHIK_LOCALITIES } from '../../data/mockData';

interface MobileLocationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation: LocationPin;
  onSelectLocation: (loc: LocationPin) => void;
}

export const MobileLocationSheet: React.FC<MobileLocationSheetProps> = ({
  isOpen,
  onClose,
  selectedLocation,
  onSelectLocation,
}) => {
  const [filterQuery, setFilterQuery] = useState('');

  if (!isOpen) return null;

  const filteredLocalities = NASHIK_LOCALITIES.filter((loc) =>
    loc.locality.toLowerCase().includes(filterQuery.toLowerCase()) ||
    loc.pincode.includes(filterQuery)
  );

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-fade-in">
      {/* Backdrop click to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet Container */}
      <div className="relative w-full max-w-md mx-auto bg-[#1A120E] border-t border-[#3E2E24] rounded-t-3xl shadow-2xl overflow-hidden pb-8 max-h-[80vh] flex flex-col">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-[#3E2E24]" />
        </div>

        {/* Sheet Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A1E17]">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-[#EA580C]/20 border border-[#EA580C]/40 flex items-center justify-center text-[#EA580C]">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">Select Artisan Hub</h3>
              <p className="text-[10px] text-slate-400">Nashik District Workshops</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1F1510] border border-[#2A1E17] flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search inside sheet */}
        <div className="p-4 border-b border-[#2A1E17]/60">
          <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-xs text-white">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search locality or pincode..."
              className="w-full bg-transparent focus:outline-none placeholder-slate-500 text-xs"
            />
            {filterQuery && (
              <button onClick={() => setFilterQuery('')} className="text-slate-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Localities List */}
        <div className="overflow-y-auto px-4 py-2 space-y-1.5 custom-scrollbar">
          {filteredLocalities.map((loc) => {
            const isSelected = selectedLocation.pincode === loc.pincode;
            return (
              <button
                key={loc.pincode}
                onClick={() => {
                  onSelectLocation(loc);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left ${
                  isSelected
                    ? 'bg-[#EA580C]/15 border border-[#EA580C] text-white shadow-sm'
                    : 'bg-[#1F1510] border border-[#2A1E17] text-slate-300 hover:bg-[#261B15]'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isSelected ? 'bg-[#EA580C] text-white' : 'bg-[#120B08] text-slate-400'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block">{loc.locality}</span>
                    <span className="text-[10px] text-slate-400 font-mono">Pincode: {loc.pincode}</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-[#EA580C] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
