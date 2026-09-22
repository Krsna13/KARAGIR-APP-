import React, { useState } from 'react';
import { Hammer, Tag, IndianRupee, Image as ImageIcon, Plus, ArrowLeft, Check, Sparkles, Clock } from 'lucide-react';
import type { KaragirStore, WorkItem } from '../types';

interface Props {
  storeData: KaragirStore | null;
  addWorkItem: (item: WorkItem) => Promise<void>;
}

export const CatalogEditor: React.FC<Props> = ({ storeData, addWorkItem }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newItem, setNewItem] = useState<WorkItem>({
    id: '',
    title: '',
    category: storeData?.craftSpecialty || 'Woodwork',
    coverImage: '',
    galleryImages: [],
    price: 0,
    material: '',
    leadTimeDays: 14,
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.title || newItem.price <= 0) return;

    setIsSubmitting(true);
    try {
      await addWorkItem({
        ...newItem,
        id: Math.random().toString(36).substring(7),
        coverImage:
          newItem.coverImage ||
          'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=600&q=80',
      });

      setNewItem({
        id: '',
        title: '',
        category: storeData?.craftSpecialty || 'Woodwork',
        material: '',
        coverImage: '',
        galleryImages: [],
        price: 0,
        leadTimeDays: 14,
      });
      setIsCreating(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const samplePhotos = [
    { label: 'Table', url: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=600&q=80' },
    { label: 'Chair', url: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=600&q=80' },
    { label: 'Cabinet', url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=600&q=80' },
    { label: 'Pottery', url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80' },
  ];

  return (
    <div className="w-full space-y-3.5 font-sans">
      {/* 1. Mobile App Top Header */}
      <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-3.5 shadow-md flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#120B08] border border-[#EA580C]/80 flex items-center justify-center text-[#EA580C] shadow-inner">
            <Hammer className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white">Workshop Catalog</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EA580C]/10 text-[#EA580C] border border-[#EA580C]/30 font-bold">
                {storeData?.works?.length || 0} items
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Manage your workshop offerings</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 shadow active:scale-95 cursor-pointer ${
            isCreating
              ? 'bg-[#2A1E17] text-slate-300 hover:text-white border border-[#3A2A20]'
              : 'bg-[#EA580C] hover:bg-[#F97316] text-white shadow-md'
          }`}
        >
          {isCreating ? (
            <>
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Catalog</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Item</span>
            </>
          )}
        </button>
      </div>

      {/* 2. Mode A: Create New Listing Mobile Form */}
      {isCreating ? (
        <form
          onSubmit={handleAdd}
          className="bg-[#1A120E] border border-[#EA580C]/40 rounded-2xl p-4 shadow-xl space-y-3.5"
        >
          <div className="flex items-center justify-between border-b border-[#2A1E17] pb-2.5">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-[#EA580C]" />
              <h3 className="text-sm font-bold text-white">Create New Listing</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-[#120B08] border border-[#2A1E17]"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            {/* Product Title */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">
                Product Title / उत्पाद का नाम <span className="text-[#EA580C]">*</span>
              </label>
              <input
                type="text"
                required
                value={newItem.title}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                placeholder="e.g. Carved Teak Dining Table"
                className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C] transition-colors"
              />
            </div>

            {/* Category & Material Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">
                  Category <span className="text-[#EA580C]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  placeholder="e.g. Woodwork"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C] transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">
                  Raw Material <span className="text-[#EA580C]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newItem.material}
                  onChange={(e) => setNewItem({ ...newItem, material: e.target.value })}
                  placeholder="e.g. Teak Wood"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C] transition-colors"
                />
              </div>
            </div>

            {/* Price & Lead Time */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">
                  Base Price (₹) <span className="text-[#EA580C]">*</span>
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="number"
                    required
                    min={1}
                    value={newItem.price || ''}
                    onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                    placeholder="25000"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C] transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Lead Time (Days)</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="number"
                    min={1}
                    value={newItem.leadTimeDays}
                    onChange={(e) => setNewItem({ ...newItem, leadTimeDays: Number(e.target.value) })}
                    placeholder="14"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C] transition-colors font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Photo URL & Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Photo URL (Optional)</label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="url"
                  value={newItem.coverImage}
                  onChange={(e) => setNewItem({ ...newItem, coverImage: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C] transition-colors"
                />
              </div>

              {/* Sample Photo Pickers */}
              <div className="flex items-center space-x-1.5 pt-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] text-slate-500 shrink-0">Sample Photos:</span>
                {samplePhotos.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setNewItem({ ...newItem, coverImage: p.url })}
                    className="px-2 py-0.5 rounded-lg bg-[#120B08] hover:bg-[#2A1E17] border border-[#2A1E17] text-[10px] text-slate-300 shrink-0 transition-colors cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-[#d14f0a] hover:to-amber-500 text-white text-xs font-bold shadow-lg transition-all active:scale-98 flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Listing...' : 'List Product to Storefront / स्टोर पर जोड़ें'}</span>
            </button>
          </div>
        </form>
      ) : (
        /* 3. Mode B: Catalog Product List */
        <div className="space-y-3">
          {storeData?.works && storeData.works.length > 0 ? (
            <div className="space-y-2.5">
              {storeData.works.map((work) => (
                <div
                  key={work.id}
                  className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl overflow-hidden hover:border-[#EA580C]/50 transition-all shadow-md flex items-stretch"
                >
                  {/* Left: Thumbnail with Category Badge */}
                  <div className="w-24 min-h-[96px] bg-black/40 relative shrink-0">
                    <img
                      src={work.coverImage}
                      alt={work.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/75 backdrop-blur-sm rounded text-[8px] font-bold text-white uppercase tracking-wider">
                      {work.category}
                    </div>
                  </div>

                  {/* Right: Product Details */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white line-clamp-1">{work.title}</h4>
                      <p className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                        <Tag className="w-3 h-3 text-[#EA580C] shrink-0" />
                        <span className="truncate">{work.material}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#2A1E17] mt-2">
                      <span className="text-[#EAB308] font-mono text-xs font-extrabold flex items-center">
                        ₹{work.price.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[9px] text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                        Live
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="py-12 px-4 flex flex-col items-center justify-center border-2 border-dashed border-[#2A1E17] bg-[#1A120E]/60 rounded-2xl text-center space-y-3 shadow-inner">
              <div className="w-12 h-12 rounded-2xl bg-[#120B08] border border-[#2A1E17] flex items-center justify-center text-slate-500 shadow-md">
                <Hammer className="w-6 h-6 text-[#EA580C]" />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-white">No products in your catalog yet</p>
                <p className="text-[11px] text-slate-400 max-w-[240px]">
                  Add your handcrafted items to showcase them on your mobile storefront.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="mt-1 px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold shadow flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Your First Product</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
