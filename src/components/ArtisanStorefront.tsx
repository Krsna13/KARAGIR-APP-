import React, { useState } from 'react';
import type { Artisan } from '../types';
import { MOCK_ARTISANS } from '../data/mockData';
import { MOCK_21_PRODUCTS } from '../data/productsMockDatabase';
import { Star, ShieldCheck, MapPin, Play, Search, Hammer, ArrowLeft, CheckCircle } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { ProductDetailModal } from './ProductDetailModal';
import type { ProductItem } from '../types';

interface ArtisanStorefrontProps {
  artisan?: Artisan;
  onOpenReel: (artisan: Artisan) => void;
  onCustomizeProduct?: (product: ProductItem) => void;
  onBack?: () => void;
}

export const ArtisanStorefront: React.FC<ArtisanStorefrontProps> = ({
  artisan = MOCK_ARTISANS[0],
  onOpenReel,
  onBack,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('All Products');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderPlaced, setOrderPlaced] = useState(false);

  const filterPills = ['All Products', 'Living Room', 'Dining Room', 'Bedroom', 'Storage', 'Sacred & Specialty'];

  const filteredProducts = MOCK_21_PRODUCTS.filter((prod) => {
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || prod.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeFilter === 'All Products' ||
      prod.category === activeFilter;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 pb-16">
      
      {/* Back Button Navigation Header */}
      {onBack && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#1F1510] hover:bg-[#261B15] text-slate-200 hover:text-white border border-[#3E2E24] text-xs font-extrabold transition-all shadow-md group"
          >
            <ArrowLeft className="w-4 h-4 text-[#EA580C] group-hover:-translate-x-1 transition-transform" />
            <span>← Back to Artisans Directory</span>
          </button>
        </div>
      )}
      
      {/* 1. Workshop Hero Header */}
      <section className="relative rounded-3xl overflow-hidden border border-[#2A1E17] bg-[#1F1510] shadow-2xl">
        <div className="relative h-64 sm:h-80 overflow-hidden">
          <img
            src={artisan.coverUrl}
            alt={artisan.shopName}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1F1510] via-black/40 to-transparent"></div>

          <div className="absolute top-4 left-4 flex items-center space-x-2">
            <span className="flex items-center space-x-1 px-3 py-1 rounded-full bg-[#120B08]/80 text-emerald-400 text-xs font-semibold backdrop-blur-md border border-emerald-900">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verified Karagir Workshop</span>
            </span>
            <span className="flex items-center space-x-1 px-3 py-1 rounded-full bg-[#120B08]/80 text-slate-300 text-xs font-mono backdrop-blur-md border border-[#2A1E17]">
              <MapPin className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>{artisan.distanceKm} km in {artisan.locality}, Nashik</span>
            </span>
          </div>

          <button
            onClick={() => onOpenReel(artisan)}
            className="absolute top-4 right-4 flex items-center space-x-2 px-4 py-2 rounded-full bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold shadow-xl transition-all glow-orange"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>15s Live Workshop Reel</span>
          </button>
        </div>

        <div className="px-6 sm:px-10 pb-8 -mt-16 relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div className="flex items-end space-x-5">
            <img
              src={artisan.avatarUrl}
              alt={artisan.name}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-[#1F1510] shadow-2xl"
            />
            <div className="space-y-1 mb-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{artisan.shopName}</h1>
              <p className="text-sm font-semibold text-slate-300">
                Master Karagir: <span className="text-[#EA580C]">{artisan.name}</span> ({artisan.experienceYears}+ Yrs Exp)
              </p>
              <div className="flex items-center space-x-4 text-xs text-slate-400">
                <span className="flex items-center text-amber-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
                  {artisan.rating} ({artisan.reviewsCount} verified reviews)
                </span>
                <span>•</span>
                <span>Response time: <strong className="text-white">{artisan.responseTime}</strong></span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => {
              setOrderPlaced(true);
              setTimeout(() => setOrderPlaced(false), 4000);
            }}
            className={`px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center space-x-2 ${
              orderPlaced 
                ? 'bg-emerald-600 text-white border border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                : 'bg-[#EA580C] hover:bg-[#F97316] text-white glow-orange'
            }`}
          >
            {orderPlaced ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span>Your Order is Placed! ✓</span>
              </>
            ) : (
              <>
                <Hammer className="w-4 h-4" />
                <span>Request Custom Order</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Removed embedded ArtisanProduct3DEditor */}

      {/* 3. In-Store Product Catalog */}
      <section className="space-y-6">
        <div className="bg-[#1F1510] p-4 rounded-2xl border border-[#2A1E17] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2 overflow-x-auto w-full md:w-auto py-1">
            {filterPills.map((pill) => (
              <button
                key={pill}
                onClick={() => setActiveFilter(pill)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  activeFilter === pill
                    ? 'bg-[#EA580C] text-white shadow-md'
                    : 'bg-[#120B08] text-slate-400 hover:text-white border border-[#2A1E17]'
                }`}
              >
                {pill}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workshop catalog..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#EA580C]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-6 w-full">
          {filteredProducts.map((product) => (
            <ProductCard 
              key={product.id}
              product={product}
              onClick={setSelectedProduct}
            />
          ))}
        </div>
      </section>

      {/* 3D Inspection Viewport Modal / Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={selectedProduct !== null}
        onClose={() => setSelectedProduct(null)}
      />

    </div>
  );
};
