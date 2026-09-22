import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProductItem } from '../types';
import { X, CheckCircle, ShieldCheck } from 'lucide-react';
import { AiImage } from './AiImage';

interface ProductDetailModalProps {
  product: ProductItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const BADGES = [
  "Featured Cover / Master Build",
  "Studio Shot",
  "Joinery Detail",
  "Raw Timber View",
  "Ambient Design",
  "Dimensions Showcase"
];

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, isOpen, onClose }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOrdered, setIsOrdered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string>('');

  React.useEffect(() => {
    if (isOpen) {
      setIsOrdered(false);
      setIsSubmitting(false);
      setActiveIndex(0);
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const handleRequestBuild = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      const generatedId = `KARAGIR-${Math.floor(100000 + Math.random() * 900000)}`;
      setOrderId(generatedId);
      setIsSubmitting(false);
      setIsOrdered(true);
    }, 600);
  };

  const allImages = [product.coverImage, ...product.galleryImages];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-[#120B08] border-t-2 sm:border border-[#3E2E24] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] overflow-y-auto custom-scrollbar"
      >
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 bg-[#1F1510]/90 hover:bg-[#EA580C] text-white rounded-full transition-colors backdrop-blur-md border border-[#2A1E17]"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Image Stage */}
        <div className="p-3.5 space-y-2 bg-[#1A120E] border-b border-[#2A1E17]">
          <div className="relative w-full h-48 sm:h-64 rounded-2xl overflow-hidden bg-[#1F1510] border border-[#2A1E17]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 w-full h-full"
              >
                <AiImage
                  src={allImages[activeIndex]}
                  alt={`${product.name} View ${activeIndex + 1}`}
                  containerClassName="w-full h-full"
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </AnimatePresence>
            
            {/* Active Badge Tag */}
            <div className="absolute top-2.5 left-2.5 z-10">
              <span className="px-2.5 py-1 rounded-full bg-[#120B08]/90 text-[10px] font-bold text-[#EA580C] border border-[#EA580C]/40 backdrop-blur-md shadow flex items-center space-x-1">
                <CheckCircle className="w-3 h-3" />
                <span>{BADGES[activeIndex] || "AI Generated View"}</span>
              </span>
            </div>
          </div>

          {/* Thumbnail Strip */}
          <div className="flex space-x-2 overflow-x-auto no-scrollbar py-0.5">
            {allImages.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`relative shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                  activeIndex === idx ? 'border-[#EA580C] scale-105' : 'border-[#2A1E17] opacity-60'
                }`}
              >
                <AiImage src={img} alt={`Thumbnail ${idx + 1}`} containerClassName="absolute inset-0 w-full h-full" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Product Details */}
        <div className="p-4 space-y-4">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{product.category}</div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold text-white leading-tight">{product.name}</h2>
              <div className="text-base font-mono font-bold text-[#EAB308] shrink-0">₹{product.startingPrice.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {product.description}
          </p>

          <div className="space-y-1.5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Premium Materials</h4>
            <div className="flex flex-wrap gap-1.5">
              {product.materials.map((mat, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded-lg bg-[#1F1510] border border-[#2A1E17] text-[11px] text-slate-200 font-medium">
                  {mat}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[#2A1E17]">
            {isOrdered ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/80 to-[#120B08] border border-emerald-500/50 space-y-2.5"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 shrink-0">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Your Order is Placed! ✓</h3>
                    <p className="text-[10px] text-emerald-300 font-mono">
                      Order ID: {orderId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button 
                    onClick={onClose}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    Done
                  </button>
                  <button 
                    onClick={() => setIsOrdered(false)}
                    className="px-3 py-2 rounded-xl bg-[#1F1510] border border-[#3E2E24] text-slate-300 text-xs font-bold"
                  >
                    Order Another
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Karagir Master Guarantee Protected</span>
                </div>
                <button 
                  onClick={handleRequestBuild}
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white font-bold text-xs shadow flex items-center justify-center space-x-2 disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <span>Processing...</span>
                  ) : (
                    <span>Request Custom Build</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

      </motion.div>
    </div>
  );
};
