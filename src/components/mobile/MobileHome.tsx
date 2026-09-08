import React, { useState } from 'react';
import {
  Search, Mic, Camera, Sparkles, Star, ShieldCheck, MapPin, Play,
  ArrowRight, Layers, CheckCircle2, ChevronRight
} from 'lucide-react';
import type { Artisan, LocationPin } from '../../types';
import { MOCK_ARTISANS } from '../../data/mockData';
import { useKaragirStore } from '../../context/KaragirStoreContext';
import { convertStoreToArtisan } from '../../utils/artisanConverter';

interface MobileHomeProps {
  selectedLocation: LocationPin;
  onSelectArtisan: (artisan: Artisan) => void;
  onOpenCustomBuilder: () => void;
  onOpenReel: (artisan: Artisan) => void;
  onOpenExplore: () => void;
}

export const MobileHome: React.FC<MobileHomeProps> = ({
  selectedLocation,
  onSelectArtisan,
  onOpenCustomBuilder,
  onOpenReel,
  onOpenExplore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const { allStores } = useKaragirStore();

  const dynamicArtisans = Object.values(allStores || {}).map((store, idx) => convertStoreToArtisan(store, idx));
  const combinedArtisans = [...MOCK_ARTISANS, ...dynamicArtisans];

  const categories = [
    { id: 'All', name: 'All Crafts', icon: '✨' },
    { id: 'Woodwork', name: 'Teak Wood', icon: '🪵' },
    { id: 'Metalwork', name: 'Brass & Bell', icon: '🔔' },
    { id: 'Pottery', name: 'Studio Clay', icon: '🏺' },
    { id: 'Weaving', name: 'Cane & Rattan', icon: '🧺' },
    { id: 'Stonecraft', name: 'White Marble', icon: '🏛️' },
  ];

  const filteredArtisans = combinedArtisans.filter((artisan) => {
    const matchesSearch =
      searchQuery === '' ||
      artisan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artisan.shopName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artisan.specialties.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      activeCategory === 'All' ||
      artisan.crafts.includes(activeCategory as any) ||
      artisan.specialties.some((s) => s.toLowerCase().includes(activeCategory.toLowerCase()));

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4 pb-20 px-3.5 pt-2">
      {/* 1. Mobile Search & Copilot Quick Prompt */}
      <div className="relative">
        <div className="flex items-center space-x-2 p-2 bg-[#1A120E] border border-[#2A1E17] rounded-2xl shadow-lg focus-within:border-[#EA580C] transition-colors">
          <Search className="w-4 h-4 text-[#EA580C] shrink-0 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find artisans, Teak, Moradabad Brass..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
          />
          {/* Quick Voice and Camera Copilot Triggers */}
          <div className="flex items-center space-x-1 shrink-0">
            <button
              onClick={onOpenCustomBuilder}
              className="w-7 h-7 rounded-xl bg-[#261B15] hover:bg-[#EA580C] hover:text-white text-slate-300 flex items-center justify-center transition-colors"
              title="Speak to Craft Copilot"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onOpenCustomBuilder}
              className="w-7 h-7 rounded-xl bg-[#261B15] hover:bg-[#EA580C] hover:text-white text-slate-300 flex items-center justify-center transition-colors"
              title="Snap Sketch for 3D"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Craft Copilot AI Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#26160E] via-[#1A120E] to-[#120B08] border border-[#EA580C]/40 p-4 shadow-xl">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#EA580C]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#EA580C]/20 border border-[#EA580C]/50 text-[10px] font-bold text-[#EA580C]">
              <Sparkles className="w-3 h-3" />
              <span>AI CRAFT COPILOT</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              100% Escrow Protection
            </span>
          </div>

          <div>
            <h2 className="text-base font-black text-white tracking-tight leading-snug">
              Bespoke Craftsmanship, <br />
              <span className="text-[#EA580C]">Crafted Right in Nashik.</span>
            </h2>
            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
              Describe your dream furniture or decor. Our on-device AI designs the 3D model, estimates rates, and matches master crafters.
            </p>
          </div>

          {/* Quick Idea Chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {['Sagwan Teak Table', 'Moradabad Bell Lamp', 'Khurja Pottery Vase'].map((tag) => (
              <button
                key={tag}
                onClick={onOpenCustomBuilder}
                className="text-[10px] px-2.5 py-1 rounded-full bg-[#120B08]/80 hover:bg-[#EA580C]/20 border border-[#2A1E17] hover:border-[#EA580C]/60 text-slate-300 hover:text-white transition-all"
              >
                + {tag}
              </button>
            ))}
          </div>

          {/* Action CTA */}
          <button
            onClick={onOpenCustomBuilder}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#F97316] text-white text-xs font-extrabold flex items-center justify-center space-x-2 shadow-lg shadow-[#EA580C]/20 active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Design Custom Request with AI</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>

      {/* 3. Live Workshop Stories / Reels (Instagram/Android style circular tray) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Workshop Feeds</span>
          </h3>
          <span className="text-[10px] text-slate-400">Tap to watch crafter</span>
        </div>

        <div className="flex items-center space-x-3 overflow-x-auto pb-1.5 no-scrollbar">
          {combinedArtisans.map((artisan) => (
            <button
              key={artisan.id}
              onClick={() => onOpenReel(artisan)}
              className="flex flex-col items-center space-y-1 shrink-0 focus:outline-none group"
            >
              <div className="relative w-15 h-15 rounded-full p-0.5 bg-gradient-to-tr from-[#EA580C] via-[#F97316] to-[#EAB308] group-hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full p-0.5 bg-[#120B08]">
                  <img
                    src={artisan.avatarUrl}
                    alt={artisan.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#EA580C] text-white flex items-center justify-center shadow-sm">
                  <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                </div>
              </div>
              <span className="text-[10px] font-semibold text-slate-300 w-16 truncate text-center">
                {artisan.name.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Craft Categories Horizontal Carousel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
            Raw Material Hubs
          </h3>
          <button
            onClick={onOpenExplore}
            className="text-[10px] text-[#EA580C] hover:underline font-bold flex items-center"
          >
            <span>View All</span>
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-2xl shrink-0 text-xs font-bold border transition-all ${
                  isSelected
                    ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-md shadow-[#EA580C]/20'
                    : 'bg-[#1F1510] text-slate-300 border-[#2A1E17] hover:border-[#3E2E24]'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Nearby Master Artisans Feed */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between px-0.5">
          <div>
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              Workshops in {selectedLocation.locality}
            </h3>
            <p className="text-[10px] text-slate-400">Direct from maker • Zero middlemen markups</p>
          </div>
          <button
            onClick={onOpenExplore}
            className="text-[10px] text-[#EA580C] hover:underline font-bold flex items-center"
          >
            <span>See Map</span>
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>

        <div className="space-y-3">
          {filteredArtisans.slice(0, 5).map((artisan) => (
            <div
              key={artisan.id}
              className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl overflow-hidden shadow-md hover:border-[#EA580C]/60 transition-all"
            >
              {/* Cover Image & Reel Play Button */}
              <div className="relative h-32 w-full overflow-hidden bg-[#120B08]">
                <img
                  src={artisan.coverUrl || artisan.avatarUrl}
                  alt={artisan.shopName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A120E] via-transparent to-black/30" />

                <button
                  onClick={() => onOpenReel(artisan)}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-bold text-white flex items-center space-x-1 hover:bg-[#EA580C] transition-colors"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Watch Reel</span>
                </button>

                <div className="absolute bottom-2 left-3 flex items-center space-x-2">
                  <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-[#1A120E] shadow-md">
                    <img
                      src={artisan.avatarUrl}
                      alt={artisan.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-white flex items-center gap-1">
                      <span>{artisan.name}</span>
                      {artisan.isVerified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
                      )}
                    </h4>
                    <p className="text-[10px] text-slate-300">{artisan.shopName}</p>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center space-x-1 text-[#EAB308] font-bold">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{artisan.rating.toFixed(1)}</span>
                    <span className="text-slate-500 font-normal">({artisan.completedOrdersCount} orders)</span>
                  </span>

                  <span className="flex items-center space-x-1 text-slate-400">
                    <MapPin className="w-3 h-3 text-[#EA580C]" />
                    <span>{artisan.distanceKm} km away • {artisan.locality}</span>
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {artisan.bio}
                </p>

                {/* Specialties chips */}
                <div className="flex flex-wrap gap-1">
                  {artisan.specialties.slice(0, 3).map((spec) => (
                    <span
                      key={spec}
                      className="text-[9px] px-2 py-0.5 rounded-md bg-[#120B08] border border-[#2A1E17] text-slate-300"
                    >
                      {spec}
                    </span>
                  ))}
                </div>

                {/* Card Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#2A1E17]/60">
                  <button
                    onClick={() => onSelectArtisan(artisan)}
                    className="py-2 px-3 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-slate-200 text-[11px] font-bold border border-[#2A1E17] transition-colors flex items-center justify-center space-x-1"
                  >
                    <Layers className="w-3 h-3 text-[#EA580C]" />
                    <span>View Store</span>
                  </button>

                  <button
                    onClick={onOpenCustomBuilder}
                    className="py-2 px-3 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-[11px] font-bold transition-colors flex items-center justify-center space-x-1 shadow-sm"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Custom Quote</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Trust Card: 100% Escrow Protection */}
      <div className="p-3.5 rounded-2xl bg-[#120B08] border border-emerald-900/40 flex items-center space-x-3 shadow-inner">
        <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <h5 className="text-xs font-bold text-white">Karagir Material Gate Guarantee</h5>
          <p className="text-[10px] text-slate-400 leading-tight">
            Escrow payment released only after raw timber / brass passport is verified by live photo check.
          </p>
        </div>
      </div>
    </div>
  );
};
