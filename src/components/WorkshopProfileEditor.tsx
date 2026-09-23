import React, { useState } from 'react';
import { Settings, Save, Check } from 'lucide-react';
import type { KaragirStore } from '../types';

interface Props {
  storeData: KaragirStore | null;
  saveStoreProfile: (data: Partial<KaragirStore>) => Promise<void>;
}

import { SUPPORTED_LANGUAGES } from '../config/languages';

export const WorkshopProfileEditor: React.FC<Props> = ({ storeData, saveStoreProfile }) => {
  const [formData, setFormData] = useState({
    shopName: storeData?.shopName || '',
    artisanName: storeData?.artisanName || '',
    mobile: storeData?.mobile || '',
    location: storeData?.location || '',
    shopTagline: storeData?.shopTagline || '',
    yearsExperience: storeData?.yearsExperience || 0,
    speakingLanguage: storeData?.speakingLanguage || 'hi',
  });

  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveStoreProfile(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="bg-[#1F1510] border border-[#2A1E17] rounded-3xl p-6 shadow-2xl space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center space-x-2 border-b border-[#2A1E17] pb-4">
        <Settings className="w-5 h-5 text-[#EA580C]" />
        <h2 className="text-lg font-bold text-white">Workshop Profile Settings / कार्यशाला सेटिंग्स</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">Shop Name / दुकान का नाम</label>
            <input 
              type="text" 
              value={formData.shopName} 
              onChange={e => setFormData({ ...formData, shopName: e.target.value })} 
              className="w-full px-4 py-2.5 min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-sm focus:outline-none focus:border-[#EA580C]" 
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">Master Artisan Name / कारीगर का नाम</label>
            <input 
              type="text" 
              value={formData.artisanName} 
              onChange={e => setFormData({ ...formData, artisanName: e.target.value })} 
              className="w-full px-4 py-2.5 min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-sm focus:outline-none focus:border-[#EA580C]" 
            />
          </div>
        </div>

        {/* Language and Years Experience */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">
              Speaking Language / बोलने की भाषा
            </label>
            <select
              value={formData.speakingLanguage}
              onChange={e => setFormData({ ...formData, speakingLanguage: e.target.value })}
              className="w-full px-4 py-2.5 min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-sm focus:outline-none focus:border-[#EA580C] cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} className="bg-[#120B08] text-white">
                  {lang.nativeName} ({lang.name})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">
              Years of Experience / अनुभव (वर्ष) <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <input 
              type="number" 
              min={0}
              max={70}
              value={formData.yearsExperience || ''} 
              onChange={e => setFormData({ ...formData, yearsExperience: parseInt(e.target.value) || 0 })} 
              placeholder="e.g. 15"
              className="w-full px-4 py-2.5 min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-sm focus:outline-none focus:border-[#EA580C]" 
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400">Shop Tagline / Bio / विवरण</label>
          <textarea 
            rows={3} 
            value={formData.shopTagline} 
            onChange={e => setFormData({ ...formData, shopTagline: e.target.value })} 
            className="w-full px-4 py-2.5 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-sm focus:outline-none focus:border-[#EA580C]" 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">Mobile (Read-only)</label>
            <input 
              type="text" 
              value={formData.mobile} 
              readOnly 
              className="w-full px-4 py-2.5 min-h-[48px] rounded-xl bg-[#0a0605] border border-[#2A1E17] text-slate-500 text-sm cursor-not-allowed" 
            />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-xs font-bold text-slate-400">Physical Address / Area / पता</label>
            <input 
              type="text" 
              value={formData.location} 
              onChange={e => setFormData({ ...formData, location: e.target.value })} 
              className="w-full px-4 py-2.5 min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-sm focus:outline-none focus:border-[#EA580C]" 
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button 
            type="submit" 
            className={`py-2.5 px-6 rounded-xl text-xs font-bold text-white transition-all shadow-lg flex items-center space-x-2 ${isSaved ? 'bg-emerald-600' : 'bg-[#EA580C] hover:bg-[#F97316] glow-orange'}`}
          >
            {isSaved ? <><Check className="w-4 h-4" /><span>Saved</span></> : <><Save className="w-4 h-4" /><span>Save Changes</span></>}
          </button>
        </div>
      </form>
    </div>
  );
};
