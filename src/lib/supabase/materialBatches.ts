import { supabase } from './client';
import type { Database } from './database.types';

export type MaterialBatchRow = Database['public']['Tables']['material_batches']['Row'];
export type MaterialAllocationRow = Database['public']['Tables']['material_allocations']['Row'];

type InsertMaterialBatch = Database['public']['Tables']['material_batches']['Insert'];
type UpdateMaterialBatch = Database['public']['Tables']['material_batches']['Update'];
type InsertMaterialAllocation = Database['public']['Tables']['material_allocations']['Insert'];

export const getMaterialBatchesByArtisan = async (artisanId: string): Promise<MaterialBatchRow[]> => {
  const { data, error } = await supabase
    .from('material_batches')
    .select('*')
    .eq('artisan_id', artisanId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching material batches:', error);
    return [];
  }
  return data as MaterialBatchRow[];
};

export const getAllocationsByArtisan = async (artisanId: string): Promise<MaterialAllocationRow[]> => {
  const { data, error } = await supabase
    .from('material_allocations')
    .select('*')
    .eq('artisan_id', artisanId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching material allocations:', error);
    return [];
  }
  return data as MaterialAllocationRow[];
};

export const createMaterialBatch = async (batch: InsertMaterialBatch): Promise<MaterialBatchRow | null> => {
  const { data, error } = await supabase
    .from('material_batches')
    // @ts-ignore
    .insert(batch as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating material batch:', error);
    return null;
  }
  return data as MaterialBatchRow;
};

export const updateMaterialBatch = async (
  id: string,
  updates: UpdateMaterialBatch
): Promise<MaterialBatchRow | null> => {
  const { data, error } = await supabase
    .from('material_batches')
    // @ts-ignore
    .update(updates as any)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating material batch:', error);
    return null;
  }
  return data as MaterialBatchRow;
};

export const deleteMaterialBatch = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('material_batches').delete().eq('id', id);

  if (error) {
    console.error('Error deleting material batch:', error);
    return false;
  }
  return true;
};

export const createMaterialAllocation = async (
  allocation: InsertMaterialAllocation
): Promise<MaterialAllocationRow | null> => {
  const { data, error } = await supabase
    .from('material_allocations')
    // @ts-ignore
    .insert(allocation as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating material allocation:', error);
    return null;
  }
  return data as MaterialAllocationRow;
};
