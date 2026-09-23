import React, { useState } from 'react';
import { ShieldCheck, MapPin, Star, MessageCircle, Hammer, Sparkles } from 'lucide-react';
import { useKaragirStore } from '../context/KaragirStoreContext';
import { AiImage } from './AiImage';
import { ProductDetailModal } from './ProductDetailModal';
import type { ProductItem } from '../types';

export const KaragirProfileCard: React.FC = () => {
  const { storeData } = useKaragirStore();
  const [activeCategory, setActiveCategory] = useState<string>('All Works');
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  if (!storeData) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[#1F1510] border border-[#2A1E17] rounded-3xl shadow-2xl space-y-4">
        <Hammer className="w-12 h-12 text-[#EA580C] opacity-50" />
        <h2 className="text-xl font-bold text-white">No Store Found</h2>
        <p className="text-sm text-slate-400">This artisan has not set up their store yet.</p>
      </div>
    );
  }

  const allCategories = ['All Works', ...storeData.categories];
  const displayedWorks = activeCategory === 'All Works' 
    ? storeData.works 
    : storeData.works.filter(w => w.category === activeCategory);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 pb-16">
      
      {/* Profile Header (Glassmorphic) */}
      <div className="relative rounded-3xl overflow-hidden border border-[#2A1E17] bg-[#1F1510] shadow-2xl">
        {/* Banner */}
        <div className="relative h-48 sm:h-64 bg-[#120B08] overflow-hidden">
          {storeData.shopBanner ? (
            <img src={storeData.shopBanner} alt="Banner" className="w-full h-full object-cover opacity-80" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-[#120B08] to-[#1F1510] flex items-center justify-center">
              <Hammer className="w-24 h-24 text-[#2A1E17]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1F1510] via-black/40 to-transparent"></div>
        </div>

        {/* Info Area */}
        <div className="px-6 sm:px-10 pb-8 -mt-16 relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div className="flex items-end space-x-5">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-[#120B08] border-4 border-[#1F1510] shadow-2xl overflow-hidden shrink-0 flex items-center justify-center text-[#EA580C]">
              {storeData.shopAvatar ? (
                <img src={storeData.shopAvatar} alt={storeData.artisanName} className="w-full h-full object-cover" />
              ) : (
                <Hammer className="w-10 h-10" />
              )}
            </div>
            
            <div className="space-y-1.5 mb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{storeData.shopName || `${storeData.artisanName}'s Workshop`}</h1>
                <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-400 text-[10px] font-bold border border-emerald-800/50">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified Master</span>
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-300">
                {storeData.shopTagline || `${storeData.craftSpecialty} Specialist`}
              </p>
              <div className="flex items-center space-x-3 text-xs text-slate-400 font-medium">
                <span className="flex items-center"><MapPin className="w-3.5 h-3.5 text-[#EA580C] mr-1" /> {storeData.location}</span>
                <span>•</span>
                <span className="text-white">{storeData.artisanName}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto">
            <button className="flex-1 md:flex-none px-5 py-3 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-xs font-bold transition-all border border-[#25D366]/30 flex items-center justify-center space-x-2">
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
            <button className="flex-1 md:flex-none px-5 py-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-lg glow-orange flex items-center justify-center space-x-2">
              <Sparkles className="w-4 h-4" />
              <span>Custom Order</span>
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#2A1E17] border-t border-[#2A1E17] bg-[#120B08]/50">
          <div className="p-4 text-center">
            <p className="text-xl font-bold text-white">{storeData.yearsExperience}+</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-0.5">Years Exp</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xl font-bold text-white">{storeData.categories.length}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-0.5">Active Categories</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xl font-bold text-white">{storeData.works.length}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-0.5">Products Listed</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xl font-bold text-[#EAB308] flex items-center justify-center space-x-1">
              <span>{storeData.rating.toFixed(1)}</span>
              <Star className="w-4 h-4 fill-current" />
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-0.5">Craft Rating</p>
          </div>
        </div>
      </div>

      {/* Showcase Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-[#2A1E17] pb-4">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Hammer className="w-5 h-5 text-[#EA580C]" />
            <span>Master Showcase Grid</span>
          </h2>
        </div>

        {/* Category Filter Tabs */}
        {storeData.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeCategory === cat 
                    ? 'bg-[#EA580C] text-white shadow-md' 
                    : 'bg-[#1F1510] text-slate-400 hover:text-white border border-[#2A1E17]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Work Showcase Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedWorks.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 text-sm">
              No works uploaded yet.
            </div>
          ) : (
            displayedWorks.map(work => (
              <div 
                key={work.id}
                onClick={() => {
                  const product: ProductItem = {
                    id: work.id,
                    name: work.title || 'Handcrafted Item',
                    slug: work.id,
                    category: work.category,
                    coverImage: work.coverImage,
                    galleryImages: work.galleryImages,
                    description: `Masterfully crafted using ${work.material || 'quality materials'}. Lead time: ${work.leadTimeDays || 7} days.`,
                    materials: [work.material || 'Handcrafted'],
                    startingPrice: work.price != null && work.price > 0 ? work.price : null
                  };
                  setSelectedProduct(product);
                }}
                className="group bg-[#1F1510] border border-[#2A1E17] hover:border-[#EA580C]/60 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 shadow-lg cursor-pointer flex flex-col"
              >
                <div className="relative h-56 overflow-hidden">
                  <AiImage 
                    src={work.coverImage} 
                    alt={work.title}
                    containerClassName="absolute inset-0 w-full h-full"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1F1510] via-transparent to-black/30"></div>
                  
                  <div className="absolute bottom-3 left-3 text-[10px] font-bold px-2 py-1 bg-[#120B08]/80 text-[#EA580C] rounded border border-[#EA580C]/30 backdrop-blur">
                    {work.category}
                  </div>
                </div>
                
                <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-[#EA580C] transition-colors line-clamp-1">
                      {work.title || 'Untitled Item'}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-1">
                      {work.material || 'Handcrafted'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#2A1E17]">
                    <span className="text-[#EAB308] font-mono font-bold text-sm">
                      {work.price != null && work.price > 0
                        ? `₹${work.price.toLocaleString('en-IN')}` 
                        : 'Price not set / कीमत तय नहीं'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">{work.leadTimeDays || 7} Days</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={selectedProduct !== null}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
};
