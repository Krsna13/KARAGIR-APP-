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
  Crosshair,
  Filter,
  RotateCcw,
  Sparkles,
  ArrowRight,
  X,
  Clock,
  Briefcase,
  SlidersHorizontal
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

// Custom Leaflet Pin generator matching Orange Hammer Icon
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
          box-shadow: 0 0 ${isHovered ? '16px #EAB308' : '10px #EA580C'};
          transition: all 0.25s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="${isHovered ? '15' : '12'}" height="${isHovered ? '15' : '12'}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 12-8.373 8.373a1 1 0 1 1-1.414-1.414L13.586 10.586a1 1 0 0 0 0-1.414l-2.172-2.172a1 1 0 0 1 0-1.414l1.414-1.414a1 1 0 0 1 1.414 0l4.243 4.243a1 1 0 0 1 0 1.414L17 11"/>
          </svg>
        </div>
        ${isVerified ? '<div style="position: absolute; top: -2px; right: -2px; width: 7px; height: 7px; border-radius: 50%; background-color: #10B981; border: 1.5px solid #0F172A;"></div>' : ''}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

// Map Viewport FlyTo Helper Component
const MapFlyToController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
};

interface FindLocalArtisansPageProps {
  onBackToHome?: () => void;
  onSelectArtisanStorefront?: (artisan: RegionalArtisan) => void;
}

