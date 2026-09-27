import {
  getMaterialBatchesByArtisan,
  getAllocationsByArtisan,
  createMaterialBatch,
  createMaterialAllocation,
  type MaterialBatchRow,
  type MaterialAllocationRow,
} from '../lib/supabase/materialBatches';

export type MaterialCategory = 'Wood' | 'Metal' | 'Stone' | 'Clay' | 'Leather';

export interface MaterialBatchWithAllocations extends MaterialBatchRow {
  allocations: MaterialAllocationRow[];
  allocatedQty: number;
  remainingQty: number;
}

export interface MaterialRegistryStats {
  registeredCount: number;
  allocatedProjectCount: number;
  remainingQtyByUnit: Record<string, number>;
}

export interface NewMaterialBatchInput {
  artisanId: string;
  category: MaterialCategory;
  materialName: string;
  grade?: string;
  supplierName: string;
  supplierLocation?: string;
  invoiceNumber?: string;
  supplierBatchCode?: string;
  purchasedQty: number;
  unit?: string;
  purchaseDate?: string;
}

export interface AllocateMaterialInput {
  batchId: string;
  artisanId: string;
  projectLabel: string;
  projectRef?: string;
  allocatedQty: number;
}

const generateMaterialCode = (): string => {
  const year = new Date().getFullYear();
  const suffix = Math.floor(10000 + Math.random() * 90000);
  return `KAR-MAT-${year}-${suffix}`;
};

export const fetchMaterialRegistry = async (artisanId: string): Promise<MaterialBatchWithAllocations[]> => {
  const [batches, allocations] = await Promise.all([
    getMaterialBatchesByArtisan(artisanId),
    getAllocationsByArtisan(artisanId),
  ]);

  return batches.map((batch) => {
    const batchAllocations = allocations.filter((a) => a.batch_id === batch.id);
    const allocatedQty = batchAllocations.reduce((sum, a) => sum + a.allocated_qty, 0);
    return {
      ...batch,
      allocations: batchAllocations,
      allocatedQty,
      remainingQty: batch.purchased_qty - allocatedQty,
    };
  });
};

export const computeRegistryStats = (batches: MaterialBatchWithAllocations[]): MaterialRegistryStats => {
  const allocatedProjectRefs = new Set<string>();
  const remainingQtyByUnit: Record<string, number> = {};

  for (const batch of batches) {
    for (const allocation of batch.allocations) {
      allocatedProjectRefs.add(allocation.project_ref || allocation.project_label);
    }
    remainingQtyByUnit[batch.unit] = (remainingQtyByUnit[batch.unit] || 0) + Math.max(batch.remainingQty, 0);
  }

  return {
    registeredCount: batches.length,
    allocatedProjectCount: allocatedProjectRefs.size,
    remainingQtyByUnit,
  };
};

export const registerMaterialBatch = async (
  input: NewMaterialBatchInput
): Promise<MaterialBatchWithAllocations | null> => {
  const batch = await createMaterialBatch({
    artisan_id: input.artisanId,
    material_code: generateMaterialCode(),
    category: input.category,
    material_name: input.materialName,
    grade: input.grade || null,
    supplier_name: input.supplierName,
    supplier_location: input.supplierLocation || null,
    invoice_number: input.invoiceNumber || null,
    supplier_batch_code: input.supplierBatchCode || null,
    purchased_qty: input.purchasedQty,
    unit: input.unit || 'kg',
    purchase_date: input.purchaseDate || null,
    traceability_status: input.invoiceNumber && input.supplierBatchCode ? 'complete' : 'pending',
  });

  if (!batch) return null;

  return { ...batch, allocations: [], allocatedQty: 0, remainingQty: batch.purchased_qty };
};

export const allocateMaterialToProject = async (
  input: AllocateMaterialInput
): Promise<MaterialAllocationRow | null> => {
  return createMaterialAllocation({
    batch_id: input.batchId,
    artisan_id: input.artisanId,
    project_label: input.projectLabel,
    project_ref: input.projectRef || null,
    allocated_qty: input.allocatedQty,
  });
};
