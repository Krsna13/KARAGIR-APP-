import { supabase } from './client';
import type { ProductRecord } from '../../types/product';
import type { Database } from './database.types';

type InsertProduct = Database['public']['Tables']['products']['Insert'];
type UpdateProduct = Database['public']['Tables']['products']['Update'];

export const getProductsByArtisan = async (
  artisanId: string,
  status: 'published' | 'draft' | 'all' = 'published'
): Promise<ProductRecord[]> => {
  let query = supabase
    .from('products')
    .select('*')
    .eq('artisan_id', artisanId);

  if (status !== 'all') {
    query = query.eq('listing_status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }
  return data as ProductRecord[];
};

/**
 * Buyer-facing product queries explicitly filtered for published listings.
 * Ensures that even if an artisan views the app in buyer mode, drafts remain hidden.
 */
export const getPublishedProducts = async (): Promise<ProductRecord[]> => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('listing_status', 'published')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching published products:', error);
    return [];
  }
  return data as ProductRecord[];
};

export const getPublishedProductsByArtisan = async (artisanId: string): Promise<ProductRecord[]> => {
  return getProductsByArtisan(artisanId, 'published');
};

export const getDraftProductsByArtisan = async (artisanId: string): Promise<ProductRecord[]> => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('artisan_id', artisanId)
    .eq('listing_status', 'draft')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching draft products:', error);
    return [];
  }
  return data as ProductRecord[];
};

export const createProduct = async (product: InsertProduct): Promise<ProductRecord | null> => {
  const { data, error } = await supabase
    .from('products')
    // @ts-ignore
    .insert(product as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating product:', error);
    return null;
  }
  return data as ProductRecord;
};

export const updateProduct = async (id: string, updates: UpdateProduct): Promise<ProductRecord | null> => {
  const { data, error } = await supabase
    .from('products')
    // @ts-ignore
    .update(updates as any)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating product:', error);
    return null;
  }
  return data as ProductRecord;
};

export const deleteProduct = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting product:', error);
    return false;
  }
  return true;
};
