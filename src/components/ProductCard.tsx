import React, { useState } from 'react';
import type { ProductItem } from '../types';
import { AiImage } from './AiImage';

interface ProductCardProps {
  product: ProductItem;
  onClick?: (product: ProductItem) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onClick }) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const displayImages = [product.coverImage, ...product.galleryImages];

  return (
    <div 
      className="group bg-[#1F1510] border border-[#2A1E17] hover:border-[#EA580C]/60 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between"
      onMouseLeave={() => setActiveImageIndex(0)}
    >
      <div 
        className="relative h-56 overflow-hidden cursor-pointer"
        onClick={() => onClick && onClick(product)}
      >
        <AiImage
          src={displayImages[activeImageIndex]}
          alt={product.name}
          containerClassName="absolute inset-0 w-full h-full"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F1510] via-transparent to-black/30 pointer-events-none"></div>
        
        {/* Hover Action: 6-dot thumbnail indicator (cover + 5 AI images) */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {displayImages.map((_, idx) => (
            <div
              key={idx}
              onMouseEnter={() => setActiveImageIndex(idx)}
              className={`w-2 h-2 rounded-full cursor-pointer transition-all duration-200 ${
                activeImageIndex === idx 
                  ? 'bg-[#EA580C] w-4' 
                  : 'bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-4 space-y-2">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold text-white group-hover:text-[#EA580C] transition-colors line-clamp-1">
            {product.name}
          </h3>
          <span className="text-[#EAB308] font-mono font-bold whitespace-nowrap ml-2 text-sm">
            {product.startingPrice != null && product.startingPrice > 0
              ? `₹${product.startingPrice.toLocaleString('en-IN')}` 
              : 'Price not set / कीमत तय नहीं'}
          </span>
        </div>
        <p className="text-xs text-slate-400 line-clamp-2">
          {product.description}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {(product.materials || []).slice(0, 3).map((mat, idx) => (
            <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-[#120B08] text-slate-300 border border-[#2A1E17]">
              {mat}
            </span>
          ))}
          {(product.materials || []).length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#120B08] text-slate-400 border border-[#2A1E17]">
              +{(product.materials || []).length - 3}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
