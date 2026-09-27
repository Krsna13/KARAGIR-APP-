import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Layers, Package, Plus, Search, Check, X, Link2, Copy } from 'lucide-react';
import type { KaragirStore } from '../../types';
import {
  fetchMaterialRegistry,
  computeRegistryStats,
  registerMaterialBatch,
  allocateMaterialToProject,
  type MaterialBatchWithAllocations,
  type MaterialCategory,
} from '../../services/materialRegistryService';
import { MOCK_MATERIAL_BATCHES } from '../../data/materialRegistryMockData';

interface Props {
  storeData: KaragirStore | null;
}

const CATEGORIES: MaterialCategory[] = ['Wood', 'Metal', 'Stone', 'Clay', 'Leather'];

const emptyNewBatch = {
  category: 'Wood' as MaterialCategory,
  materialName: '',
  grade: 'A',
  supplierName: '',
  supplierLocation: '',
  invoiceNumber: '',
  supplierBatchCode: '',
  purchasedQty: '',
  unit: 'kg',
};

const emptyAllocation = {
  projectLabel: '',
  projectRef: '',
  allocatedQty: '',
};

export const MaterialRegistry: React.FC<Props> = ({ storeData }) => {
  const [batches, setBatches] = useState<MaterialBatchWithAllocations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | MaterialCategory>('ALL');

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [newBatch, setNewBatch] = useState(emptyNewBatch);
  const [isSaving, setIsSaving] = useState(false);

  const [allocateTargetId, setAllocateTargetId] = useState<string | null>(null);
  const [allocation, setAllocation] = useState(emptyAllocation);
  const [isAllocating, setIsAllocating] = useState(false);

  const artisanId = storeData?.id;

  const loadRegistry = async () => {
    if (!artisanId) {
      // Demo/mock login has no real backend id — show sample registry data instead.
      setBatches(MOCK_MATERIAL_BATCHES);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const rows = await fetchMaterialRegistry(artisanId);
      // No batches registered yet (or migration not applied) — seed the view with samples.
      setBatches(rows.length > 0 ? rows : MOCK_MATERIAL_BATCHES);
    } catch (err) {
      console.error('Failed to load material registry:', err);
      setBatches(MOCK_MATERIAL_BATCHES);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRegistry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artisanId]);

  const stats = useMemo(() => computeRegistryStats(batches), [batches]);

  const filteredBatches = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return batches.filter((batch) => {
      const matchesCategory = activeCategory === 'ALL' || batch.category === activeCategory;
      if (!matchesCategory) return false;
      if (!term) return true;
      return (
        batch.material_code.toLowerCase().includes(term) ||
        batch.material_name.toLowerCase().includes(term) ||
        batch.supplier_name.toLowerCase().includes(term) ||
        (batch.supplier_batch_code || '').toLowerCase().includes(term)
      );
    });
  }, [batches, activeCategory, searchTerm]);

  const handleRegisterMaterial = async () => {
    if (!newBatch.materialName || !newBatch.supplierName || !newBatch.purchasedQty) return;
    const qty = Number(newBatch.purchasedQty);
    if (!qty || qty <= 0) return;

    setIsSaving(true);
    try {
      if (!artisanId) {
        // Demo/mock login has no real backend id — add the batch to local state only.
        const localBatch: MaterialBatchWithAllocations = {
          id: `local-${Date.now()}`,
          artisan_id: 'demo-artisan',
          material_code: `KAR-MAT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
          category: newBatch.category,
          material_name: newBatch.materialName,
          grade: newBatch.grade || null,
          supplier_name: newBatch.supplierName,
          supplier_location: newBatch.supplierLocation || null,
          invoice_number: newBatch.invoiceNumber || null,
          supplier_batch_code: newBatch.supplierBatchCode || null,
          purchased_qty: qty,
          unit: newBatch.unit || 'kg',
          purchase_date: null,
          traceability_status: newBatch.invoiceNumber && newBatch.supplierBatchCode ? 'complete' : 'pending',
          passport_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          allocations: [],
          allocatedQty: 0,
          remainingQty: qty,
        };
        setBatches((prev) => [localBatch, ...prev]);
        setIsRegisterModalOpen(false);
        setNewBatch(emptyNewBatch);
        return;
      }

      const created = await registerMaterialBatch({
        artisanId,
        category: newBatch.category,
        materialName: newBatch.materialName,
        grade: newBatch.grade || undefined,
        supplierName: newBatch.supplierName,
        supplierLocation: newBatch.supplierLocation || undefined,
        invoiceNumber: newBatch.invoiceNumber || undefined,
        supplierBatchCode: newBatch.supplierBatchCode || undefined,
        purchasedQty: qty,
        unit: newBatch.unit || 'kg',
      });
      if (created) {
        setBatches((prev) => [created, ...prev]);
        setIsRegisterModalOpen(false);
        setNewBatch(emptyNewBatch);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const allocateTarget = batches.find((b) => b.id === allocateTargetId) || null;

  const handleAllocate = async () => {
    if (!allocateTarget || !allocation.projectLabel || !allocation.allocatedQty) return;
    const qty = Number(allocation.allocatedQty);
    if (!qty || qty <= 0 || qty > allocateTarget.remainingQty) return;

    setIsAllocating(true);
    try {
      if (!artisanId || allocateTarget.id.startsWith('mock-') || allocateTarget.id.startsWith('local-')) {
        // Demo/mock login or a locally-added batch — update local state only.
        setBatches((prev) =>
          prev.map((b) =>
            b.id === allocateTarget.id
              ? {
                  ...b,
                  allocations: [
                    ...b.allocations,
                    {
                      id: `local-alloc-${Date.now()}`,
                      batch_id: b.id,
                      artisan_id: b.artisan_id,
                      project_label: allocation.projectLabel,
                      project_ref: allocation.projectRef || null,
                      allocated_qty: qty,
                      created_at: new Date().toISOString(),
                    },
                  ],
                  allocatedQty: b.allocatedQty + qty,
                  remainingQty: b.remainingQty - qty,
                }
              : b
          )
        );
        setAllocateTargetId(null);
        setAllocation(emptyAllocation);
        return;
      }

      const created = await allocateMaterialToProject({
        batchId: allocateTarget.id,
        artisanId,
        projectLabel: allocation.projectLabel,
        projectRef: allocation.projectRef || undefined,
        allocatedQty: qty,
      });
      if (created) {
        setBatches((prev) =>
          prev.map((b) =>
            b.id === allocateTarget.id
              ? {
                  ...b,
                  allocations: [...b.allocations, created],
                  allocatedQty: b.allocatedQty + qty,
                  remainingQty: b.remainingQty - qty,
                }
              : b
          )
        );
        setAllocateTargetId(null);
        setAllocation(emptyAllocation);
      }
    } finally {
      setIsAllocating(false);
    }
  };

  const remainingSummary = Object.entries(stats.remainingQtyByUnit)
    .map(([unit, qty]) => `${qty} ${unit}`)
    .join(' + ') || '0 kg';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">Material Registry</h2>
            <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
              Ledger Active
            </span>
          </div>
          <p className="text-[10px] text-slate-400">Register purchased materials and maintain traceability from supplier to customer.</p>
        </div>
        <button
          onClick={() => setIsRegisterModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#EA580C] hover:bg-[#F97316] text-white text-xs font-bold shadow shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register</span>
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-3 space-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Registered</span>
            <Boxes className="w-3.5 h-3.5 text-[#EA580C]" />
          </div>
          <p className="text-lg font-mono font-bold text-white">{stats.registeredCount}</p>
          <p className="text-[9px] text-slate-500">batches on file</p>
        </div>
        <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-3 space-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Allocated</span>
            <Package className="w-3.5 h-3.5 text-[#EA580C]" />
          </div>
          <p className="text-lg font-mono font-bold text-white">{stats.allocatedProjectCount}</p>
          <p className="text-[9px] text-slate-500">active builds</p>
        </div>
        <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-3 space-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Remaining</span>
            <Layers className="w-3.5 h-3.5 text-[#EA580C]" />
          </div>
          <p className="text-lg font-mono font-bold text-[#EAB308]">{remainingSummary}</p>
          <p className="text-[9px] text-slate-500">in stock lot</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Material ID, Supplier, Batch..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#EA580C]"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(['ALL', ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                activeCategory === cat
                  ? 'bg-[#EA580C] text-white shadow'
                  : 'bg-[#1A120E] text-slate-400 border border-[#2A1E17]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="space-y-3">
        {isLoading && (
          <div className="text-center py-6 text-xs text-slate-500">Loading material registry...</div>
        )}

        {!isLoading && filteredBatches.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 bg-[#1A120E] border border-[#2A1E17] rounded-2xl space-y-2 text-center">
            <Boxes className="w-8 h-8 text-[#EA580C] opacity-50" />
            <h3 className="text-sm font-bold text-white">No materials registered yet</h3>
            <p className="text-xs text-slate-400">Register a purchased batch to start tracking traceability.</p>
          </div>
        )}

        {!isLoading &&
          filteredBatches.map((batch) => {
            const allocatedPct = batch.purchased_qty > 0 ? Math.min(100, (batch.allocatedQty / batch.purchased_qty) * 100) : 0;
            return (
              <div key={batch.id} className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-300 bg-[#120B08] border border-[#2A1E17] px-2 py-0.5 rounded">
                      {batch.material_code}
                    </span>
                    <span className="text-[9px] font-bold text-[#EA580C] bg-[#EA580C]/10 border border-[#EA580C]/40 px-1.5 py-0.5 rounded">
                      {batch.category}
                    </span>
                    {batch.grade && (
                      <span className="text-[9px] text-slate-400">Grade <b className="text-white">{batch.grade}</b></span>
                    )}
                  </div>
                  {batch.traceability_status === 'complete' ? (
                    <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-mono bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                      <Check className="w-2.5 h-2.5" /> Traceability Complete
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-400 font-mono bg-[#120B08] px-1.5 py-0.5 rounded border border-[#2A1E17]">
                      Traceability Pending
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white">{batch.material_name}</h3>
                  <p className="text-[10px] text-slate-400">
                    Supplier: <span className="text-slate-300 font-semibold">{batch.supplier_name}</span>
                    {batch.supplier_location && ` (${batch.supplier_location})`}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5">
                    {batch.invoice_number && (
                      <span>Invoice: <span className="text-slate-200 font-mono">{batch.invoice_number}</span></span>
                    )}
                    {batch.supplier_batch_code && (
                      <span>Supplier Batch: <span className="text-[#EAB308] font-mono">{batch.supplier_batch_code}</span></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-white">
                      <span>Purchased: {batch.purchased_qty} {batch.unit}</span>
                      <span>Allocated: {batch.allocatedQty} {batch.unit}</span>
                    </div>
                    <div className="w-full h-2 bg-[#120B08] rounded-full overflow-hidden border border-[#2A1E17]">
                      <div
                        className="h-full bg-gradient-to-r from-[#EA580C] to-emerald-500 rounded-full"
                        style={{ width: `${allocatedPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span className="text-emerald-400">Remaining: {batch.remainingQty} {batch.unit}</span>
                    </div>
                  </div>
                </div>

                {batch.allocations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#2A1E17]">
                    <span className="text-[9px] text-slate-500 self-center">Allocated Projects:</span>
                    {batch.allocations.map((alloc) => (
                      <span key={alloc.id} className="text-[9px] text-slate-300 bg-[#120B08] border border-[#2A1E17] px-2 py-0.5 rounded-full">
                        {alloc.project_label} ({alloc.allocated_qty} {batch.unit})
                        {alloc.project_ref && <span className="text-slate-500"> • {alloc.project_ref}</span>}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setAllocateTargetId(batch.id)}
                    disabled={batch.remainingQty <= 0}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                      batch.remainingQty > 0
                        ? 'bg-[#EA580C] hover:bg-[#F97316] text-white shadow'
                        : 'bg-[#120B08] text-slate-500 border border-[#2A1E17] cursor-not-allowed'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Allocate to Project</span>
                  </button>
                  <button
                    onClick={() => navigator.clipboard?.writeText(batch.material_code)}
                    className="w-9 h-9 rounded-xl bg-[#120B08] border border-[#2A1E17] text-slate-400 hover:text-white flex items-center justify-center"
                    title="Copy Material ID"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {/* Register Material Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="relative w-full max-w-md bg-[#1A120E] border-t-2 sm:border border-[#3E2E24] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#2A1E17] pb-3">
              <div>
                <span className="text-[9px] uppercase font-bold text-[#EA580C]">Register Material</span>
                <h3 className="text-sm font-bold text-white">New Purchased Batch</h3>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#120B08] text-slate-400 hover:text-white flex items-center justify-center border border-[#2A1E17]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setNewBatch((prev) => ({ ...prev, category: cat }))}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        newBatch.category === cat
                          ? 'bg-[#EA580C] text-white'
                          : 'bg-[#120B08] text-slate-400 border border-[#2A1E17]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Material Name</label>
                <input
                  type="text"
                  value={newBatch.materialName}
                  onChange={(e) => setNewBatch((prev) => ({ ...prev, materialName: e.target.value }))}
                  placeholder="e.g. Seasoned Sagwan Teak"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Grade</label>
                  <input
                    type="text"
                    value={newBatch.grade}
                    onChange={(e) => setNewBatch((prev) => ({ ...prev, grade: e.target.value }))}
                    placeholder="A"
                    className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newBatch.unit}
                    onChange={(e) => setNewBatch((prev) => ({ ...prev, unit: e.target.value }))}
                    placeholder="kg"
                    className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Purchased Quantity</label>
                <input
                  type="number"
                  value={newBatch.purchasedQty}
                  onChange={(e) => setNewBatch((prev) => ({ ...prev, purchasedQty: e.target.value }))}
                  placeholder="100"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white font-mono text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Supplier Name</label>
                <input
                  type="text"
                  value={newBatch.supplierName}
                  onChange={(e) => setNewBatch((prev) => ({ ...prev, supplierName: e.target.value }))}
                  placeholder="e.g. Sahrangpur Pvt Wood"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Supplier Location</label>
                <input
                  type="text"
                  value={newBatch.supplierLocation}
                  onChange={(e) => setNewBatch((prev) => ({ ...prev, supplierLocation: e.target.value }))}
                  placeholder="Nashik, Maharashtra"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Invoice #</label>
                  <input
                    type="text"
                    value={newBatch.invoiceNumber}
                    onChange={(e) => setNewBatch((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                    placeholder="INV-4521"
                    className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white font-mono text-xs focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Supplier Batch</label>
                  <input
                    type="text"
                    value={newBatch.supplierBatchCode}
                    onChange={(e) => setNewBatch((prev) => ({ ...prev, supplierBatchCode: e.target.value }))}
                    placeholder="TV-0826-19"
                    className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white font-mono text-xs focus:outline-none focus:border-[#EA580C]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={handleRegisterMaterial}
                disabled={isSaving || !newBatch.materialName || !newBatch.supplierName || !newBatch.purchasedQty}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-[#EA580C] hover:bg-[#F97316] shadow flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Registering...' : 'Register Material'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allocate to Project Modal */}
      {allocateTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="relative w-full max-w-md bg-[#1A120E] border-t-2 sm:border border-[#3E2E24] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#2A1E17] pb-3">
              <div>
                <span className="text-[9px] uppercase font-bold text-[#EA580C]">Allocate to Project</span>
                <h3 className="text-sm font-bold text-white">{allocateTarget.material_name}</h3>
                <p className="text-[10px] text-slate-400">Remaining: {allocateTarget.remainingQty} {allocateTarget.unit}</p>
              </div>
              <button
                onClick={() => {
                  setAllocateTargetId(null);
                  setAllocation(emptyAllocation);
                }}
                className="w-7 h-7 rounded-full bg-[#120B08] text-slate-400 hover:text-white flex items-center justify-center border border-[#2A1E17]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Project / Product Name</label>
                <input
                  type="text"
                  value={allocation.projectLabel}
                  onChange={(e) => setAllocation((prev) => ({ ...prev, projectLabel: e.target.value }))}
                  placeholder="Custom Oak & Sagwan Teak Dining Table"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Order Reference</label>
                <input
                  type="text"
                  value={allocation.projectRef}
                  onChange={(e) => setAllocation((prev) => ({ ...prev, projectRef: e.target.value }))}
                  placeholder="#KARAGIR-99210"
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white font-mono text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Quantity to Allocate ({allocateTarget.unit})
                </label>
                <input
                  type="number"
                  value={allocation.allocatedQty}
                  onChange={(e) => setAllocation((prev) => ({ ...prev, allocatedQty: e.target.value }))}
                  max={allocateTarget.remainingQty}
                  placeholder={`Up to ${allocateTarget.remainingQty}`}
                  className="w-full px-3 py-2 rounded-xl bg-[#120B08] border border-[#2A1E17] text-white font-mono text-xs focus:outline-none focus:border-[#EA580C]"
                />
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={handleAllocate}
                disabled={
                  isAllocating ||
                  !allocation.projectLabel ||
                  !allocation.allocatedQty ||
                  Number(allocation.allocatedQty) > allocateTarget.remainingQty
                }
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-[#EA580C] hover:bg-[#F97316] shadow flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{isAllocating ? 'Allocating...' : 'Confirm Allocation'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
