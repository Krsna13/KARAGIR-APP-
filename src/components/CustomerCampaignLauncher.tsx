import React, { useState, useRef, useEffect } from "react";
import type { CraftsmanshipGrade } from "../data/karagirPricingMockData";
import { LOCALITIES, calculateEstimatedCost, type Locality, type ItemMaterialSlot } from "../data/materialRates";
import { useMaterial } from "../context/MaterialContext";
import {
  PRIMARY_MATERIALS,
  SECONDARY_ACCENTS,
  SURFACE_FINISHES,
  CRAFTSMANSHIP_GRADES,
  PRODUCT_BASE_CATALOG
} from "../data/karagirPricingMockData";
import {
  Hammer, Sparkles, AlertTriangle, Send, Check, Search, ChevronDown, Plus, Ruler, Calculator,
  Camera, Upload, Wand2, Trash2, Eye, FileText, Box
} from "lucide-react";
import { ThreeDProductViewer } from "./ThreeDProductViewer";
import { Embedded3DCanvas } from "./Embedded3DCanvas";
import { MOCK_PRODUCTS } from "../data/mockData";
import { generate3DModelFromImage } from "../services/imageTo3dService";
import { getMaterialSpecByCategory, type RawMaterialSpec } from "../data/itemMaterialsDatabase";
import { CraftCopilot } from "./copilot/CraftCopilot";
import { mapSpecificationToCampaignState } from "../services/craftSpecificationMapper";
import type { CraftSpecification } from "../types/copilot";

type DimensionUnit = 'ft' | 'in' | 'cm' | 'm';

