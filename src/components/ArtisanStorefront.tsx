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
    <div className="space-y-4 pb-20 font-sans">
      
      {/* Back Button Navigation Header */}
      {onBack && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1A120E] hover:bg-[#261B15] text-slate-200 hover:text-white border border-[#2A1E17] text-xs font-bold transition-all shadow"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Back</span>
          </button>
        </div>
      )}
      
      {/* 1. Workshop Hero Header */}
      <section className="relative rounded-2xl overflow-hidden border border-[#2A1E17] bg-[#1A120E] shadow-xl">
        <div className="relative h-44 overflow-hidden">
          <img
            src={artisan.coverUrl}
            alt={artisan.shopName}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1A120E] via-black/30 to-transparent" />

          <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5">
            <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-[#120B08]/90 text-emerald-400 text-[10px] font-bold backdrop-blur-md border border-emerald-900">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Verified</span>
            </span>
          </div>

          <button
            onClick={() => onOpenReel(artisan)}
            className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#EA580C] hover:bg-[#F97316] text-white text-[10px] font-bold shadow-lg transition-all"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>15s Live Reel</span>
          </button>
        </div>

        {/* Workshop Profile Details */}
        <div className="px-4 pb-4 -mt-8 relative z-10 space-y-3">
          <div className="flex items-end space-x-3">
            <img
              src={artisan.avatarUrl}
              alt={artisan.name}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-[#EA580C] shadow-xl shrink-0 bg-[#120B08]"
            />
            <div className="space-y-0.5 overflow-hidden">
              <h1 className="text-base font-bold text-white truncate">{artisan.shopName}</h1>
              <p className="text-xs text-[#EA580C] font-semibold truncate">
                {artisan.name} • {artisan.experienceYears}+ Yrs Exp
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 bg-[#120B08] p-2 rounded-xl border border-[#2A1E17]">
            <span className="flex items-center text-amber-400 font-bold">
              <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
              {artisan.rating} ({artisan.reviewsCount} reviews)
            </span>
            <span className="flex items-center text-slate-300">
              <MapPin className="w-3 h-3 text-[#EA580C] mr-1" />
              {artisan.locality}
            </span>
          </div>

          <button 
            onClick={() => {
              setOrderPlaced(true);
              setTimeout(() => setOrderPlaced(false), 4000);
            }}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center space-x-1.5 ${
              orderPlaced 
                ? 'bg-emerald-600 text-white border border-emerald-400'
                : 'bg-[#EA580C] hover:bg-[#F97316] text-white'
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
                <span>Request Custom Order from {artisan.name}</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 2. In-Store Product Catalog */}
      <section className="space-y-3">
        <div className="space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workshop catalog..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#EA580C]"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            {filterPills.map((pill) => (
              <button
                key={pill}
                onClick={() => setActiveFilter(pill)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  activeFilter === pill
                    ? 'bg-[#EA580C] text-white shadow'
                    : 'bg-[#1A120E] text-slate-400 hover:text-white border border-[#2A1E17]'
                }`}
              >
                {pill}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards */}
        <div className="space-y-3 w-full">
          {filteredProducts.map((product) => (
            <ProductCard 
              key={product.id}
              product={product}
              onClick={setSelectedProduct}
            />
          ))}
        </div>
      </section>

      {/* 3D Inspection Viewport Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={selectedProduct !== null}
        onClose={() => setSelectedProduct(null)}
      />

    </div>
  );
};