export const FindLocalArtisansPage: React.FC<FindLocalArtisansPageProps> = ({
  onSelectArtisanStorefront,
}) => {
  // State variables
  const [selectedCity, setSelectedCity] = useState<'Nashik' | 'Pune' | 'Mumbai'>('Nashik');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCraftTag, setSelectedCraftTag] = useState<string>('All');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);

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
    { label: 'All Crafts', value: 'All' },
    { label: '🪵 Woodwork', value: 'Wood' },
    { label: '🔔 Brasscraft', value: 'Brass' },
    { label: '🧵 Textiles', value: 'Textile' },
    { label: '🏺 Pottery', value: 'Decor' },
    { label: '🪑 Furniture', value: 'Furniture' },
    { label: '⚒️ MetalArt', value: 'Metal' },
  ];

  // City Switch handler
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

  const hasActiveFilters = selectedArea !== 'All' || searchQuery !== '' || selectedCraftTag !== 'All' || verifiedOnly || availableOnly;

  return (
    <div className="w-full space-y-3.5 pb-20 text-white font-sans">
      
      {/* ========================================================================= */}
      {/* 1. MOBILE APP SEARCH & CITY SELECTOR */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        {/* City Selector Pills */}
        <div className="flex items-center justify-between gap-1.5 px-0.5">
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            {(['Nashik', 'Pune', 'Mumbai'] as const).map((city) => (
              <button
                key={city}
                onClick={() => handleCityChange(city)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 ${
                  selectedCity === city
                    ? 'bg-[#EA580C] text-white shadow-md'
                    : 'bg-[#1A120E] text-slate-300 hover:text-white border border-[#2A1E17]'
                }`}
              >
                📍 {city}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className={`p-1.5 rounded-xl border text-xs flex items-center gap-1 font-bold shrink-0 transition-all ${
              isFilterExpanded || hasActiveFilters
                ? 'bg-[#EA580C]/20 border-[#EA580C] text-[#EA580C]'
                : 'bg-[#1A120E] border-[#2A1E17] text-slate-400'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Search Bar */}
        <div className="relative">
          <div className="flex items-center space-x-2 p-2 bg-[#1A120E] border border-[#2A1E17] rounded-2xl shadow-md focus-within:border-[#EA580C] transition-colors">
            <Search className="w-4 h-4 text-[#EA580C] shrink-0 ml-1" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search artisan, craft, locality (e.g. Panchavati)..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Craft Category Chips Horizontal Scroll */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
          {craftTags.map((tag) => (
            <button
              key={tag.value}
              onClick={() => setSelectedCraftTag(tag.value)}
              className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap shrink-0 transition-all ${
                selectedCraftTag === tag.value
                  ? 'bg-[#EAB308] text-slate-900 font-bold shadow'
                  : 'bg-[#160E0A] text-slate-400 hover:text-white border border-[#2A1E17]'
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>

        {/* Expanded Filters Sheet */}
        {isFilterExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 bg-[#1A120E] rounded-2xl border border-[#2A1E17] space-y-3"
          >
            {/* Locality Chips */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Local Area in {selectedCity}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedArea('All')}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all ${
                    selectedArea === 'All'
                      ? 'bg-[#EA580C] text-white shadow'
                      : 'bg-[#120B08] text-slate-300 border border-[#2A1E17]'
                  }`}
                >
                  All ({CITY_AREAS_MAP[selectedCity].length})
                </button>
                {CITY_AREAS_MAP[selectedCity].map((area) => (
                  <button
                    key={area}
                    onClick={() => setSelectedArea(area)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                      selectedArea === area
                        ? 'bg-[#EA580C] text-white shadow'
                        : 'bg-[#120B08] text-slate-300 border border-[#2A1E17]'
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Filter Toggles */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#2A1E17]">
              <button
                onClick={() => setVerifiedOnly(!verifiedOnly)}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                  verifiedOnly
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                    : 'bg-[#120B08] border-[#2A1E17] text-slate-400'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Only</span>
              </button>

              <button
                onClick={() => setAvailableOnly(!availableOnly)}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                  availableOnly
                    ? 'bg-[#EA580C]/20 border-[#EA580C] text-[#EA580C]'
                    : 'bg-[#120B08] border-[#2A1E17] text-slate-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>Available Now</span>
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. MOBILE INTERACTIVE MAP CARD */}
      {/* ========================================================================= */}
      <div className="relative w-full h-56 rounded-2xl overflow-hidden border border-[#2A1E17] bg-[#0c0806] shadow-xl">
        
        {/* Floating Top Pill Badge */}
        <div className="absolute top-2.5 left-2.5 z-[400] bg-[#120B08]/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#EA580C]/40 text-[10px] font-bold text-[#EA580C] flex items-center space-x-1.5 pointer-events-none shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] animate-ping" />
          <span>{filteredArtisans.length} Karagir Workshops in {selectedArea !== 'All' ? selectedArea : selectedCity}</span>
        </div>

        {/* Map Container */}
        <MapContainer
          center={mapTargetCenter}
          zoom={mapTargetZoom}
          scrollWheelZoom={false}
          zoomControl={false}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <MapFlyToController center={mapTargetCenter} zoom={mapTargetZoom} />

          {/* 5km Radius Dashed Orange Circle */}
          <Circle
            center={mapTargetCenter}
            radius={4000}
            pathOptions={{
              color: '#EA580C',
              fillColor: '#EA580C',
              fillOpacity: 0.1,
              weight: 1.5,
              dashArray: '4, 6',
            }}
          />

          {/* Glowing Artisan Pins */}
          {filteredArtisans.map((artisan) => {
            const isHovered = hoveredArtisanId === artisan.id;
            return (
              <Marker
                key={artisan.id}
                position={[artisan.lat, artisan.lng]}
                icon={createArtisanPinIcon(isHovered, artisan.isVerified)}
                eventHandlers={{
                  click: () => setSelectedArtisanForModal(artisan),
                }}
              >
                <Popup className="dark-popup">
                  <div
                    onClick={() => setSelectedArtisanForModal(artisan)}
                    className="p-2.5 bg-[#1F1510] cursor-pointer space-y-1.5 text-white min-w-[200px]"
                  >
                    <div className="flex items-center space-x-2.5">
                      <img
                        src={artisan.image}
                        alt={artisan.name}
                        className="w-10 h-10 rounded-xl object-cover border border-[#EA580C] shrink-0"
                      />
                      <div className="overflow-hidden">
                        <h4 className="text-xs font-bold text-white truncate">{artisan.name}</h4>
                        <p className="text-[10px] text-[#EA580C] truncate font-semibold">{artisan.shopName}</p>
                        <p className="text-[9px] text-slate-400 truncate">📍 {artisan.area}</p>
                      </div>
                    </div>

                    <div className="w-full py-1 px-2 rounded bg-[#EA580C] text-white text-[10px] font-bold text-center mt-1">
                      View Workshop Profile
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* ========================================================================= */}
      {/* 3. RESULTS BAR */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-bold text-slate-300">
          Showing <span className="text-[#EA580C] font-extrabold">{filteredArtisans.length}</span> Artisans
        </span>

        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            className="text-[11px] text-[#EA580C] hover:underline flex items-center gap-1 font-semibold"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MOBILE ARTISAN CARDS LIST */}
      {/* ========================================================================= */}
      {filteredArtisans.length > 0 ? (
        <div className="space-y-3">
          {filteredArtisans.map((artisan) => (
            <motion.div
              key={artisan.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[#1A120E] rounded-2xl overflow-hidden border border-[#2A1E17] shadow-lg flex flex-col"
            >
              {/* Card Image Banner */}
              <div className="relative h-36 overflow-hidden">
                <img
                  src={artisan.image}
                  alt={artisan.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A120E] via-transparent to-black/40" />

                {/* Verified Badge */}
                {artisan.isVerified && (
                  <div className="absolute top-2.5 left-2.5 bg-emerald-950/90 text-emerald-300 text-[9px] font-bold px-2 py-0.5 rounded-full shadow border border-emerald-700 flex items-center space-x-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>Verified</span>
                  </div>
                )}

                {/* Rating Badge */}
                <div className="absolute top-2.5 right-2.5 bg-[#120B08]/90 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-xl border border-amber-500/40 shadow flex items-center space-x-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>{artisan.rating.toFixed(1)}</span>
                </div>

                {/* Availability Tag */}
                <div className="absolute bottom-2 left-2.5">
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded shadow border ${
                      artisan.availability === 'Available Now'
                        ? 'bg-emerald-950/90 text-emerald-400 border-emerald-800'
                        : 'bg-amber-950/90 text-amber-300 border-amber-800'
                    }`}
                  >
                    ● {artisan.availability}
                  </span>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-3.5 space-y-2.5">
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <h3
                        onClick={() => setSelectedArtisanForModal(artisan)}
                        className="text-sm font-bold text-white hover:text-[#EA580C] transition-colors cursor-pointer"
                      >
                        {artisan.name}
                      </h3>
                      <p className="text-[11px] font-semibold text-[#EA580C]">{artisan.shopName}</p>
                    </div>

                    <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-700/50 shrink-0">
                      {artisan.craftCategory}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                    {artisan.bio}
                  </p>
                </div>

                {/* Meta details */}
                <div className="pt-2 border-t border-[#2A1E17] flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center">
                    <MapPin className="w-3 h-3 text-[#EA580C] mr-1 shrink-0" />
                    <span className="truncate max-w-[140px]">{artisan.area} ({artisan.pincode})</span>
                  </span>

                  <span className="flex items-center text-slate-300 font-semibold">
                    <Briefcase className="w-3 h-3 text-amber-400 mr-1" />
                    {artisan.experienceYears}+ Yrs Exp
                  </span>
                </div>

                {/* Phone Contact Strip */}
                <div className="bg-[#120B08] p-2 rounded-xl border border-[#2A1E17] flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 font-mono text-slate-300 font-bold text-[11px]">
                    <Phone className="w-3 h-3 text-[#EA580C]" />
                    <span>{artisan.mobileNo}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(artisan.id, artisan.mobileNo)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F1510] hover:bg-[#EA580C] text-slate-300 hover:text-white transition-colors border border-[#3E2E24] flex items-center gap-1"
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

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleLocateArtisanOnMap(artisan)}
                    className="py-2 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-slate-300 hover:text-amber-400 text-xs font-bold border border-[#2A1E17] transition-all flex items-center justify-center space-x-1"
                  >
                    <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                    <span>Locate Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectArtisanStorefront) {
                        onSelectArtisanStorefront(artisan);
                      } else {
                        setSelectedArtisanForModal(artisan);
                      }
                    }}
                    className="py-2 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow flex items-center justify-center space-x-1"
                  >
                    <span>View Shop</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-[#1A120E] p-8 rounded-2xl border border-[#2A1E17] text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#120B08] text-[#EA580C] flex items-center justify-center mx-auto border border-[#EA580C]/40">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Karagirs Found</h3>
          <p className="text-xs text-slate-400">
            Try adjusting your search query or clearing locality filters.
          </p>
          <button
            onClick={handleResetFilters}
            className="py-2 px-4 rounded-xl bg-[#EA580C] text-white text-xs font-bold shadow"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MOBILE ARTISAN PROFILE BOTTOM SHEET / MODAL */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {selectedArtisanForModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-[#1A120E] border-t-2 sm:border-2 border-[#EA580C] w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl text-white space-y-4 p-5 relative max-h-[85vh] overflow-y-auto custom-scrollbar"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedArtisanForModal(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-[#120B08] text-slate-400 hover:text-white border border-[#2A1E17]"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Modal Header */}
              <div className="flex items-start space-x-3 pr-8">
                <img
                  src={selectedArtisanForModal.image}
                  alt={selectedArtisanForModal.name}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-[#EA580C] shrink-0"
                />
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white">{selectedArtisanForModal.name}</h3>
                    {selectedArtisanForModal.isVerified && (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[#EA580C]">{selectedArtisanForModal.shopName}</p>
                  <p className="text-[10px] text-slate-400 flex items-center mt-0.5">
                    <MapPin className="w-3 h-3 text-[#EA580C] mr-1" />
                    {selectedArtisanForModal.address}
                  </p>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-3 gap-2 bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17] text-center text-xs">
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Specialty</span>
                  <span className="font-bold text-amber-400 text-[11px]">{selectedArtisanForModal.craftCategory}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Rating</span>
                  <span className="font-bold text-emerald-400 text-[11px] flex items-center justify-center gap-0.5">
                    ★ {selectedArtisanForModal.rating}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Experience</span>
                  <span className="font-bold text-white text-[11px]">{selectedArtisanForModal.experienceYears}+ Yrs</span>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Workshop Bio</span>
                <p className="text-xs text-slate-300 leading-relaxed bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17]">
                  {selectedArtisanForModal.bio}
                </p>
              </div>

              {/* Contact Box */}
              <div className="bg-[#120B08] p-3 rounded-xl border border-[#EA580C]/40 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-mono font-bold text-amber-300">
                  <Phone className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>{selectedArtisanForModal.mobileNo}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyPhone(selectedArtisanForModal.id, selectedArtisanForModal.mobileNo)}
                  className="py-1 px-2.5 rounded-lg bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow flex items-center gap-1"
                >
                  {copiedPhoneId === selectedArtisanForModal.id ? (
                    <>
                      <Check className="w-3 h-3" />
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

              {/* Modal CTAs */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleLocateArtisanOnMap(selectedArtisanForModal);
                    setSelectedArtisanForModal(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-slate-300 hover:text-white text-xs font-bold border border-[#2A1E17] transition-all flex items-center justify-center space-x-1"
                >
                  <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                  <span>Locate Map</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onSelectArtisanStorefront) {
                      onSelectArtisanStorefront(selectedArtisanForModal);
                    }
                    setSelectedArtisanForModal(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow flex items-center justify-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
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
