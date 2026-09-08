import React, { useState } from 'react';
import { Search, LayoutGrid, List, Play, Star, ShieldCheck, MapPin, Hammer, ArrowRight, Sparkles, User, Store, RotateCcw } from 'lucide-react';
import type { Artisan, CategoryType, LocationPin } from '../types';
import { MOCK_ARTISANS } from '../data/mockData';
import { useKaragirStore } from '../context/KaragirStoreContext';
import { convertStoreToArtisan } from '../utils/artisanConverter';
import { LeafletMap } from './LeafletMap';
import { CategorySection } from './CategorySection';

interface BuyerDiscoveryProps {
  selectedLocation: LocationPin;
  onSelectArtisan: (artisan: Artisan) => void;
  onOpenCustomBuilder: () => void;
  onOpenReel: (artisan: Artisan) => void;
  onOpenFindLocalArtisans?: () => void;
}

export const BuyerDiscovery: React.FC<BuyerDiscoveryProps> = ({
  selectedLocation,
  onSelectArtisan,
  onOpenCustomBuilder,
  onOpenReel,
  onOpenFindLocalArtisans,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtisanPill, setSelectedArtisanPill] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('All');
  const [selectedMaterialTag, setSelectedMaterialTag] = useState<string>('All');
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const materialQuickTags = [
    { id: 'all', label: 'All Materials' },
    { id: 'teak', label: '#SagwanTeak' },
    { id: 'sheesham', label: '#Sheesham' },
    { id: 'brass', label: '#MoradabadBrass' },
    { id: 'clay', label: '#KhurjaClay' },
    { id: 'cane', label: '#AssamCane' }
  ];

  const { allStores } = useKaragirStore();

  const dynamicArtisans = Object.values(allStores || {}).map((store, idx) => convertStoreToArtisan(store, idx));
  const allArtisans = [...MOCK_ARTISANS, ...dynamicArtisans];

  // Filter artisans based on location, artisan search query, category, material tag, and rating
  const filteredArtisans = allArtisans.filter((artisan) => {
    const queryLower = searchQuery.toLowerCase();
    
    // Search by Artisan Name, Workshop / Shop Name, Locality, Pincode, or Specialty
    const matchesSearch =
      queryLower === '' ||
      artisan.name.toLowerCase().includes(queryLower) ||
      artisan.shopName.toLowerCase().includes(queryLower) ||
      artisan.locality.toLowerCase().includes(queryLower) ||
      artisan.pincode.includes(queryLower) ||
      artisan.specialties.some((s) => s.toLowerCase().includes(queryLower));

    // Quick Artisan Pill Filter
    const matchesArtisanPill =
      selectedArtisanPill === 'All' ||
      artisan.name.toLowerCase().includes(selectedArtisanPill.toLowerCase()) ||
      artisan.shopName.toLowerCase().includes(selectedArtisanPill.toLowerCase());

    // Category Filter
    const matchesCategory =
      selectedCategory === 'All' || artisan.crafts.includes(selectedCategory);

    // Material Tag Filter
    const matchesMaterialTag =
      selectedMaterialTag === 'All' ||
      artisan.specialties.some((spec) =>
        spec.toLowerCase().includes(selectedMaterialTag.replace('#', '').toLowerCase())
      ) ||
      artisan.bio.toLowerCase().includes(selectedMaterialTag.replace('#', '').toLowerCase());

    // Minimum Rating Filter
    const matchesRating = artisan.rating >= minRatingFilter;

    // Verified Only Filter
    const matchesVerified = !verifiedOnly || artisan.isVerified;

    return (
      matchesSearch &&
      matchesArtisanPill &&
      matchesCategory &&
      matchesMaterialTag &&
      matchesRating &&
      matchesVerified
    );
  });

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedArtisanPill('All');
    setSelectedCategory('All');
    setSelectedMaterialTag('All');
    setMinRatingFilter(0);
    setVerifiedOnly(false);
  };

  return (
    <div className="space-y-10 pb-16">
      
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden pt-8 pb-12 rounded-3xl bg-gradient-to-b from-[#1F1510] to-[#120B08] border border-[#2A1E17] px-6 sm:px-10 lg:px-12 shadow-2xl">
        <div className="flex flex-col gap-8 items-start w-full">
          
          {/* Hero Left Content */}
          <div className="w-full space-y-6">
            
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 text-[#EAB308] text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Direct from Workshop • Zero Middlemen</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
              Bespoke Craftsmanship, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#EAB308]">
                Crafted Right in Your Area.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
              Connect with Nashik's most skilled independent makers. From hand-turned teak furniture to artisanal pottery, discover the soul behind every object created within minutes of your doorstep.
            </p>

            {/* Primary CTAs */}
            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={() => {
                  if (onOpenFindLocalArtisans) {
                    onOpenFindLocalArtisans();
                  } else {
                    const element = document.getElementById('search-discovery-block');
                    element?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="px-6 py-3.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white font-bold text-sm transition-all shadow-xl glow-orange flex items-center space-x-2"
              >
                <Search className="w-4 h-4" />
                <span>Find Local Artisans</span>
              </button>

              <button
                onClick={onOpenCustomBuilder}
                className="px-6 py-3.5 rounded-xl bg-[#1F1510] hover:bg-[#261B15] text-slate-200 hover:text-white font-semibold text-sm transition-all border border-[#3E2E24] flex items-center space-x-2"
              >
                <Hammer className="w-4 h-4 text-[#EA580C]" />
                <span>Build Custom Request</span>
              </button>
            </div>

            {/* Quick Stats Pill */}
            <div className="pt-4 flex items-center space-x-6 text-xs text-slate-400 border-t border-[#2A1E17]">
              <div>
                <span className="text-white font-bold text-sm block">128+</span>
                Active Workshops
              </div>
              <div className="h-6 w-px bg-[#2A1E17]"></div>
              <div>
                <span className="text-emerald-400 font-bold text-sm block">100% Escrow</span>
                Payment Protection
              </div>
              <div className="h-6 w-px bg-[#2A1E17]"></div>
              <div>
                <span className="text-amber-400 font-bold text-sm block">4.9 ★</span>
                Average Craft Rating
              </div>
            </div>

          </div>

          {/* Hero Right Media Card */}
          <div className="lg:col-span-5">
            <div className="relative group rounded-3xl overflow-hidden border border-[#3E2E24] shadow-2xl bg-[#1F1510]">
              <img
                src={allArtisans[0]?.coverUrl}
                alt="Master Craftsmanship"
                className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-700 opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#120B08] via-black/40 to-transparent"></div>
              
              <button
                onClick={() => onOpenReel(allArtisans[0])}
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#EA580C]/90 hover:bg-[#EA580C] text-white flex items-center justify-center shadow-2xl transition-all hover:scale-110 glow-orange"
              >
                <Play className="w-7 h-7 fill-current ml-1" />
              </button>

              <div className="absolute bottom-4 left-4 right-4 bg-[#1F1510]/90 backdrop-blur-md p-3.5 rounded-2xl border border-[#2A1E17]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-bold text-white">Workshop Reel: Master Craftsmanship</span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-mono">15s Live Feed</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">Lakshya Sharma turning solid teak in Satpur MIDC</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* NEW: Category Discovery Section */}
      <div className="bg-[#1F1510] border border-[#2A1E17] rounded-3xl p-6 sm:p-8 shadow-2xl">
        <CategorySection onCategoryClick={(cat) => {
          setSearchQuery(cat.name);
          const element = document.getElementById('search-discovery-block');
          element?.scrollIntoView({ behavior: 'smooth' });
        }} />
      </div>

      {/* 2. DISCOVERY & SEARCH BLOCK */}
      <section id="search-discovery-block" className="space-y-6">
        <div className="bg-[#1F1510] border border-[#2A1E17] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#2A1E17] pb-4">
            <div>
              <div className="flex items-center space-x-2 text-[#EA580C]">
                <User className="w-5 h-5" />
                <h2 className="text-xl font-extrabold text-white">Find Artisans & Workshops</h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Search by artisan name, studio name, pincode, or product type in {selectedLocation.locality}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-800/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                />
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Karagirs Only</span>
              </label>

              {(searchQuery || selectedArtisanPill !== 'All' || selectedCategory !== 'All' || selectedMaterialTag !== 'All' || minRatingFilter > 0 || verifiedOnly) && (
                <button
                  onClick={resetAllFilters}
                  className="p-2 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-slate-400 hover:text-white text-xs border border-[#2A1E17] transition-colors"
                  title="Reset Search Filters"
                >
                  <RotateCcw className="w-4 h-4 text-[#EA580C]" />
                </button>
              )}
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="relative w-full">
            <Search className="absolute left-4 top-4 w-5 h-5 text-[#EA580C]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Artisan Name (Lakshya Sharma, Rameshwar), Studio (Satpur Teak, Godavari), or Pincode (422007)..."
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#120B08] border border-[#3E2E24] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#EA580C] shadow-inner transition-all"
            />
          </div>

          {/* Quick Artisan Name Selector Pills */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Quick Artisan Workshops:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedArtisanPill('All')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedArtisanPill === 'All'
                    ? 'bg-[#EA580C] text-white shadow-md glow-orange'
                    : 'bg-[#120B08] text-slate-400 border border-[#2A1E17] hover:text-white'
                }`}
              >
                All Workshops ({allArtisans.length})
              </button>

              {allArtisans.map((artisan) => {
                const isSelected = selectedArtisanPill === artisan.name;
                return (
                  <button
                    key={artisan.id}
                    onClick={() => setSelectedArtisanPill(isSelected ? 'All' : artisan.name)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#EA580C] text-white shadow-md glow-orange border border-white/20'
                        : 'bg-[#120B08] text-slate-300 border border-[#2A1E17] hover:border-[#3E2E24] hover:text-white'
                    }`}
                  >
                    <img
                      src={artisan.avatarUrl}
                      alt={artisan.name}
                      className="w-4 h-4 rounded-full object-cover border border-[#EA580C]"
                    />
                    <span>{artisan.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({artisan.locality})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact Craft & Material Pills */}
          <div className="flex flex-col gap-4 pt-2 border-t border-[#2A1E17]/60">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Category Filter:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(['All', 'Woodwork', 'Pottery', 'Brass', 'Cane'] as CategoryType[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                      selectedCategory === cat
                        ? 'bg-[#EA580C] text-white shadow-md'
                        : 'bg-[#120B08] text-slate-400 hover:text-white border border-[#2A1E17]'
                    }`}
                  >
                    #{cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Material Tag Filter:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {materialQuickTags.map((mtag) => (
                  <button
                    key={mtag.id}
                    onClick={() => setSelectedMaterialTag(mtag.label)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                      selectedMaterialTag === mtag.label
                        ? 'bg-[#EA580C] text-white shadow-md glow-orange'
                        : 'bg-[#120B08] text-slate-400 hover:text-white border border-[#2A1E17]'
                    }`}
                  >
                    {mtag.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 3. Clean Interactive Leaflet Radius Map */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Hyper-Local Workshop Map</h2>
            <p className="text-xs text-slate-400">Pinpointing {filteredArtisans.length} local artisan workshops in {selectedLocation.locality}</p>
          </div>
          <span className="text-xs font-semibold text-[#EA580C] bg-[#EA580C]/10 px-3 py-1 rounded-full border border-[#EA580C]/30">
            {filteredArtisans.length} Workplaces Active
          </span>
        </div>

        {/* Rectangular Leaflet Map directly rendered without heavy category boxes */}
        <LeafletMap
          artisans={filteredArtisans}
          selectedLocation={selectedLocation}
          onSelectArtisan={onSelectArtisan}
        />
      </section>

      {/* 4. Local Stores & Artisans Database Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Store className="w-5 h-5 text-[#EA580C]" />
            <h2 className="text-xl font-bold text-white">Local Artisans Directory</h2>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-[#1F1510] border border-[#2A1E17]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-[#EA580C] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-[#EA580C] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className={viewMode === 'grid' ? 'flex flex-col gap-6 w-full' : 'space-y-4'}>
          {filteredArtisans.map((artisan) => (
            <div
              key={artisan.id}
              className="group bg-[#1F1510] border border-[#2A1E17] hover:border-[#EA580C]/60 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between"
            >
              <div>
                {/* Card Cover & Reel Button */}
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={artisan.coverUrl}
                    alt={artisan.shopName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1F1510] via-transparent to-black/30"></div>

                  <button
                    onClick={() => onOpenReel(artisan)}
                    className="absolute top-3 right-3 flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#120B08]/80 hover:bg-[#EA580C] text-white text-[10px] font-semibold backdrop-blur-md transition-colors border border-[#2A1E17]"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Watch Reel</span>
                  </button>

                  <div className="absolute bottom-3 left-3 flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#120B08]/90 text-emerald-400 text-[10px] font-mono border border-emerald-900/50">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    <span>{artisan.distanceKm} km in {artisan.locality}</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={artisan.avatarUrl}
                        alt={artisan.name}
                        className="w-11 h-11 rounded-full object-cover border-2 border-[#EA580C]"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-white group-hover:text-[#EA580C] transition-colors leading-tight">
                          {artisan.shopName}
                        </h3>
                        <p className="text-xs text-slate-400 flex items-center mt-0.5">
                          <span className="text-white font-semibold">{artisan.name}</span>
                          <span className="mx-1">•</span>
                          <span className="text-[10px] text-slate-500">{artisan.experienceYears} Yrs Exp</span>
                        </p>
                      </div>
                    </div>

                    {artisan.isVerified && (
                      <span className="flex items-center text-emerald-400 text-[10px] font-semibold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/50">
                        <ShieldCheck className="w-3 h-3 mr-0.5" />
                        Verified
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs py-1 text-slate-300 border-y border-[#2A1E17]/60">
                    <span className="flex items-center text-amber-400 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
                      {artisan.rating} ({artisan.reviewsCount} reviews)
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {artisan.completedOrdersCount} bespoke builds
                    </span>
                  </div>

                  {/* Specialty Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {artisan.specialties.map((spec, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#120B08] text-slate-300 border border-[#2A1E17]"
                      >
                        #{spec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="p-5 pt-0">
                <button
                  onClick={() => onSelectArtisan(artisan)}
                  className="w-full py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-1.5 group-hover:glow-orange"
                >
                  <span>Request Quote / View Storefront</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          ))}
        </div>

      </section>

    </div>
  );
};
