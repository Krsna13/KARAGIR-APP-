import React, { useState, useEffect } from 'react';
import { 
  Hammer, 
  Tag, 
  Plus, 
  ArrowRight,
  Check, 
  Sparkles, 
  Clock,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import type { KaragirStore, WorkItem } from '../types';
import type { ProductRecord } from '../types/product';
import { AddItemWizard } from './portal/addItem/AddItemWizard';
import { fetchArtisanDrafts, deleteDraft, hasDraftContent } from '../services/draftService';

interface Props {
  storeData: KaragirStore | null;
  addWorkItem: (item: WorkItem) => Promise<void>;
  saveStoreProfile?: (data: Partial<KaragirStore>) => Promise<void>;
}

export const CatalogEditor: React.FC<Props> = ({ storeData, addWorkItem, saveStoreProfile }) => {
  // Add Item Wizard states
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ProductRecord | null>(null);
  const [drafts, setDrafts] = useState<ProductRecord[]>([]);
  const [draftToDelete, setDraftToDelete] = useState<ProductRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Legacy manual add form state (left in place but unused per Stage 6.1 specification)
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

  const loadDrafts = async () => {
    if (!storeData?.id) return;
    try {
      const allDrafts = await fetchArtisanDrafts(storeData.id);
      // Only drafts with artisan-entered content appear as resume cards
      setDrafts(allDrafts.filter(hasDraftContent));
    } catch (err) {
      console.error('Failed to load drafts:', err);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, [storeData?.id]);

  // Legacy handler (kept intact and unused)
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

  // If Add Item Wizard is open, render the wizard view
  if (isWizardOpen) {
    return (
      <div className="w-full space-y-4">
        <AddItemWizard
          artisanId={storeData?.id || 'demo-artisan'}
          speakingLanguage={storeData?.speakingLanguage}
          initialDraft={selectedDraft}
          onExit={(savedMessage) => {
            setIsWizardOpen(false);
            setSelectedDraft(null);
            loadDrafts();
            if (savedMessage) {
              setToastMessage(savedMessage);
              setTimeout(() => setToastMessage(null), 3500);
            }
          }}
          onLanguageSelected={(lang) => {
            if (storeData && saveStoreProfile) {
              saveStoreProfile({ speakingLanguage: lang });
            }
          }}
        />
      </div>
    );
  }

  const publishedCount = storeData?.works?.length || 0;
  const draftsCount = drafts.length;

  return (
    <div className="w-full space-y-4 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn shadow-lg">
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Mobile App Top Header */}
      <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-3.5 shadow-md flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#120B08] border border-[#EA580C]/80 flex items-center justify-center text-[#EA580C] shadow-inner">
            <Hammer className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white">Workshop Catalog</h2>
              {/* Badge: published items */}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EA580C]/10 text-[#EA580C] border border-[#EA580C]/30 font-bold">
                {publishedCount} published
              </span>
              {/* Badge: drafts shown separately */}
              {draftsCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                  {draftsCount} {draftsCount === 1 ? 'draft' : 'drafts'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">Manage your workshop offerings</p>
          </div>
        </div>

        {/* "+ Add Item" Button: Rerouted to Add Item Wizard (min 48px touch target) */}
        <button
          type="button"
          onClick={() => {
            setSelectedDraft(null);
            setIsWizardOpen(true);
          }}
          className="min-h-[48px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow active:scale-95 cursor-pointer bg-[#EA580C] hover:bg-[#F97316] text-white shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Item</span>
        </button>
      </div>

      {/* 2. Unfinished Items (Drafts) Section */}
      {drafts.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center space-x-1.5 px-1">
            <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />
            <h3 className="text-xs font-bold text-slate-200">
              Continue your unfinished item / अधूरा आइटम जारी रखें
            </h3>
          </div>

          <div className="space-y-2">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="group bg-[#1A120E] border border-amber-500/30 hover:border-[#EA580C] rounded-2xl p-3 shadow-md flex items-center justify-between transition-all cursor-pointer min-h-[56px]"
                onClick={() => {
                  setSelectedDraft(draft);
                  setIsWizardOpen(true);
                }}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Thumbnail or placeholder */}
                  <div className="w-12 h-12 rounded-xl bg-[#120B08] border border-[#2A1E17] flex items-center justify-center shrink-0 overflow-hidden">
                    {draft.original_image_url ? (
                      <img
                        src={draft.original_image_url}
                        alt={draft.item_type || 'Draft'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Hammer className="w-5 h-5 text-amber-500/70" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-[#EA580C] transition-colors">
                      {draft.item_type || 'Unfinished Item / अधूरा ड्राफ्ट'}
                    </h4>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
                      <span className="text-amber-400 font-medium">
                        Step {(draft.wizard_step ?? 0) + 1} of 6
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {draft.updated_at
                            ? new Date(draft.updated_at).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })
                            : 'Recently'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions: Delete Button and Resume Arrow (Min 48px touch targets) */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftToDelete(draft);
                    }}
                    className="w-12 h-12 rounded-xl bg-[#120B08] border border-[#2A1E17] hover:border-red-500/60 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                    title="Delete draft / ड्राफ्ट हटाएं"
                    aria-label="Delete draft"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="w-12 h-12 rounded-xl bg-[#EA580C]/20 border border-[#EA580C]/40 text-[#EA580C] flex items-center justify-center group-hover:bg-[#EA580C] group-hover:text-white transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Catalog Product List */}
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
                    src={work.coverImage || 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=600&q=80'}
                    alt={work.title || 'Product'}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/75 backdrop-blur-sm rounded text-[8px] font-bold text-white uppercase tracking-wider">
                    {work.category}
                  </div>
                </div>

                {/* Right: Product Details (Null-safe for price, material, title) */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white line-clamp-1">
                      {work.title || 'Untitled Item'}
                    </h4>
                    <p className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                      <Tag className="w-3 h-3 text-[#EA580C] shrink-0" />
                      <span className="truncate">{work.material || 'Handcrafted'}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#2A1E17] mt-2">
                    <span className="text-[#EAB308] font-mono text-xs font-extrabold flex items-center">
                      {work.price != null && work.price > 0
                        ? `₹${work.price.toLocaleString('en-IN')}` 
                        : 'Price not set / कीमत तय नहीं'}
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
          /* Empty State: Button rerouted to Add Item Wizard */
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
              onClick={() => {
                setSelectedDraft(null);
                setIsWizardOpen(true);
              }}
              className="mt-1 min-h-[48px] px-5 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold shadow flex items-center space-x-2 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add the Product</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Delete Draft Bilingual Confirmation Dialog */}
      {draftToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1A120E] border border-red-500/40 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-500/50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Delete Draft? / ड्राफ्ट हटाएं?
                </h3>
                <p className="text-[11px] text-slate-400">
                  This action cannot be undone. / यह क्रिया वापस नहीं ली जा सकती।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#2A1E17]">
              <button
                type="button"
                onClick={() => setDraftToDelete(null)}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-slate-300 text-xs font-bold hover:text-white active:scale-95 cursor-pointer"
              >
                Cancel / रद्द करें
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (draftToDelete) {
                    // Also removes the draft's product_images rows (cascade) and photo files.
                    const deleted = await deleteDraft(draftToDelete.id);
                    if (deleted) {
                      setDrafts((prev) => prev.filter((d) => d.id !== draftToDelete.id));
                    } else {
                      setToastMessage('Draft not deleted. Try again / ड्राफ्ट नहीं हटा, फिर कोशिश करें');
                    }
                    setDraftToDelete(null);
                  }
                }}
                className="min-h-[48px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold active:scale-95 flex items-center space-x-1.5 shadow cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete / हटाएं</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Legacy Manual Add Form (Left intact and unused per Stage 6.1 spec) */}
      {isCreating && (
        <form
          onSubmit={handleAdd}
          className="bg-[#1A120E] border border-[#EA580C]/40 rounded-2xl p-4 shadow-xl space-y-3.5 hidden"
          aria-hidden="true"
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
            <input
              type="text"
              required
              value={newItem.title}
              onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
              placeholder="e.g. Carved Teak Dining Table"
              className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-[#EA580C] text-white text-xs font-bold"
            >
              Save Product
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