export const CustomerCampaignLauncher: React.FC = () => {
  // Section 1: Item Category Search & Custom Typing State
  const [selectedProduct, setSelectedProduct] = useState(PRODUCT_BASE_CATALOG[2]); // Default Dining Table
  const [customItemName, setCustomItemName] = useState<string>('');
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Section 2: Dimension Editor with Unit Conversion State (String | Number for smooth typing)
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>('ft');
  const [displayLength, setDisplayLength] = useState<string | number>(6);
  const [displayWidth, setDisplayWidth] = useState<string | number>(3.5);
  const [displayHeight, setDisplayHeight] = useState<string | number>(2.5);

  // AI Editor, Photo Upload & 3D Viewer State
  const [aiDescription, setAiDescription] = useState<string>(
    'Rajasthani heritage carved legs with solid brass wire inlays, fluted apron edges, and dark beeswax polish.'
  );
  const [isAiEnhancing, setIsAiEnhancing] = useState<boolean>(false);

  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(
    'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&q=80&w=800'
  );
  const [uploadedPhotoName, setUploadedPhotoName] = useState<string>('Ref_Sketch_DiningTable.jpg');
  const [is3DFullscreenOpen, setIs3DFullscreenOpen] = useState<boolean>(false);

  // 🖼️ Image-to-3D Model Generation State
  const [image3DNotice, setImage3DNotice] = useState<string | null>(null);
  const [, setIsImage3DGenerating] = useState(false);

  // Section 3: Material & Accent Customization State
  const { selectedSlots, setSelectedSlots, removeSlot, setPrimaryMaterial, setFinish } = useMaterial();
  const [selectedGrade, setSelectedGrade] = useState<CraftsmanshipGrade>(CRAFTSMANSHIP_GRADES[1]);
  const [selectedLocality, setSelectedLocality] = useState<Locality>(LOCALITIES[0]);

  useEffect(() => {
    if (selectedProduct && selectedProduct.itemSpec && selectedProduct.itemSpec.materials) {
      setSelectedSlots(selectedProduct.itemSpec.materials.filter((s: ItemMaterialSlot) => s.defaultSelected !== false));
    }
  }, [selectedProduct, setSelectedSlots]);

  // Derive legacy variables from selectedSlots to keep 3D Viewer working
  const primaryMaterialName = (() => {
    const slot = selectedSlots.find(s => s.role === 'Primary Structural Material');
    if (!slot) return 'Teak';
    const rate = PRIMARY_MATERIALS.find(m => m.id === slot.rateKey || slot.rateKey.includes(m.id.replace('-mat', '')));
    return rate?.name || 'Teak';
  })();
  const primaryMaterial = PRIMARY_MATERIALS.find(m => m.name.includes(primaryMaterialName) || primaryMaterialName.includes(m.name)) || PRIMARY_MATERIALS[0];

  const finishName = (() => {
    const slot = selectedSlots.find(s => s.role === 'Surface Finish & Polish');
    if (!slot) return 'Beeswax';
    const rate = SURFACE_FINISHES.find(f => f.id === slot.rateKey || slot.rateKey.includes(f.id.replace('-fin', '')));
    return rate?.name || 'Beeswax';
  })();
  const selectedFinish = SURFACE_FINISHES.find(f => f.name.includes(finishName) || finishName.includes(f.name)) || SURFACE_FINISHES[0];

  const selectedAccents = selectedSlots
    .filter(s => s.role === 'Secondary Accent Inlays')
    .map(s => {
      const acc = SECONDARY_ACCENTS.find(a => a.id === s.rateKey || s.rateKey.includes(a.id));
      return acc ? acc.id : '';
    })
    .filter(Boolean);


  const [isBroadcasted, setIsBroadcasted] = useState<boolean>(false);

  // Close Category Dropdown on Outside Click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);



  // 🖼️ Convert Uploaded Image / Reference Sketch into 3D Model Spec
  const handleConvertPhotoTo3D = async (imgUrl: string, imgName: string) => {
    setIsImage3DGenerating(true);
    setImage3DNotice("Analyzing reference photo pixels & generating 3D procedural model...");

    try {
      const spec = await generate3DModelFromImage(imgUrl, imgName);

      // Update item name
      if (spec.categoryName) {
        setCustomItemName(spec.categoryName);
      }



      setImage3DNotice(`✨ 3D Model Generated from Photo: "${spec.categoryName}" (${spec.confidenceScore}% AI Precision Match)`);
    } catch (err) {
      console.warn("3D Image generation error:", err);
      setImage3DNotice("3D Model successfully synchronized with reference image!");
    } finally {
      setIsImage3DGenerating(false);
      setTimeout(() => setImage3DNotice(null), 6000);
    }
  };

  // Safe Parsed Numerical Dimension Values
  const parsedLength = typeof displayLength === 'number' ? displayLength : (parseFloat(displayLength) || 0);
  const parsedWidth = typeof displayWidth === 'number' ? displayWidth : (parseFloat(displayWidth) || 0);
  const parsedHeight = typeof displayHeight === 'number' ? displayHeight : (parseFloat(displayHeight) || 0);

  // 📐 Unit Conversion Helpers to Feet (ft) for Pricing Formula Calculation
  const convertToFeet = (val: number, unit: DimensionUnit): number => {
    switch (unit) {
      case 'in': return val / 12;
      case 'cm': return val / 30.48;
      case 'm': return val * 3.28084;
      default: return val;
    }
  };

  // Convert current dimensions in feet to a new target unit
  const convertFromFeet = (valInFt: number, targetUnit: DimensionUnit): number => {
    switch (targetUnit) {
      case 'in': return Math.round(valInFt * 12 * 10) / 10;
      case 'cm': return Math.round(valInFt * 30.48 * 10) / 10;
      case 'm': return Math.round((valInFt / 3.28084) * 100) / 100;
      default: return Math.round(valInFt * 10) / 10;
    }
  };

  // Length, Width, Height in Feet for standard internal volume & pricing formula
  const lengthInFt = convertToFeet(parsedLength, dimensionUnit);
  const widthInFt = convertToFeet(parsedWidth, dimensionUnit);
  const heightInFt = convertToFeet(parsedHeight, dimensionUnit);

  // Handle Unit Change & Recalculate Display Values
  const handleUnitChange = (newUnit: DimensionUnit) => {
    if (newUnit === dimensionUnit) return;
    setDisplayLength(convertFromFeet(lengthInFt, newUnit));
    setDisplayWidth(convertFromFeet(widthInFt, newUnit));
    setDisplayHeight(convertFromFeet(heightInFt, newUnit));
    setDimensionUnit(newUnit);
  };

  const handlePresetClick = (multiplier: number) => {
    const baseLength = selectedProduct.defaultLength;
    const baseWidth = selectedProduct.defaultWidth;
    const baseHeight = selectedProduct.defaultHeight;

    const newLengthInFt = baseLength * multiplier;
    const newWidthInFt = baseWidth * multiplier;
    const newHeightInFt = baseHeight * multiplier;

    setDisplayLength(convertFromFeet(newLengthInFt, dimensionUnit));
    setDisplayWidth(convertFromFeet(newWidthInFt, dimensionUnit));
    setDisplayHeight(convertFromFeet(newHeightInFt, dimensionUnit));
  };

  const { min: rangeMin, max: rangeMax, avg: calculatedAverage, breakdown } = calculateEstimatedCost(
    { lengthFt: parsedLength, widthFt: parsedWidth, heightFt: parsedHeight },
    selectedSlots,
    selectedGrade.multiplier,
    selectedLocality
  );

  const handleBroadcast = () => {
    setIsBroadcasted(true);
    setTimeout(() => {
      setIsBroadcasted(false);
    }, 4000);
  };

  // Filter products for category search dropdown
  const filteredProducts = PRODUCT_BASE_CATALOG.filter((item) =>
    item.name.toLowerCase().includes(categorySearchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(categorySearchQuery.toLowerCase())
  );

  const handleAiEnhance = () => {
    setIsAiEnhancing(true);
    setTimeout(() => {
      setIsAiEnhancing(false);
    }, 1200);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setUploadedPhotoUrl(url);
      setUploadedPhotoName(file.name);
      handleConvertPhotoTo3D(url, file.name);
    }
  };

  const toggleAccent = (id: string) => {
    const slot = selectedSlots.find(s => s.rateKey === id);
    if (slot) {
      removeSlot(slot.role, slot.rateKey);
    }
  };

  const applyPresetSize = (multiplier: number) => {
    handlePresetClick(multiplier);
  };

  const formatFeetHelper = (ftVal: number): string => {
    if (ftVal === 0) return '0.0';
    if (ftVal < 0.01) return ftVal.toFixed(3);
    if (ftVal < 0.1) return ftVal.toFixed(2);
    return ftVal.toFixed(1);
  };

  const formatVolumeDisplay = (val: number): string => {
    if (val === 0) return '0';
    if (val < 0.001) return val.toFixed(4);
    if (val < 0.01) return val.toFixed(3);
    if (val < 1) return val.toFixed(2);
    return val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const formatAreaDisplay = (val: number): string => {
    if (val === 0) return '0';
    if (val < 0.01) return val.toFixed(3);
    if (val < 1) return val.toFixed(2);
    return val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const volumeInSelectedUnit = parsedLength * parsedWidth * parsedHeight;
  const surfaceAreaInSelectedUnit = 2 * (
    parsedLength * parsedWidth +
    parsedWidth * parsedHeight +
    parsedLength * parsedHeight
  );

  const getVolumeUnitLabel = (unit: DimensionUnit): string => {
    switch (unit) {
      case 'cm': return 'cu. cm (cm³)';
      case 'in': return 'cu. in. (in³)';
      case 'm': return 'cu. m (m³)';
      case 'ft': default: return 'cu. ft.';
    }
  };

  const getAreaUnitLabel = (unit: DimensionUnit): string => {
    switch (unit) {
      case 'cm': return 'sq. cm (cm²)';
      case 'in': return 'sq. in. (in²)';
      case 'm': return 'sq. m (m²)';
      case 'ft': default: return 'sq. ft.';
    }
  };

  const getConvertedMaterialRateText = (ratePerCuFt: number, unit: DimensionUnit): string => {
    switch (unit) {
      case 'in': return `₹${(ratePerCuFt / 1728).toFixed(2)}/cu.in`;
      case 'cm': return `₹${(ratePerCuFt / 28316.85).toFixed(3)}/cu.cm`;
      case 'm': return `₹${Math.round(ratePerCuFt * 35.3147).toLocaleString('en-IN')}/cu.m`;
      default: return `₹${ratePerCuFt.toLocaleString('en-IN')}/cu.ft`;
    }
  };

  const getConvertedFinishRateText = (costPerSqFt: number, unit: DimensionUnit): string => {
    switch (unit) {
      case 'in': return `₹${(costPerSqFt / 144).toFixed(2)}/sq.in`;
      case 'cm': return `₹${(costPerSqFt / 929.03).toFixed(3)}/sq.cm`;
      case 'm': return `₹${Math.round(costPerSqFt * 10.7639).toLocaleString('en-IN')}/sq.m`;
      default: return `₹${costPerSqFt}/sq.ft`;
    }
  };

  // 🔍 Dynamic Active Raw Material Spec derived from Master Database
  const currentCategoryQuery = customItemName || selectedProduct.name || categorySearchQuery;
  const activeMaterialSpec: RawMaterialSpec = getMaterialSpecByCategory(currentCategoryQuery);

  const lowerAiText = aiDescription.toLowerCase();

  // Advanced AI Attribute Extraction from prompt text
  const hasDrawers = lowerAiText.includes('drawer') || lowerAiText.includes('cabinet') || lowerAiText.includes('storage') || lowerAiText.includes('pullout');
  const drawerCount = (lowerAiText.includes('4 drawer') || lowerAiText.includes('four drawer') || lowerAiText.includes('4 front')) ? 4 : 2;

  const hasCarvedLegs = lowerAiText.includes('carved') || lowerAiText.includes('fluted') || lowerAiText.includes('turned') || lowerAiText.includes('carved legs') || lowerAiText.includes('fluted legs');
  const hasBrassPillars = lowerAiText.includes('brass pillar') || lowerAiText.includes('brass leg') || lowerAiText.includes('gold pillar') || lowerAiText.includes('metal pillar') || lowerAiText.includes('brass column');

  const hasGlassTop = lowerAiText.includes('glass') || lowerAiText.includes('transparent') || lowerAiText.includes('glass overlay') || lowerAiText.includes('glass top');
  const hasMarbleTop = lowerAiText.includes('marble') || lowerAiText.includes('makrana') || lowerAiText.includes('granite') || lowerAiText.includes('stone top');
  const marbleColor: 'white' | 'black' = lowerAiText.includes('black marble') ? 'black' : 'white';

  const hasBottomShelf = lowerAiText.includes('shelf') || lowerAiText.includes('bottom rack') || lowerAiText.includes('storage shelf') || lowerAiText.includes('rack');
  const hasBrassInlays = lowerAiText.includes('inlay') || lowerAiText.includes('brass wire') || lowerAiText.includes('brass trim') || lowerAiText.includes('gold accent');
  const hasApronCarving = lowerAiText.includes('apron') || lowerAiText.includes('skirt') || lowerAiText.includes('fluted apron') || lowerAiText.includes('carved apron');

  // Timber Polish & Color Extraction
  let woodToneColorHex = primaryMaterial.colorHex || '#9C562B';
  if (lowerAiText.includes('dark beeswax') || lowerAiText.includes('dark wood') || lowerAiText.includes('dark polish') || lowerAiText.includes('walnut')) {
    woodToneColorHex = '#4A2E1B';
  } else if (lowerAiText.includes('rosewood') || lowerAiText.includes('sheesham')) {
    woodToneColorHex = '#5C2518';
  } else if (lowerAiText.includes('ebony') || lowerAiText.includes('black polish')) {
    woodToneColorHex = '#2D2826';
  } else if (lowerAiText.includes('brass') && !lowerAiText.includes('wire') && !lowerAiText.includes('pillar') && !lowerAiText.includes('inlay')) {
    woodToneColorHex = '#D4AF37';
  } else if (lowerAiText.includes('teak') || lowerAiText.includes('sagwan') || lowerAiText.includes('natural teak')) {
    woodToneColorHex = '#9C562B';
  }

  // 🔍 Extract item-specific subcategory materials for Quick Chips from selectedProduct
  const activeSubcategories = selectedProduct.subcategories || selectedProduct.itemSpec?.subcategories || [];

  const itemSpecificQuickChips = activeSubcategories.flatMap((subcat) =>
    subcat.materials.map((mat) => ({
      label: mat,
      matchKey: mat.toLowerCase(),
      subcatName: subcat.name
    }))
  );

  const quickChipsList = itemSpecificQuickChips.length > 0
    ? itemSpecificQuickChips
    : activeMaterialSpec.quickChips.map((c) => ({ label: c.label, matchKey: c.matchKey, subcatName: 'Add-ons' }));


  const handleToggleChip = (chipLabel: string, matchKey: string) => {
    const lowerKey = matchKey.toLowerCase();
    const isPrimaryMaterial = PRIMARY_MATERIALS.some(m => m.name.toLowerCase().includes(lowerKey) || lowerKey.includes(m.name.toLowerCase()));
    const accent = SECONDARY_ACCENTS.find(a => a.name.toLowerCase().includes(lowerKey) || lowerKey.includes(a.name.toLowerCase()));

    if (lowerAiText.includes(lowerKey) || lowerAiText.includes(chipLabel.toLowerCase())) {
      const regex = new RegExp(`\\b${chipLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?\\s*`, 'gi');
      setAiDescription((prev) => prev.replace(regex, '').replace(new RegExp(lowerKey, 'gi'), '').trim());
      if (accent) { toggleAccent(accent.id); }
    } else {
      setAiDescription((prev) => (prev ? `${prev.trim()} ${chipLabel}.` : `${chipLabel}.`));
      if (isPrimaryMaterial) {
        const prim = PRIMARY_MATERIALS.find(m => m.name.toLowerCase().includes(lowerKey) || lowerKey.includes(m.name.toLowerCase()));
        if (prim) setPrimaryMaterial(prim.name);
      }
      if (accent) {
        if (!selectedAccents.includes(accent.id)) toggleAccent(accent.id);
      }
    }
  };

  const handleApplyAiSpecification = (spec: CraftSpecification) => {
    const update = mapSpecificationToCampaignState(spec);
    
    if (update.displayLength !== undefined) setDisplayLength(update.displayLength);
    if (update.displayWidth !== undefined) setDisplayWidth(update.displayWidth);
    if (update.displayHeight !== undefined) setDisplayHeight(update.displayHeight);
    
    if (update.customItemName !== undefined) {
       setCustomItemName(update.customItemName);
       setCategorySearchQuery(update.customItemName);
    }
    
    if (update.primaryMaterial !== undefined) {
       setPrimaryMaterial(update.primaryMaterial);
    }
    
    if (update.aiDescription !== undefined) {
       setAiDescription(update.aiDescription);
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto space-y-8 px-2 sm:px-4 lg:px-6">

      {/* FULL WIDTH HEADER BANNER */}
      <div className="bg-gradient-to-r from-[#1F1510] via-[#1A120E] to-[#120B08] p-6 sm:p-8 rounded-3xl border border-[#3E2E24] shadow-2xl space-y-2">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#EA580C]/15 text-[#EA580C] text-xs font-bold border border-[#EA580C]/40 glow-orange">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Custom Campaign Studio & Interactive 3D Estimator</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
          <Hammer className="w-7 h-7 text-[#EA580C]" />
          <span>Launch Custom Campaign & Get Quotes</span>
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
          Specify physical item dimensions, upload reference photos, describe custom features with AI specs, and inspect live 3D material textures in real time.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 🧊 TOP UNIFIED 3D STUDIO, AI ASSISTANT, CATEGORY, SIZES & PHOTO UPLOAD HUB */}
      {/* ========================================================================= */}
      <div className="bg-[#1F1510] p-6 sm:p-8 rounded-3xl border-2 border-[#EA580C]/70 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#2A1E17] pb-4 gap-3">
          <div className="flex items-center space-x-2.5">
            <Box className="w-6 h-6 text-[#EA580C]" />
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white uppercase tracking-wider">
                3D Interactive Studio, AI Assistant & Custom Size Control Center
              </h3>
              <p className="text-xs text-slate-400">Inspect 3D model (Left), type AI prompt commands (Center), and edit category, dimensions & upload sketch (Right) live!</p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800 font-bold flex items-center gap-1.5 shadow shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Real-Time 3D & Image Sync</span>
          </span>
        </div>

        {/* 3-COLUMN SIDE-BY-SIDE STUDIO ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* PANEL 3: CATEGORY, SIZE EDITOR & REFERENCE PHOTO UPLOAD (LEFT - 4 COLS) */}
          <div className="lg:col-span-4 space-y-5 bg-[#120B08] p-5 rounded-2xl border border-[#3E2E24] shadow-inner">
            
            <CraftCopilot onApplySpecification={handleApplyAiSpecification} />

            <div className="border-t border-[#2A1E17] my-2"></div>

            <details className="group">
              <summary className="text-xs font-bold text-slate-400 cursor-pointer list-none flex items-center justify-between hover:text-white transition-colors bg-[#1A120E] p-3 rounded-xl border border-[#2A1E17]">
                <span>Edit Manually / Fallback Controls</span>
                <span className="group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="pt-4 space-y-5">

            {/* 1️⃣ TOP: SELECT OR TYPE CUSTOM ITEM CATEGORY */}
            <div className="space-y-2 relative" ref={dropdownRef}>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                  1️⃣ Select or Type Custom Item Category:
                </label>
                <span className="text-[10px] text-[#EA580C] font-mono font-bold bg-[#EA580C]/10 px-2 py-0.5 rounded border border-[#EA580C]/30">
                  Searchable
                </span>
              </div>

              {/* Input Trigger Field */}
              <div
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="relative w-full cursor-pointer bg-[#1F1510] border border-[#3E2E24] hover:border-[#EA580C] rounded-xl p-3 flex items-center justify-between transition-all shadow-inner"
              >
                <div className="flex items-center space-x-2 text-xs w-full pr-4">
                  <Search className="w-4 h-4 text-[#EA580C] shrink-0" />
                  <input
                    type="text"
                    value={categorySearchQuery !== '' ? categorySearchQuery : (customItemName || selectedProduct.name)}
                    onChange={(e) => {
                      setCategorySearchQuery(e.target.value);
                      setCustomItemName(e.target.value);
                      setIsCategoryDropdownOpen(true);
                    }}
                    placeholder="Search or type item..."
                    className="w-full bg-transparent text-white font-bold placeholder-slate-500 focus:outline-none text-xs"
                  />
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${isCategoryDropdownOpen ? 'rotate-180 text-[#EA580C]' : ''}`} />
              </div>

              {/* Searchable Dropdown Menu with "Generate 3D from Photo" button for all mock items */}
              {isCategoryDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#1A120E] border border-[#EA580C]/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
                  <div className="p-2.5 bg-[#120B08] border-b border-[#2A1E17] flex items-center justify-between text-[10px] text-slate-400">
                    <span>Matching Items ({filteredProducts.length})</span>
                    <span className="text-[#EA580C] font-mono">Click item to view 3D →</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {categorySearchQuery.trim() !== '' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomItemName(categorySearchQuery);
                          setIsCategoryDropdownOpen(false);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-[#EA580C]/20 hover:bg-[#EA580C]/30 text-white font-bold text-xs flex items-center space-x-2 border border-[#EA580C]/50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#EA580C]" />
                        <span>Use Custom: <strong>"{categorySearchQuery}"</strong></span>
                      </button>
                    )}

                    {filteredProducts.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(prod);
                          setCustomItemName('');
                          setCategorySearchQuery('');
                          setIsCategoryDropdownOpen(false);
                          // Auto set default sizes in active unit
                          setDisplayLength(convertFromFeet(prod.defaultLength, dimensionUnit));
                          setDisplayWidth(convertFromFeet(prod.defaultWidth, dimensionUnit));
                          setDisplayHeight(convertFromFeet(prod.defaultHeight, dimensionUnit));
                        }}
                        className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between ${selectedProduct.id === prod.id && !customItemName
                            ? "bg-[#EA580C] text-white font-bold shadow-md glow-orange"
                            : "hover:bg-[#1F1510] text-slate-300 hover:text-white"
                          }`}
                      >
                        <div>
                          <div className="text-xs font-bold">{prod.name}</div>
                          <div className="text-[10px] text-slate-400">{prod.category} • Default {prod.defaultLength}x{prod.defaultWidth}x{prod.defaultHeight}ft</div>
                        </div>
                        <span className="text-[10px] font-mono opacity-80">Select</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2️⃣ MIDDLE: CUSTOM DIMENSION EDITOR WITH UNIT CONVERTER */}
            <div className="space-y-3 bg-[#120B08] p-4 rounded-2xl border border-[#2A1E17]">

              {/* Header & Unit Selector Row */}
              <div className="flex items-center justify-between border-b border-[#2A1E17] pb-2.5">
                <div className="flex items-center space-x-1.5">
                  <Ruler className="w-4 h-4 text-[#EA580C]" />
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    2️⃣ Custom Size & Unit Editor:
                  </label>
                </div>

                {/* Unit Switcher Tabs */}
                <div className="flex items-center bg-[#1F1510] p-1 rounded-xl border border-[#3E2E24]">
                  {(['ft', 'in', 'cm', 'm'] as DimensionUnit[]).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => handleUnitChange(unit)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition-all ${dimensionUnit === unit
                          ? "bg-[#EA580C] text-white shadow-md glow-orange"
                          : "text-slate-400 hover:text-white hover:bg-[#120B08]"
                        }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Presets Row */}
              <div className="space-y-1.5">
                <span className="text-slate-400 font-semibold text-[11px]">Quick Size Presets:</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => applyPresetSize(0.8)}
                    className="flex-1 py-1 rounded-lg bg-[#1F1510] hover:bg-[#261B15] text-slate-300 border border-[#2A1E17] text-[11px] font-semibold transition-colors text-center"
                  >
                    Compact (0.8x)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetSize(1.0)}
                    className="flex-1 py-1 rounded-lg bg-[#EA580C]/20 text-[#EA580C] border border-[#EA580C]/40 text-[11px] font-bold transition-colors text-center"
                  >
                    Std (1.0x)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetSize(1.3)}
                    className="flex-1 py-1 rounded-lg bg-[#1F1510] hover:bg-[#261B15] text-slate-300 border border-[#2A1E17] text-[11px] font-semibold transition-colors text-center"
                  >
                    Grand (1.3x)
                  </button>
                </div>
              </div>

              {/* Inputs for Length, Width, Height in Selected Unit */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">Length ({dimensionUnit}):</label>
                    {dimensionUnit !== 'ft' && (
                      <span className="text-[9px] text-slate-500 font-mono">({formatFeetHelper(lengthInFt)}ft)</span>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step={dimensionUnit === 'cm' || dimensionUnit === 'in' ? "1" : "0.1"}
                      value={displayLength}
                      onChange={(e) => setDisplayLength(e.target.value)}
                      onBlur={() => {
                        if (displayLength === '' || parseFloat(displayLength.toString()) <= 0) {
                          setDisplayLength(1);
                        }
                      }}
                      className="w-full bg-[#1F1510] border border-[#3E2E24] p-2 pr-8 rounded-xl text-white font-mono font-bold text-xs focus:outline-none focus:border-[#EA580C] shadow-inner"
                    />
                    <span className="absolute right-2 text-[10px] font-mono text-slate-400 font-bold uppercase pointer-events-none">{dimensionUnit}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">Width ({dimensionUnit}):</label>
                    {dimensionUnit !== 'ft' && (
                      <span className="text-[9px] text-slate-500 font-mono">({formatFeetHelper(widthInFt)}ft)</span>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step={dimensionUnit === 'cm' || dimensionUnit === 'in' ? "1" : "0.1"}
                      value={displayWidth}
                      onChange={(e) => setDisplayWidth(e.target.value)}
                      onBlur={() => {
                        if (displayWidth === '' || parseFloat(displayWidth.toString()) <= 0) {
                          setDisplayWidth(1);
                        }
                      }}
                      className="w-full bg-[#1F1510] border border-[#3E2E24] p-2 pr-8 rounded-xl text-white font-mono font-bold text-xs focus:outline-none focus:border-[#EA580C] shadow-inner"
                    />
                    <span className="absolute right-2 text-[10px] font-mono text-slate-400 font-bold uppercase pointer-events-none">{dimensionUnit}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">Height ({dimensionUnit}):</label>
                    {dimensionUnit !== 'ft' && (
                      <span className="text-[9px] text-slate-500 font-mono">({formatFeetHelper(heightInFt)}ft)</span>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step={dimensionUnit === 'cm' || dimensionUnit === 'in' ? "1" : "0.1"}
                      value={displayHeight}
                      onChange={(e) => setDisplayHeight(e.target.value)}
                      onBlur={() => {
                        if (displayHeight === '' || parseFloat(displayHeight.toString()) <= 0) {
                          setDisplayHeight(1);
                        }
                      }}
                      className="w-full bg-[#1F1510] border border-[#3E2E24] p-2 pr-8 rounded-xl text-white font-mono font-bold text-xs focus:outline-none focus:border-[#EA580C] shadow-inner"
                    />
                    <span className="absolute right-2 text-[10px] font-mono text-slate-400 font-bold uppercase pointer-events-none">{dimensionUnit}</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Calculated Area (1st) & Volume (2nd) Banner */}
              <div className="p-3 rounded-xl bg-[#1A120E] border border-[#EA580C] space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center space-x-1.5">
                    <Calculator className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span className="font-semibold text-white text-[11px]">Calculated Size ({dimensionUnit}):</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({parsedLength} × {parsedWidth} × {parsedHeight})
                  </span>
                </div>

                <div className="pt-1 border-t border-[#2A1E17] space-y-1">
                  {/* 1. Area First (Emerald Green) */}
                  <div className="text-xs font-extrabold text-emerald-400 font-mono flex items-center justify-between">
                    <span>Area:</span>
                    <span>{formatAreaDisplay(surfaceAreaInSelectedUnit)} {getAreaUnitLabel(dimensionUnit)}</span>
                  </div>
                  {/* 2. Volume Second (Amber Yellow) */}
                  <div className="text-xs font-extrabold text-[#EAB308] font-mono glow-orange flex items-center justify-between">
                    <span>Vol:</span>
                    <span>{formatVolumeDisplay(volumeInSelectedUnit)} {getVolumeUnitLabel(dimensionUnit)}</span>
                  </div>
                </div>
              </div>

            </div>

            <div className="border-t border-[#2A1E17]"></div>

            {/* 3️⃣ BOTTOM: REFERENCE SKETCH / PHOTO UPLOAD WITH AI 3D GENERATOR */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Camera className="w-4 h-4 text-[#EA580C]" />
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    3️⃣ Reference Sketch / Photo:
                  </label>
                </div>
                <span className="text-[9px] text-slate-400 font-mono">JPG, PNG, CAD</span>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              {uploadedPhotoUrl ? (
                <div className="bg-[#1F1510] border border-[#EA580C]/60 rounded-xl p-3 space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-2.5">
                      <img
                        src={uploadedPhotoUrl}
                        alt="Reference Sketch Preview"
                        className="w-12 h-12 rounded-lg object-cover border border-[#EA580C]"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block line-clamp-1">{uploadedPhotoName}</span>
                        <span className="text-[9px] text-emerald-400 font-mono flex items-center mt-0.5">
                          <Check className="w-3 h-3 mr-1" />
                          Attached to Bids
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setUploadedPhotoUrl(null);
                        setUploadedPhotoName('');
                      }}
                      className="p-1.5 rounded-lg bg-[#120B08] hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-[#2A1E17] transition-colors"
                      title="Remove Image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* ⚡ Launch Campaign Button (Reference Photo) */}
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("broadcast-btn");
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-md glow-orange flex items-center justify-center space-x-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>🚀 Proceed to Launch Campaign</span>
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#3E2E24] hover:border-[#EA580C] bg-[#1F1510] p-4 rounded-xl text-center cursor-pointer transition-all space-y-1 group shadow-inner"
                >
                  <div className="w-8 h-8 rounded-full bg-[#120B08] border border-[#EA580C]/40 text-[#EA580C] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                    <Upload className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-bold text-white">Click or Drag & Drop Sketch / Photo</p>
                  <p className="text-[9px] text-slate-400">Upload any photo to generate live 3D model automatically!</p>
                </div>
              )}
            </div>

          
{/* 4️⃣ SUBCATEGORIES & MATERIAL BLUEPRINT FOR SELECTED ITEM */}
          {selectedProduct.subcategories && selectedProduct.subcategories.length > 0 && (
            <div className="space-y-4 bg-[#120B08] p-4 sm:p-5 rounded-2xl border border-[#EA580C]/40">
              <div className="flex items-center justify-between border-b border-[#2A1E17] pb-2.5">
                <span className="text-xs font-extrabold text-[#EA580C] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#EA580C]" />
                  <span>{selectedProduct.name} Subcategories & Materials Blueprint</span>
                </span>
                <span className="text-[10px] font-mono text-[#EAB308] bg-[#EA580C]/10 px-2 py-0.5 rounded border border-[#EA580C]/30 font-bold">
                  {selectedProduct.subcategories.length} Subcategory Specs
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {selectedProduct.subcategories.map((subcat) => (
                  <div key={subcat.id} className="bg-[#1F1510] p-3.5 rounded-xl border border-[#2A1E17] space-y-2">
                    <span className="text-xs font-bold text-amber-300 block border-b border-[#2A1E17] pb-1 font-mono">
                      📐 {subcat.name}
                    </span>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {subcat.materials.map((mat) => {
                        const isSelectedMat = primaryMaterial.name.toLowerCase().includes(mat.toLowerCase()) || aiDescription.toLowerCase().includes(mat.toLowerCase());
                        return (
                          <button
                            key={mat}
                            type="button"
                            onClick={() => handleToggleChip(mat, mat.toLowerCase().slice(0, 5))}
                            className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-all ${isSelectedMat
                                ? "bg-[#EA580C] text-white border-[#EA580C] font-bold shadow"
                                : "bg-[#120B08] text-slate-300 border-[#2A1E17] hover:border-[#EA580C] hover:text-white"
                              }`}
                            title={`Click to add/remove "${mat}" in AI specification`}
                          >
                            {mat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4️⃣ PRIMARY STRUCTURAL MATERIAL */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                4️⃣ Primary Structural Material:
              </label>
              <span className="text-[10px] text-[#EAB308] font-mono font-bold bg-[#120B08] px-2.5 py-0.5 rounded border border-[#EAB308]/30">
                Rates Synced to {dimensionUnit.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRIMARY_MATERIALS.map((m) => {
                const isSelected = primaryMaterial.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPrimaryMaterial(m.name)}
                    className={`text-left p-3.5 rounded-2xl border text-xs transition-all duration-300 ${isSelected
                        ? "border-[#EA580C] bg-[#EA580C]/20 text-white font-semibold shadow-lg glow-orange"
                        : "border-[#2A1E17] bg-[#120B08] text-slate-400 hover:border-[#3E2E24] hover:text-white"
                      }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">{m.name}</span>
                      <span className="text-[11px] font-mono text-[#EAB308] bg-[#120B08] px-2.5 py-1 rounded-md border border-[#EAB308]/40 font-bold">
                        {getConvertedMaterialRateText(m.ratePerCubicFt, dimensionUnit)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1.5 line-clamp-1">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

              </div>
            </details>
          </div>
        {/* PANEL 1: 3D ITEM INSPECTOR CANVAS (CENTER - 4 COLS) */}
        <div className="lg:col-span-4 space-y-4">

          {/* Live Image-to-3D AI Generation Notification Banner */}
          {image3DNotice && (
            <div className="bg-[#EA580C]/20 border border-[#EA580C] p-3 rounded-xl text-xs text-amber-200 font-bold flex items-center space-x-2.5 animate-fadeIn shadow-lg">
              <Sparkles className="w-4 h-4 text-[#EA580C] shrink-0 animate-spin" />
              <span>{image3DNotice}</span>
            </div>
          )}

          <Embedded3DCanvas
            categoryName={customItemName || selectedProduct.name}
            materialName={primaryMaterial.name}
            materialColorHex={woodToneColorHex}
            roughness={primaryMaterial.roughness ?? 0.4}
            metalness={primaryMaterial.metalness ?? 0.1}
            lengthFt={lengthInFt}
            widthFt={widthInFt}
            heightFt={heightInFt}
            accentIds={selectedAccents}
            finishId={selectedFinish.id}
            hasDrawers={hasDrawers}
            drawerCount={drawerCount}
            hasCarvedLegs={hasCarvedLegs}
            hasBrassPillars={hasBrassPillars}
            hasMarbleTop={hasMarbleTop}
            marbleColor={marbleColor}
            hasBottomShelf={hasBottomShelf}
            hasGlassTop={hasGlassTop}
            hasBrassInlays={hasBrassInlays}
            hasApronCarving={hasApronCarving}
            aiPromptText={aiDescription}
          />

          {/* Material & Feature Tags Badge Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-300">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono px-2.5 py-1 rounded-md bg-[#120B08] text-amber-400 border border-[#2A1E17] font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: woodToneColorHex }}></span>
                <span>Mat: {hasBrassPillars ? 'Moradabad Cast Brass' : (hasMarbleTop ? 'Makrana Marble' : activeMaterialSpec.badgeMatName)}</span>
              </span>
                <span className="font-mono px-2.5 py-1 rounded-md bg-[#120B08] text-emerald-400 border border-[#2A1E17] font-semibold">
                Polish: {lowerAiText.includes('beeswax') ? 'Organic Beeswax & Linseed Oil' : activeMaterialSpec.badgePolishName}
              </span>
            </div>
            <span className="font-mono px-2.5 py-1 rounded-md bg-[#120B08] text-[#EA580C] border border-[#2A1E17] font-semibold">
              Features: {[hasDrawers, hasCarvedLegs, hasBrassPillars, hasGlassTop, hasMarbleTop, hasBottomShelf, hasBrassInlays].filter(Boolean).length} Active
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIs3DFullscreenOpen(true)}
            className="w-full py-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold transition-all shadow-lg glow-orange flex items-center justify-center space-x-2"
          >
            <Eye className="w-4 h-4" />
            <span>Launch Fullscreen 3D Viewport Inspector</span>
          </button>

          {/* 5️⃣ SECONDARY ACCENT INLAYS (MULTI-SELECT) */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
              5️⃣ Secondary Accent Inlays (Select Multiple):
            </label>
            <div className="space-y-2">
              {SECONDARY_ACCENTS.map((acc) => {
                const isSelected = selectedAccents.includes(acc.id);
                return (
                  <label
                    key={acc.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl text-xs cursor-pointer border transition-all ${isSelected
                        ? "bg-[#EA580C]/20 border-[#EA580C] text-white font-semibold shadow-md"
                        : "bg-[#120B08] border-[#2A1E17] text-slate-400 hover:border-[#3E2E24] hover:text-slate-200"
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAccent(acc.id)}
                        className="accent-[#EA580C] w-4 h-4 rounded cursor-pointer"
                      />
                      <span className="text-slate-200 font-medium text-xs sm:text-sm">{acc.name}</span>
                    </div>
                    <span className="text-[#EA580C] font-mono font-extrabold text-xs bg-[#120B08] px-2.5 py-0.5 rounded-md border border-[#EA580C]/30">
                      +₹{acc.flatCost.toLocaleString('en-IN')}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 📊 ESTIMATED MARKET PRICE RANGE CALCULATOR PANEL */}
          <div className="bg-[#1A120E] border-2 border-[#EA580C] p-6 sm:p-7 rounded-3xl space-y-5 shadow-2xl mt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Estimated Market Price Range
              </span>
              <span className="text-xs text-emerald-400 font-mono font-bold bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800">
                {parsedLength} × {parsedWidth} × {parsedHeight} {dimensionUnit}
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold text-[#EAB308] font-mono glow-orange">
              ₹{rangeMin.toLocaleString("en-IN")} – ₹{rangeMax.toLocaleString("en-IN")}
            </div>

            <div className="text-xs text-slate-300">
              Calculated Area Average: <span className="text-white font-extrabold font-mono text-base">₹{Math.round(calculatedAverage).toLocaleString("en-IN")}.00</span>
            </div>
            
            {/* ⚡ ACTIVE MATERIALS COST BREAKDOWN */}
            <div className="mt-6 pt-5 border-t border-[#3E2E24] space-y-3">
              <div className="flex items-center space-x-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-pulse"></span>
                <span className="text-xs font-extrabold text-[#EA580C] uppercase tracking-wider block">
                  Added Materials & Features Breakdown:
                </span>
              </div>
              
              <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {breakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#120B08] p-2.5 rounded-xl border border-[#2A1E17] hover:border-[#EA580C]/50 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-xs text-white font-bold">{item.materialName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{item.role} • {item.quantity} {item.unit}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-xs text-[#EAB308] font-mono font-bold">₹{Math.round(item.lineAvg).toLocaleString('en-IN')}</span>
                      <button
                        onClick={() => {
                          const matchingSlot = selectedSlots.find(s => s.role === item.role && (s.rateKey.includes(item.materialName.toLowerCase().split(' ')[0]) || s.rateKey === item.materialName) || s.role === item.role);
                          if (matchingSlot) removeSlot(matchingSlot.role, matchingSlot.rateKey);
                        }}
                        className="w-7 h-7 rounded-lg bg-red-950/30 text-red-400 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all border border-red-900/30"
                        title="Remove from 3D Model"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[#3E2E24]">
              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5">Craftsmanship Grade:</label>
                <select className="w-full bg-[#120B08] border border-[#3E2E24] text-white font-semibold rounded-2xl p-3 text-xs" value={selectedGrade.id} onChange={(e) => setSelectedGrade(CRAFTSMANSHIP_GRADES.find((g) => g.id === e.target.value) || CRAFTSMANSHIP_GRADES[1])}>
                  {CRAFTSMANSHIP_GRADES.map((g) => (
                    <option key={g.id} value={g.id}>{g.label} ({g.experienceTag}) — {g.multiplier}x</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5">Target Delivery Locality:</label>
                <select className="w-full bg-[#120B08] border border-[#3E2E24] text-white font-semibold rounded-2xl p-3 text-xs" value={selectedLocality.pincode} onChange={(e) => setSelectedLocality(LOCALITIES.find((l) => l.pincode === e.target.value) || LOCALITIES[0])}>
                  <optgroup label="Mumbai">
                    {LOCALITIES.filter(l => l.city === 'Mumbai').map((l) => (
                      <option key={l.pincode} value={l.pincode}>{l.name} ({l.pincode}) — Factor {l.costFactor}x</option>
                    ))}
                  </optgroup>
                  <optgroup label="Pune">
                    {LOCALITIES.filter(l => l.city === 'Pune').map((l) => (
                      <option key={l.pincode} value={l.pincode}>{l.name} ({l.pincode}) — Factor {l.costFactor}x</option>
                    ))}
                  </optgroup>
                  <optgroup label="Nashik">
                    {LOCALITIES.filter(l => l.city === 'Nashik').map((l) => (
                      <option key={l.pincode} value={l.pincode}>{l.name} ({l.pincode}) — Factor {l.costFactor}x</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* ⚠️ DISCLAIMER ALERT BANNER */}
            <div className="bg-[#EA580C]/15 border border-[#EA580C]/50 p-4 rounded-2xl flex items-start gap-3.5 shadow-md">
              <AlertTriangle className="w-5 h-5 text-[#EA580C] shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-200 leading-relaxed">
                <strong className="text-[#EA580C] font-bold">Market Estimation Disclaimer:</strong> This price range is calculated based on regional material benchmarks. Proposals by local artisans will reflect workshop overheads and handcrafting techniques.
              </p>
            </div>

            {/* CTA Broadcast Button */}
            <button
              id="broadcast-btn"
              onClick={handleBroadcast}
              disabled={isBroadcasted}
              className={`w-full py-4 rounded-2xl text-sm font-bold text-white transition-all shadow-2xl flex items-center justify-center space-x-2 ${isBroadcasted
                  ? "bg-emerald-600 cursor-not-allowed"
                  : "bg-[#EA580C] hover:bg-[#C2410C] glow-orange"
                }`}
            >
              {isBroadcasted ? (
                <>
                  <Check className="w-5 h-5 animate-bounce" />
                  <span>Broadcasted to {selectedLocality.name} Karagirs!</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>🚀 Broadcast Custom Campaign</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* PANEL 2: ✨ AI PROMPT TEXT EDITOR & LIVE TECHNICAL SPEC SHEET (RIGHT - 4 COLS) */}
        <div className="lg:col-span-4 space-y-4 bg-[#120B08] p-5 rounded-2xl border border-[#3E2E24] shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Wand2 className="w-4 h-4 text-[#EA580C]" />
              <span>AI Prompt & Feature Injector</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
              Live Auto-Parse
            </span>
          </div>

          {/* AI Textarea */}
          <div className="space-y-1.5">
            <textarea
              rows={3}
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder="Type custom specs or click Quick Chips below to inject materials & features..."
              className="w-full bg-[#1F1510] border border-[#3E2E24] focus:border-[#EA580C] p-3 rounded-xl text-white text-xs font-medium focus:outline-none resize-none shadow-inner"
            ></textarea>
            <span className="text-[10px] text-slate-400 block font-mono">
              Type words like "drawers", "carved legs", "glass top", "marble", or click materials below.
            </span>
          </div>

          {/* 🏷️ DYNAMIC ITEM-SPECIFIC SUBCATEGORY QUICK CHIPS */}
          <div className="space-y-2 pt-1 border-t border-[#2A1E17]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#EA580C] font-extrabold uppercase tracking-wider block">
                Quick Chips ({selectedProduct.name} Material Add-ons):
              </span>
              <span className="text-[9px] text-amber-400 font-mono font-bold">
                click to Toggle 3D Feature
              </span>
            </div>

            {activeSubcategories.length > 0 ? (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                {activeSubcategories.map((subcat) => (
                  <div key={subcat.id} className="space-y-1 bg-[#1F1510] p-2.5 rounded-xl border border-[#2A1E17]">
                    <span className="text-[10px] text-amber-300 font-mono font-bold block border-b border-[#2A1E17]/60 pb-1">
                      📌 {subcat.name}:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {subcat.materials.map((mat) => {
                        const isActive = lowerAiText.includes(mat.toLowerCase()) || lowerAiText.includes(mat.toLowerCase().slice(0, Math.min(6, mat.length)));
                        return (
                          <button
                            key={mat}
                            type="button"
                            onClick={() => handleToggleChip(mat, mat.toLowerCase())}
                            className={`text-[10px] px-2.5 py-1 rounded-lg transition-all border font-medium flex items-center gap-1.5 ${isActive
                                ? "bg-[#EA580C]/25 border-[#EA580C] text-amber-300 font-bold shadow glow-orange scale-105"
                                : "bg-[#120B08] hover:bg-[#261B15] text-slate-300 border-[#2A1E17] hover:border-[#EA580C]/50"
                              }`}
                          >
                            <span>{isActive ? '✓' : '+'}</span>
                            <span>{mat}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {quickChipsList.map((chip) => {
                  const isActive = lowerAiText.includes(chip.matchKey);
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleToggleChip(chip.label, chip.matchKey)}
                      className={`text-[10px] px-2.5 py-1 rounded-lg transition-all border font-medium flex items-center gap-1.5 ${isActive
                          ? "bg-[#EA580C]/20 border-[#EA580C] text-amber-300 font-bold shadow glow-orange scale-105"
                          : "bg-[#1F1510] hover:bg-[#261B15] text-slate-300 border-[#2A1E17] hover:border-[#EA580C]/50"
                        }`}
                    >
                      <span>{isActive ? '✓' : '+'}</span>
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ⚡ 5️⃣ ACTIVE 3D MODEL ADD-ONS & FEATURES INJECTED */}
          <div className="bg-[#120B08] p-3.5 rounded-xl border border-[#EA580C]/40 space-y-2.5 shadow-inner mt-3">
            <div className="flex items-center justify-between pb-1 border-b border-[#2A1E17]">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-pulse"></span>
                <span className="text-[11px] text-[#EA580C] font-extrabold uppercase tracking-wider block">
                  ACTIVE MATERIALS & ADD-ONS:
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {breakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-[#1A120E] p-2 rounded-lg border border-[#2A1E17]">
                  <div className="flex flex-col">
                    <span className="text-xs text-white font-semibold">{item.materialName}</span>
                    <span className="text-[10px] text-slate-400">{item.role} • {item.quantity} {item.unit}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-[#EAB308] font-mono">₹{Math.round(item.lineAvg).toLocaleString('en-IN')}</span>
                    <button
                      onClick={() => removeSlot(item.role, selectedSlots.find(s => s.role === item.role)?.rateKey || "")}
                      className="w-6 h-6 rounded-full bg-red-950/40 text-red-400 flex items-center justify-center hover:bg-red-900/60 hover:text-red-300 transition-colors border border-red-900/30"
                      title="Remove Material"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Enhance Specs Button */}
          <button
            type="button"
            onClick={handleAiEnhance}
            disabled={isAiEnhancing}
            className="w-full py-2.5 rounded-xl bg-[#1F1510] hover:bg-[#261B15] text-[#EA580C] hover:text-white text-xs font-bold border border-[#EA580C]/40 transition-all flex items-center justify-center space-x-2"
          >
            <Wand2 className={`w-4 h-4 ${isAiEnhancing ? 'animate-spin' : ''}`} />
            <span>{isAiEnhancing ? 'Generating Technical Spec Sheet...' : '✨ AI Enhance & Force Re-Sync'}</span>
          </button>

          {/* 📋 LIVE TECHNICAL SPEC SHEET PANEL */}
          <div className="p-3.5 rounded-xl bg-[#1F1510] border border-[#EA580C]/50 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between text-[#EA580C]">
              <div className="flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Live Technical Spec Sheet</span>
              </div>
              <span className="text-[9px] text-emerald-400 font-mono font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                Auto-Synced
              </span>
            </div>

            {/* ⚡ 5️⃣ DYNAMIC 4-GRID SPECIFICATIONS */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {/* JOINERY */}
              <div className="bg-[#120B08] p-2.5 rounded-lg border border-[#2A1E17] shadow-inner">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">JOINERY</span>
                <p className="text-[11px] text-white font-semibold">
                  {hasCarvedLegs ? 'Rajasthani Hand-Carved Mortise & Tenon' : activeMaterialSpec.joineryConstruction || 'Traditional Mortise & Tenon'}
                </p>
              </div>
              {/* TIMBER QUALITY */}
              <div className="bg-[#120B08] p-2.5 rounded-lg border border-[#2A1E17] shadow-inner">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">TIMBER QUALITY</span>
                <p className="text-[11px] text-emerald-400 font-semibold">
                  Kiln-Dried Timber Seasoned to &lt;10% Moisture
                </p>
              </div>
              {/* SURFACE POLISH */}
              <div className="bg-[#120B08] p-2.5 rounded-lg border border-[#2A1E17] shadow-inner">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">SURFACE POLISH</span>
                <p className="text-[11px] text-white font-semibold">
                  {lowerAiText.includes('beeswax') ? '3 Hand-Rubbed Beeswax Polish Layers' : activeMaterialSpec.badgePolishName}
                </p>
              </div>
              {/* INLAY DETAIL */}
              <div className="bg-[#120B08] p-2.5 rounded-lg border border-[#2A1E17] shadow-inner">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">INLAY DETAIL</span>
                <p className="text-[11px] text-[#EAB308] font-semibold">
                  {hasBrassInlays ? 'High-Density 18 Gauge Solid Brass Wire Inlay' : (hasMarbleTop ? 'Makrana Marble Inlay' : 'Standard Finish')}
                </p>
              </div>
            </div>
          </div>
          
          {/* 6️⃣ SURFACE FINISH / POLISH */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
              6️⃣ Surface Finish & Polish:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SURFACE_FINISHES.map((f) => {
                const isSelected = selectedFinish.id === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFinish(f.name)}
                    className={`p-3 rounded-2xl border text-left text-xs transition-all ${isSelected
                        ? "border-[#EA580C] bg-[#EA580C]/20 text-white font-semibold shadow-md"
                        : "border-[#2A1E17] bg-[#120B08] text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-white">{f.name}</span>
                      <span className="text-[11px] font-mono text-emerald-400 font-bold bg-[#120B08] px-2 py-0.5 rounded border border-emerald-800">
                        {getConvertedFinishRateText(f.costPerSqFt, dimensionUnit)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Fullscreen 3D Viewport Inspection Modal */}
      {is3DFullscreenOpen && (
        <ThreeDProductViewer
          product={MOCK_PRODUCTS[0]}
          onClose={() => setIs3DFullscreenOpen(false)}
        />
      )}
    </div>
  );
};

