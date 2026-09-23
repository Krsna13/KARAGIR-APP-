import React, { useState } from "react";
import { Eye, Check, ShoppingBag, Sparkles, ShieldCheck } from "lucide-react";
import { ThreeDProductViewer } from "./ThreeDProductViewer";
import { MOCK_PRODUCTS } from "../data/mockData";
import type { Artisan, Product, ProductItem } from "../types";

interface ArtisanProduct3DEditorProps {
  artisan?: Artisan;
  product?: Product | ProductItem | null;
}

export const ArtisanProduct3DEditor: React.FC<ArtisanProduct3DEditorProps> = ({ artisan, product }) => {
  const rawBasePrice = product ? ('price' in product ? product.price : product.startingPrice) : 32000;
  const hasBasePrice = rawBasePrice != null && rawBasePrice > 0;
  const basePrice = hasBasePrice ? rawBasePrice : null;
  const productTitle = product ? ('title' in product ? product.title : product.name) : "Bespoke Hand-Carved Dining Table";
  
  const [selectedWood, setSelectedWood] = useState({ name: "Sagwan Teak", priceDiff: 0 });
  const [capacity, setCapacity] = useState({ label: "6-Seater", priceDiff: 0 });
  const [hasBrassInlay, setHasBrassInlay] = useState(true);
  const [hasMOP, setHasMOP] = useState(false);
  const [selectedPolish, setSelectedPolish] = useState({ name: "Beeswax Matte", priceDiff: 0 });
  const [is3DFullscreenOpen, setIs3DFullscreenOpen] = useState(false);
  const [isBooked, setIsBooked] = useState(false);

  // Dynamic Upgrades and Total Calculation
  const upgradesTotal = 
    selectedWood.priceDiff + 
    capacity.priceDiff + 
    (hasBrassInlay ? 2500 : 0) + 
    (hasMOP ? 3800 : 0) + 
    selectedPolish.priceDiff;

  const totalAmount = basePrice != null ? basePrice + upgradesTotal : null;

  const handleBookOrder = () => {
    setIsBooked(true);
    setTimeout(() => {
      setIsBooked(false);
    }, 2000);
  };

  return (
    <div className="bg-[#120B08] text-white p-6 sm:p-8 rounded-3xl border border-[#2A1E17] w-full max-w-[1440px] mx-auto shadow-2xl space-y-6">
      
      <div className="border-b border-[#2A1E17] pb-4 flex items-center justify-between">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#EA580C]/10 text-[#EA580C] text-xs font-bold border border-[#EA580C]/30 mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Artisan Storefront 3D Configurator</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">Interactive 3D Product Customizer</h2>
        </div>

        <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800 flex items-center">
          <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
          Master Workshop Verified
        </span>
      </div>

      <div className="flex flex-col space-y-4 items-start w-full">
        
        {/* PANEL 1: CATEGORIES SIDEBAR */}
        <div className="w-full bg-[#1F1510] border border-[#2A1E17] rounded-2xl p-4 shadow-inner">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">
            Explore {artisan ? artisan.name.split(" ")[0] : "Lakshya"}'s Work
          </h3>
          <div className="space-y-4">
            <div className="relative">
              <input type="text" placeholder="Search items..." className="w-full bg-[#120B08] border border-[#2A1E17] text-xs text-white pl-8 pr-3 py-2 rounded-xl focus:outline-none focus:border-[#EA580C]" />
              <svg className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["Chairs", "Dining Tables", "Sofas", "Cabinets", "Beds", "Consoles"].map((cat, i) => (
                <div key={cat} className="group cursor-pointer">
                  <div className="bg-[#1F1510] border border-[#2A1E17] rounded-xl overflow-hidden aspect-square relative mb-1 group-hover:border-[#EA580C] transition-colors">
                    <img src={`https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&q=80&w=200&h=200&sig=${i}`} alt={cat} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-60 group-hover:opacity-100" />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-center p-1">
                      <span className="text-white font-bold text-[10px] sm:text-xs tracking-wider drop-shadow-md">{cat}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL 2: 3D VIEWPORT SIMULATION */}
        <div className="w-full bg-[#1F1510] border border-[#2A1E17] rounded-2xl p-4 flex flex-col justify-between items-center relative min-h-[380px] shadow-inner">
          
          <div className="absolute top-3 left-3 bg-[#EA580C] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full text-white glow-orange flex items-center space-x-1">
            <Eye className="w-3 h-3" />
            <span>360° Interactive 3D Model</span>
          </div>

          <div className="my-auto text-center space-y-3 py-6">
            <div className="text-6xl animate-pulse">🪵</div>
            <p className="text-xs font-bold text-white">Click & Drag to Rotate 3D Model</p>
            
            <div className="text-xs bg-[#1A120E] text-[#EAB308] px-3 py-1.5 rounded-xl border border-[#EA580C]/30 inline-block font-mono">
              Texture: <strong>{selectedWood.name}</strong> ({selectedPolish.name})
            </div>

            <button
              onClick={() => setIs3DFullscreenOpen(true)}
              className="mt-2 block mx-auto px-4 py-2 rounded-xl bg-[#120B08] hover:bg-[#261B15] text-[#EA580C] text-xs font-bold border border-[#EA580C]/40 transition-all shadow-md"
            >
              Launch Fullscreen 3D Viewport
            </button>
          </div>

          <div className="w-full text-center text-[10px] text-slate-400 border-t border-[#2A1E17] pt-2.5 font-mono">
            Verified Master Karagir Workshop • Satpur MIDC, Nashik
          </div>

        </div>

        {/* PANEL 3: LIVE PRICE CONFIGURATOR PANEL */}
        <div className="w-full bg-[#1F1510] border border-[#2A1E17] rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-xl">
          <div>
            <span className="text-[10px] uppercase font-bold text-[#EA580C]">Storefront Configurator</span>
            <h3 className="text-xl font-bold text-white mt-0.5 leading-snug">
              {productTitle}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Artisan: <strong className="text-white">{artisan ? artisan.name : "Master Lakshya Sharma"}</strong> ({artisan ? artisan.experienceYears : "14"}+ Yrs Exp)
            </p>

            {/* 1️⃣ Wood Selection */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">
                1️⃣ Select Wood Material:
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { name: "Sagwan Teak", priceDiff: 0 },
                  { name: "Sheesham", priceDiff: -4500 },
                  { name: "Mango Wood", priceDiff: -9000 }
                ].map((w) => (
                  <button
                    key={w.name}
                    onClick={() => setSelectedWood(w)}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedWood.name === w.name 
                        ? "border-[#EA580C] bg-[#EA580C]/20 text-white font-bold shadow-md" 
                        : "border-[#2A1E17] bg-[#120B08] text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className="truncate">{w.name}</div>
                    <div className="text-[10px] font-mono text-[#EAB308] mt-0.5">
                      {w.priceDiff === 0 ? "Base" : `${w.priceDiff > 0 ? "+" : ""}₹${w.priceDiff}`}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2️⃣ Size Capacity */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">
                2️⃣ Select Seating Capacity:
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: "4-Seater", priceDiff: -5000 },
                  { label: "6-Seater", priceDiff: 0 },
                  { label: "8-Seater", priceDiff: 8500 }
                ].map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setCapacity(c)}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      capacity.label === c.label 
                        ? "border-[#EA580C] bg-[#EA580C]/20 text-white font-bold shadow-md" 
                        : "border-[#2A1E17] bg-[#120B08] text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div>{c.label}</div>
                    <div className="text-[10px] font-mono text-[#EAB308] mt-0.5">
                      {c.priceDiff === 0 ? "Base Size" : `${c.priceDiff > 0 ? "+" : ""}₹${c.priceDiff}`}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3️⃣ Accent Options */}
            <div className="mb-4 space-y-2">
              <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                3️⃣ Add Surface Accents:
              </label>
              
              <label className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer border transition-all ${
                hasBrassInlay ? "bg-[#EA580C]/15 border-[#EA580C] text-white" : "bg-[#120B08] border-[#2A1E17] text-slate-400"
              }`}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={hasBrassInlay} onChange={(e) => setHasBrassInlay(e.target.checked)} className="accent-[#EA580C] w-4 h-4 rounded" />
                  Hand-Hammered Brass Wire Inlay
                </span>
                <span className="text-[#EA580C] font-mono font-bold">+₹2,500</span>
              </label>

              <label className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer border transition-all ${
                hasMOP ? "bg-[#EA580C]/15 border-[#EA580C] text-white" : "bg-[#120B08] border-[#2A1E17] text-slate-400"
              }`}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={hasMOP} onChange={(e) => setHasMOP(e.target.checked)} className="accent-[#EA580C] w-4 h-4 rounded" />
                  Mother of Pearl / Bone Tiles
                </span>
                <span className="text-[#EA580C] font-mono font-bold">+₹3,800</span>
              </label>
            </div>

            {/* 4️⃣ Polish Options */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">
                4️⃣ Surface Polish & Oils:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { name: "Beeswax Matte", priceDiff: 0 },
                  { name: "PU Gloss", priceDiff: 1800 }
                ].map((pol) => (
                  <button
                    key={pol.name}
                    onClick={() => setSelectedPolish(pol)}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedPolish.name === pol.name
                        ? "border-[#EA580C] bg-[#EA580C]/20 text-white font-bold shadow-md"
                        : "border-[#2A1E17] bg-[#120B08] text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div>{pol.name}</div>
                    <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                      {pol.priceDiff === 0 ? "Standard" : `+₹${pol.priceDiff}`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* DYNAMIC CONFIGURATION SUMMARY */}
          <div className="bg-[#1A120E] border border-[#2A1E17] p-5 rounded-2xl space-y-3">
            <h4 className="text-sm font-bold text-white mb-2 border-b border-[#2A1E17] pb-2">Configuration Summary</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Base Item: {productTitle}</span>
                <span className="font-mono text-white">
                  {basePrice != null ? `₹${basePrice.toLocaleString("en-IN")}` : "Price not set / कीमत तय नहीं"}
                </span>
              </div>
              {selectedWood.priceDiff !== 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Wood Upgrade ({selectedWood.name})</span>
                  <span className="text-[#EA580C] font-mono">+{selectedWood.priceDiff.toLocaleString("en-IN")}</span>
                </div>
              )}
              {capacity.priceDiff !== 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Size Upgrade ({capacity.label})</span>
                  <span className="text-[#EA580C] font-mono">+{capacity.priceDiff.toLocaleString("en-IN")}</span>
                </div>
              )}
              {hasBrassInlay && (
                <div className="flex justify-between text-slate-400">
                  <span>Accent (Brass Inlay)</span>
                  <span className="text-[#EA580C] font-mono">+2,500</span>
                </div>
              )}
              {hasMOP && (
                <div className="flex justify-between text-slate-400">
                  <span>Accent (Mother of Pearl)</span>
                  <span className="text-[#EA580C] font-mono">+3,800</span>
                </div>
              )}
              {selectedPolish.priceDiff !== 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Polish ({selectedPolish.name})</span>
                  <span className="text-[#EA580C] font-mono">+{selectedPolish.priceDiff.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
            <div className="pt-3 mt-3 border-t border-[#2A1E17]">
              <textarea 
                className="w-full bg-[#120B08] border border-[#2A1E17] rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#EA580C]" 
                rows={3} 
                placeholder="Add custom dimensions, specific carving requests, or notes for the artisan..."
              ></textarea>
            </div>
          </div>

          {/* DYNAMIC TOTAL PRICE DISPLAY */}
          <div className="bg-[#1A120E] border border-[#EA580C] p-5 rounded-2xl space-y-3">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Base Product Price:</span>
              <span className="font-mono text-white">
                {basePrice != null ? `₹${basePrice.toLocaleString("en-IN")}` : "Price not set / कीमत तय नहीं"}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Upgrades & Accents Total:</span>
              <span className="text-[#EA580C] font-mono font-bold">
                +₹{upgradesTotal.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="border-t border-[#2A1E17] pt-2.5 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-200 uppercase">Total Customized Price:</span>
              <span className="text-2xl font-extrabold text-[#EAB308] font-mono glow-orange">
                {totalAmount != null ? `₹${totalAmount.toLocaleString("en-IN")}` : "Price not set / कीमत तय नहीं"}
              </span>
            </div>

            <button 
              onClick={handleBookOrder}
              disabled={isBooked}
              className={`w-full py-3.5 rounded-xl text-xs font-bold text-white transition-all shadow-lg flex items-center justify-center space-x-2 ${
                isBooked ? "bg-emerald-600 cursor-not-allowed" : "bg-[#EA580C] hover:bg-[#C2410C] glow-orange"
              }`}
            >
              {isBooked ? (
                <>
                  <Check className="w-4 h-4 animate-bounce" />
                  <span>Booked Direct with {artisan ? artisan.name.split(" ")[0] : "Lakshya"}!</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  <span>🛍️ Book Direct with {artisan ? artisan.name.split(" ")[0] : "Master Lakshya"}</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>



      {/* Fullscreen 3D Viewport Modal */}
      {is3DFullscreenOpen && (
        <ThreeDProductViewer
          product={(product as unknown as Product) || MOCK_PRODUCTS[0]}
          onClose={() => setIs3DFullscreenOpen(false)}
        />
      )}

    </div>
  );
};
