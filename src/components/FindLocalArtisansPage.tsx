import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MapPin,
  Star,
  ShieldCheck,
  Phone,
  Copy,
  Check,
  Eye,
  Crosshair,
  Filter,
  LayoutGrid,
  List,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
  Clock,
  Briefcase,
  ChevronDown
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  regionalArtisansDatabase,
  CITY_MAP_CENTERS,
  CITY_AREAS_MAP,
  type RegionalArtisan
} from '../data/regionalArtisansDatabase';
import { useKaragirStore } from '../context/KaragirStoreContext';
import { convertStoreToRegionalArtisan } from '../utils/artisanConverter';

// Custom Leaflet Pin generator matching Image 1: Orange Circle with White Hammer Icon
const createArtisanPinIcon = (isHovered: boolean, isVerified: boolean) => {
  const pinColor = isHovered ? '#EAB308' : '#EA580C';
  const zIndex = isHovered ? 9999 : 100;
  
  return L.divIcon({
    className: 'custom-artisan-pin',
    html: `
      <div style="position: relative; z-index: ${zIndex}; cursor: pointer;">
        <div style="
          width: ${isHovered ? '32px' : '26px'};
          height: ${isHovered ? '32px' : '26px'};
          border-radius: 50%;
          background-color: ${pinColor};
          border: 2px solid #ffffff;
          box-shadow: 0 0 ${isHovered ? '20px #EAB308' : '12px #EA580C'};
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="${isHovered ? '16' : '13'}" height="${isHovered ? '16' : '13'}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 12-8.373 8.373a1 1 0 1 1-1.414-1.414L13.586 10.586a1 1 0 0 0 0-1.414l-2.172-2.172a1 1 0 0 1 0-1.414l1.414-1.414a1 1 0 0 1 1.414 0l4.243 4.243a1 1 0 0 1 0 1.414L17 11"/>
          </svg>
        </div>
        ${isVerified ? '<div style="position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background-color: #10B981; border: 1.5px solid #0F172A;"></div>' : ''}
        ${
          !isHovered ? `
          <div style="
            position: absolute;
            top: -4px;
            left: -4px;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background-color: rgba(234, 88, 12, 0.25);
            animation: pulse-ring 2s infinite ease-in-out;
            pointer-events: none;
          "></div>` : ''
        }
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Map Viewport FlyTo Helper Component
const MapFlyToController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
};

interface FindLocalArtisansPageProps {
  onBackToHome?: () => void;
  onSelectArtisanStorefront?: (artisan: RegionalArtisan) => void;
}

export const FindLocalArtisansPage: React.FC<FindLocalArtisansPageProps> = ({
  onBackToHome,
  onSelectArtisanStorefront,
}) => {
  // State variables
  const [selectedCity, setSelectedCity] = useState<'Nashik' | 'Pune' | 'Mumbai'>('Nashik');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCraftTag, setSelectedCraftTag] = useState<string>('All');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Interactivity States
  const [hoveredArtisanId, setHoveredArtisanId] = useState<string | null>(null);
  const [selectedArtisanForModal, setSelectedArtisanForModal] = useState<RegionalArtisan | null>(null);
  const [mapTargetCenter, setMapTargetCenter] = useState<[number, number]>([
    CITY_MAP_CENTERS['Nashik'].lat,
    CITY_MAP_CENTERS['Nashik'].lng,
  ]);
  const [mapTargetZoom, setMapTargetZoom] = useState<number>(CITY_MAP_CENTERS['Nashik'].zoom);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Craft Tag Quick Chips
  const craftTags = [
    { label: '#All', value: 'All' },
    { label: '#Woodwork', value: 'Wood' },
    { label: '#Brasscraft', value: 'Brass' },
    { label: '#Textiles', value: 'Textile' },
    { label: '#Pottery', value: 'Decor' },
    { label: '#Furniture', value: 'Furniture' },
    { label: '#MetalArt', value: 'Metal' },
  ];

  // Reset area and fly map when city changes
  const handleCityChange = (city: 'Nashik' | 'Pune' | 'Mumbai') => {
    setSelectedCity(city);
    setSelectedArea('All');
    const cityData = CITY_MAP_CENTERS[city];
    setMapTargetCenter([cityData.lat, cityData.lng]);
    setMapTargetZoom(cityData.zoom);
  };

  // Fly map to specific artisan
  const handleLocateArtisanOnMap = (artisan: RegionalArtisan) => {
    setMapTargetCenter([artisan.lat, artisan.lng]);
    setMapTargetZoom(15);
    setHoveredArtisanId(artisan.id);
  };

  // Combine static and dynamic artisans
  const { allStores } = useKaragirStore();

  const allRegionalArtisans = useMemo(() => {
    const dynamicArtisans = Object.values(allStores || {}).map((store, idx) => convertStoreToRegionalArtisan(store, idx));
    return [...regionalArtisansDatabase, ...dynamicArtisans];
  }, [allStores]);

  // Filter Logic
  const filteredArtisans = useMemo(() => {
    return allRegionalArtisans.filter((artisan) => {
      // 1. City Filter
      if (artisan.city !== selectedCity) return false;

      // 2. Area Filter
      if (selectedArea !== 'All' && artisan.area !== selectedArea) return false;

      // 3. Verified Filter
      if (verifiedOnly && !artisan.isVerified) return false;

      // 4. Availability Filter
      if (availableOnly && artisan.availability !== 'Available Now') return false;

      // 5. Craft Tag Filter
      if (selectedCraftTag !== 'All') {
        const tagLower = selectedCraftTag.toLowerCase();
        const categoryLower = artisan.craftCategory.toLowerCase();
        const bioLower = artisan.bio.toLowerCase();
        if (!categoryLower.includes(tagLower) && !bioLower.includes(tagLower)) return false;
      }

      // 6. Real-time Search Query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = artisan.name.toLowerCase().includes(q);
        const matchesShop = artisan.shopName.toLowerCase().includes(q);
        const matchesCraft = artisan.craftCategory.toLowerCase().includes(q);
        const matchesArea = artisan.area.toLowerCase().includes(q);
        const matchesPincode = artisan.pincode.includes(q);
        const matchesAddress = artisan.address.toLowerCase().includes(q);

        if (
          !matchesName &&
          !matchesShop &&
          !matchesCraft &&
          !matchesArea &&
          !matchesPincode &&
          !matchesAddress
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allRegionalArtisans, selectedCity, selectedArea, verifiedOnly, availableOnly, selectedCraftTag, searchQuery]);

  const handleCopyPhone = (id: string, mobileNo: string) => {
    navigator.clipboard.writeText(mobileNo);
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  const handleResetFilters = () => {
    setSelectedArea('All');
    setSearchQuery('');
    setSelectedCraftTag('All');
    setVerifiedOnly(false);
    setAvailableOnly(false);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white selection:bg-[#EA580C] selection:text-white font-sans pb-20">
      
      {/* ========================================================================= */}
      {/* 1. STICKY DEDICATED NAVIGATION & HEADER BAR */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-50 bg-[#0F172A]/95 backdrop-blur-xl border-b border-[#1E293B] shadow-2xl">
        <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-10 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Brand Logo & Back Option */}
          <div className="flex items-center space-x-4 shrink-0">
            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                className="px-3.5 py-2 rounded-xl bg-[#1F1510] hover:bg-[#2A1E17] text-slate-200 hover:text-white border border-[#3E2E24] transition-all flex items-center gap-2 text-xs font-bold shadow-md group"
                title="Back to Home"
              >
                <ArrowLeft className="w-4 h-4 text-[#EA580C] group-hover:-translate-x-1 transition-transform" />
                <span>← Back to Home</span>
              </button>
            )}
            <div className="flex items-center space-x-2">
              <Compass className="w-6 h-6 text-[#EA580C]" />
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
                karagir<span className="text-[#EA580C]">.</span>
                <span className="text-xs font-mono font-normal text-slate-400 normal-case ml-2.5 hidden sm:inline-block border-l border-slate-700 pl-2.5">
                  Find Local Artisans Directory
                </span>
              </h1>
            </div>
          </div>

          {/* City Selector Dropdown & Search Input Bar */}
          <div className="flex flex-1 max-w-3xl items-center gap-3 w-full">
            {/* City Selector Dropdown */}
            <div className="relative shrink-0">
              <select
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value as 'Nashik' | 'Pune' | 'Mumbai')}
                className="bg-[#1F1510] border-2 border-[#EA580C]/70 text-white text-xs sm:text-sm font-bold py-2.5 px-3.5 pr-8 rounded-xl focus:outline-none focus:border-[#EA580C] shadow-lg cursor-pointer appearance-none"
              >
                <option value="Nashik">📍 Nashik (73.78° E)</option>
                <option value="Pune">📍 Pune (73.85° E)</option>
                <option value="Mumbai">📍 Mumbai (72.87° E)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-[#EA580C] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Real-Time Search Bar */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Artisan Name, Shop, Craft, Locality, or Pincode (e.g. 422003)..."
                className="w-full bg-[#1F1510] border border-[#3E2E24] focus:border-[#EA580C] text-white text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl placeholder-slate-500 focus:outline-none transition-colors shadow-inner font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Direct CTA Badge */}
          <div className="hidden xl:flex items-center space-x-2 text-xs font-mono text-emerald-400 bg-emerald-950/70 px-3 py-1.5 rounded-xl border border-emerald-800/60 font-bold shrink-0 shadow">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>75 Active Regional Makers</span>
          </div>

        </div>

        {/* Local Area & Material Filter Pills Sub-Bar */}
        <div className="bg-[#121A2D] border-t border-[#1E293B] px-4 sm:px-6 lg:px-10 py-2.5 flex items-center justify-between gap-4 overflow-x-auto custom-scrollbar">
          {/* Area Chips */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Locality:</span>
            <button
              onClick={() => setSelectedArea('All')}
              className={`text-xs px-3 py-1 rounded-lg font-bold transition-all ${
                selectedArea === 'All'
                  ? 'bg-[#EA580C] text-white shadow'
                  : 'bg-[#1F1510] text-slate-300 hover:bg-[#2A1E17] border border-[#3E2E24]'
              }`}
            >
              All Areas ({CITY_AREAS_MAP[selectedCity].length})
            </button>
            {CITY_AREAS_MAP[selectedCity].map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`text-xs px-3 py-1 rounded-lg font-semibold transition-all ${
                  selectedArea === area
                    ? 'bg-[#EA580C] text-white shadow'
                    : 'bg-[#1F1510] text-slate-300 hover:bg-[#2A1E17] border border-[#3E2E24]'
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          {/* Craft Quick Tag Pills */}
          <div className="flex items-center space-x-1.5 shrink-0 border-l border-slate-700 pl-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Craft:</span>
            {craftTags.map((tag) => (
              <button
                key={tag.value}
                onClick={() => setSelectedCraftTag(tag.value)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                  selectedCraftTag === tag.value
                    ? 'bg-[#EAB308] text-slate-900 font-bold shadow'
                    : 'bg-[#0F172A] text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-10 pt-6 space-y-6">

        {/* ========================================================================= */}
        {/* 2. INTERACTIVE RECTANGULAR MAP CONTAINER (MATCHING IMAGE 1 & IMAGE 3) */}
        {/* ========================================================================= */}
        <section className="relative w-full h-[420px] sm:h-[500px] rounded-3xl overflow-hidden border-2 border-[#3E2E24] shadow-2xl bg-[#0c0806] group">
          
          {/* Top-Left Header Overlay (Separated from Leaflet + / - zoom control buttons at left-4) */}
          <div className="absolute top-4 left-16 sm:left-20 z-[400] bg-[#120B08]/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-[#3E2E24] shadow-2xl pointer-events-none">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug">
              Hyper-Local Workshop Map
            </h3>
            <p className="text-[11px] text-[#EA580C] font-semibold">
              Pinpointing {filteredArtisans.length} local artisan workshops in {selectedArea !== 'All' ? selectedArea : `${selectedCity} Area`}
            </p>
          </div>

          {/* Top-Right Badge Overlay (Image 1) */}
          <div className="absolute top-4 right-4 z-[400] bg-[#1F1510]/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#EA580C]/50 text-xs font-mono font-extrabold text-[#EA580C] shadow-2xl pointer-events-none flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-pulse"></span>
            <span>{filteredArtisans.length} Workplaces Active</span>
          </div>

          {/* Map Container */}
          <MapContainer
            center={mapTargetCenter}
            zoom={mapTargetZoom}
            scrollWheelZoom={false}
            className="w-full h-full bg-[#0c0806]"
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <MapFlyToController center={mapTargetCenter} zoom={mapTargetZoom} />

            {/* 5km Radius Dashed Orange Circle (Image 1) */}
            <Circle
              center={mapTargetCenter}
              radius={5000}
              pathOptions={{
                color: '#EA580C',
                fillColor: '#EA580C',
                fillOpacity: 0.12,
                weight: 2,
                dashArray: '6, 8',
              }}
            />

            {/* Glowing Artisan Pins (Orange Circle + Hammer Icon) */}
            {filteredArtisans.map((artisan) => {
              const isHovered = hoveredArtisanId === artisan.id;
              return (
                <Marker
                  key={artisan.id}
                  position={[artisan.lat, artisan.lng]}
                  icon={createArtisanPinIcon(isHovered, artisan.isVerified)}
                  eventHandlers={{
                    mouseover: () => setHoveredArtisanId(artisan.id),
                    mouseout: () => setHoveredArtisanId(null),
                  }}
                >
                  {/* Rectangle Short Detail Popup (Clicking pin opens rectangle popup, clicking popup opens Image 3 Modal) */}
                  <Popup className="dark-popup">
                    <div
                      onClick={() => setSelectedArtisanForModal(artisan)}
                      className="p-3 bg-[#1F1510] hover:bg-[#261B15] cursor-pointer transition-colors space-y-2 text-white min-w-[240px]"
                      title="Click to view full workshop profile card"
                    >
                      <div className="flex items-center space-x-3">
                        <img
                          src={artisan.image}
                          alt={artisan.name}
                          className="w-12 h-12 rounded-xl object-cover border-2 border-[#EA580C] shrink-0"
                        />
                        <div className="overflow-hidden">
                          <h4 className="text-xs font-extrabold text-white leading-tight truncate">{artisan.name}</h4>
                          <p className="text-[11px] font-bold text-[#EA580C] truncate">{artisan.shopName}</p>
                          <p className="text-[10px] text-slate-400 truncate">📍 {artisan.area}, {artisan.city}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-[#3E2E24]">
                        <span className="px-2 py-0.5 rounded bg-[#EA580C]/20 text-[#EA580C] border border-[#EA580C]/40 font-extrabold">
                          {artisan.craftCategory}
                        </span>
                        <span className="text-emerald-400 font-extrabold flex items-center">
                          ★ {artisan.rating.toFixed(1)}
                        </span>
                      </div>

                      <div className="w-full py-1.5 px-3 rounded-lg bg-[#EA580C] hover:bg-[#F97316] text-white text-[11px] font-extrabold transition-all shadow flex items-center justify-center space-x-1 mt-1">
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Full Workshop Card</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Bottom-Left Overlay Badge (Image 1) */}
          <div className="absolute bottom-4 left-4 z-[400] bg-[#1F1510]/95 backdrop-blur-xl border border-[#3E2E24] px-4 py-2.5 rounded-2xl flex items-center space-x-3 shadow-2xl pointer-events-none">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping shrink-0"></div>
            <div>
              <p className="text-xs font-bold text-white">
                {filteredArtisans.length} Verified Karagirs Active
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                Within 5km radius of {selectedArea !== 'All' ? selectedArea : selectedCity}
              </p>
            </div>
          </div>

        </section>

        {/* ========================================================================= */}
        {/* 3. FILTER CONTROLS & RESULTS COUNTER BAR */}
        {/* ========================================================================= */}
        <div className="bg-[#1F1510] p-4 rounded-2xl border border-[#3E2E24] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          
          {/* Active Results Counter */}
          <div className="flex items-center space-x-3">
            <span className="text-sm font-extrabold text-white">
              Showing <strong className="text-[#EA580C]">{filteredArtisans.length}</strong> Karigars in {selectedCity}
              {selectedArea !== 'All' ? ` (${selectedArea})` : ''}
            </span>
            {filteredArtisans.length !== allRegionalArtisans.length && (
              <button
                onClick={handleResetFilters}
                className="text-xs text-[#EA580C] hover:underline flex items-center gap-1 font-semibold"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          {/* Filter Toggles */}
          <div className="flex items-center space-x-4 text-xs font-semibold">
            {/* Verified Filter Switch */}
            <label className="flex items-center space-x-2 cursor-pointer bg-[#120B08] px-3 py-1.5 rounded-xl border border-[#2A1E17] hover:border-[#15803D] transition-colors">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="accent-[#15803D] w-4 h-4 rounded cursor-pointer"
              />
              <span className="flex items-center text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-500 mr-1" />
                Verified Karagirs Only
              </span>
            </label>

            {/* Availability Filter Switch */}
            <label className="flex items-center space-x-2 cursor-pointer bg-[#120B08] px-3 py-1.5 rounded-xl border border-[#2A1E17] hover:border-[#EA580C] transition-colors">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="accent-[#EA580C] w-4 h-4 rounded cursor-pointer"
              />
              <span className="flex items-center text-slate-200">
                <Clock className="w-4 h-4 text-[#EA580C] mr-1" />
                Available Now
              </span>
            </label>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-[#120B08] p-1 rounded-xl border border-[#2A1E17]">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-[#EA580C] text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'list' ? 'bg-[#EA580C] text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>

        {/* ========================================================================= */}
        {/* 4. ARTISAN PROFILE CARDS GRID / LIST VIEW */}
        {/* ========================================================================= */}
        {filteredArtisans.length > 0 ? (
          <div
            className={
              viewMode === 'grid'
                ? 'flex flex-col gap-6 w-full'
                : 'space-y-4'
            }
          >
            {filteredArtisans.map((artisan) => {
              const isHovered = hoveredArtisanId === artisan.id;

              return (
                <motion.div
                  key={artisan.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  onMouseEnter={() => setHoveredArtisanId(artisan.id)}
                  onMouseLeave={() => setHoveredArtisanId(null)}
                  className={`bg-[#1F1510] rounded-3xl overflow-hidden border transition-all duration-300 shadow-xl flex flex-col justify-between ${
                    isHovered
                      ? 'border-[#EAB308] ring-2 ring-[#EAB308]/40 -translate-y-1 shadow-2xl'
                      : 'border-[#3E2E24] hover:border-[#EA580C]/70'
                  }`}
                >
                  {/* Top Image Header */}
                  <div className="relative h-48 overflow-hidden group">
                    <img
                      src={artisan.image}
                      alt={artisan.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1F1510] via-transparent to-black/30"></div>

                    {/* Verified Badge */}
                    {artisan.isVerified && (
                      <div className="absolute top-3 left-3 bg-[#15803D] text-white text-[10px] font-mono font-extrabold px-2.5 py-1 rounded-full shadow-lg flex items-center space-x-1 border border-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Verified Karagir</span>
                      </div>
                    )}

                    {/* Rating Badge */}
                    <div className="absolute top-3 right-3 bg-[#120B08]/90 backdrop-blur-md text-amber-400 text-xs font-extrabold px-2.5 py-1 rounded-xl border border-amber-500/40 shadow-lg flex items-center space-x-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{artisan.rating.toFixed(1)}</span>
                    </div>

                    {/* Availability Tag */}
                    <div className="absolute bottom-3 left-3">
                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-md shadow border ${
                          artisan.availability === 'Available Now'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                            : 'bg-amber-950/80 text-amber-300 border-amber-800'
                        }`}
                      >
                        ● {artisan.availability}
                      </span>
                    </div>
                  </div>

                  {/* Profile Body */}
                  <div className="p-5 space-y-3.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-extrabold text-white leading-snug hover:text-[#EA580C] transition-colors cursor-pointer" onClick={() => setSelectedArtisanForModal(artisan)}>
                            {artisan.name}
                          </h3>
                          <p className="text-xs font-bold text-[#94A3B8]">{artisan.shopName}</p>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-[#EA580C] bg-[#EA580C]/10 px-2 py-1 rounded-lg border border-[#EA580C]/30 shrink-0">
                          {artisan.craftCategory}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-2 line-clamp-2">{artisan.bio}</p>

                      <div className="pt-3 space-y-1.5 text-xs text-slate-300 border-t border-[#2A1E17] mt-3">
                        <div className="flex items-center text-slate-400">
                          <MapPin className="w-3.5 h-3.5 text-[#EA580C] mr-1.5 shrink-0" />
                          <span className="truncate">{artisan.address} ({artisan.pincode})</span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center">
                            <Briefcase className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
                            {artisan.experienceYears}+ Yrs Experience
                          </span>
                          <span className="font-mono text-slate-300 font-bold">
                            📍 {artisan.area}
                          </span>
                        </div>
                      </div>

                      {/* Phone Contact Action */}
                      <div className="mt-3 bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17] flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2 font-mono text-slate-300 font-bold">
                          <Phone className="w-3.5 h-3.5 text-[#EA580C]" />
                          <span>{artisan.mobileNo}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyPhone(artisan.id, artisan.mobileNo)}
                          className="text-[10px] font-mono px-2 py-1 rounded bg-[#1F1510] hover:bg-[#EA580C] text-slate-300 hover:text-white transition-colors border border-[#3E2E24] flex items-center gap-1"
                        >
                          {copiedPhoneId === artisan.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Card CTAs */}
                    <div className="pt-3 border-t border-[#2A1E17] flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleLocateArtisanOnMap(artisan)}
                        className="py-2.5 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-slate-300 hover:text-amber-400 text-xs font-bold border border-[#2A1E17] transition-all flex items-center justify-center space-x-1.5"
                      >
                        <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                        <span>Locate on Map</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedArtisanForModal(artisan)}
                        className="py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-extrabold transition-all shadow-md glow-orange flex items-center justify-center space-x-1.5"
                      >
                        <span>View Shop</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Empty State when 0 results */
          <div className="bg-[#1F1510] p-12 rounded-3xl border border-[#3E2E24] text-center space-y-4 max-w-lg mx-auto shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#120B08] text-[#EA580C] flex items-center justify-center mx-auto border border-[#EA580C]/40">
              <Filter className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">No Karagirs Found Matching Criteria</h3>
            <p className="text-xs text-slate-400">
              Try adjusting your search query, clearing locality filters, or toggling "Verified Only" off.
            </p>
            <button
              onClick={handleResetFilters}
              className="py-2.5 px-6 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-lg glow-orange"
            >
              Reset All Filters
            </button>
          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* 5. ARTISAN PROFILE DETAIL MODAL */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {selectedArtisanForModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1F1510] border-2 border-[#EA580C] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl text-white space-y-5 p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedArtisanForModal(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-[#120B08] text-slate-400 hover:text-white border border-[#2A1E17] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Modal Header */}
              <div className="flex items-start space-x-4">
                <img
                  src={selectedArtisanForModal.image}
                  alt={selectedArtisanForModal.name}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-[#EA580C]"
                />
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xl font-extrabold text-white">{selectedArtisanForModal.name}</h3>
                    {selectedArtisanForModal.isVerified && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#EA580C]">{selectedArtisanForModal.shopName}</p>
                  <p className="text-xs text-slate-400 flex items-center mt-1">
                    <MapPin className="w-3.5 h-3.5 text-[#EA580C] mr-1" />
                    {selectedArtisanForModal.address} ({selectedArtisanForModal.pincode})
                  </p>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-3 gap-3 bg-[#120B08] p-3.5 rounded-2xl border border-[#2A1E17] text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Craft Specialty</span>
                  <span className="font-bold text-amber-400">{selectedArtisanForModal.craftCategory}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Rating</span>
                  <span className="font-bold text-emerald-400 flex items-center justify-center gap-1">
                    ★ {selectedArtisanForModal.rating}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Experience</span>
                  <span className="font-bold text-white">{selectedArtisanForModal.experienceYears}+ Years</span>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Workshop Bio & Craftsmanship</span>
                <p className="text-xs text-slate-300 leading-relaxed bg-[#120B08] p-3 rounded-xl border border-[#2A1E17]">
                  {selectedArtisanForModal.bio}
                </p>
              </div>

              {/* Contact Box */}
              <div className="bg-[#120B08] p-4 rounded-2xl border border-[#EA580C]/40 space-y-2">
                <span className="text-xs font-bold text-white block">Direct Workshop Contact (Verified Mock Number):</span>
                <div className="flex items-center justify-between bg-[#1F1510] p-3 rounded-xl border border-[#2A1E17]">
                  <div className="flex items-center space-x-2 text-sm font-mono font-bold text-amber-300">
                    <Phone className="w-4 h-4 text-[#EA580C]" />
                    <span>{selectedArtisanForModal.mobileNo}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(selectedArtisanForModal.id, selectedArtisanForModal.mobileNo)}
                    className="py-1.5 px-3 rounded-lg bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow flex items-center gap-1.5"
                  >
                    {copiedPhoneId === selectedArtisanForModal.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Contact</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Modal CTAs */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleLocateArtisanOnMap(selectedArtisanForModal);
                    setSelectedArtisanForModal(null);
                  }}
                  className="py-3 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-slate-300 hover:text-white text-xs font-bold border border-[#2A1E17] transition-all flex items-center justify-center space-x-2"
                >
                  <Crosshair className="w-4 h-4 text-amber-400" />
                  <span>Locate Pin on Map</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onSelectArtisanStorefront) {
                      onSelectArtisanStorefront(selectedArtisanForModal);
                    }
                    setSelectedArtisanForModal(null);
                  }}
                  className="py-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-extrabold transition-all shadow-lg glow-orange flex items-center justify-center space-x-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Open 3D Storefront</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
