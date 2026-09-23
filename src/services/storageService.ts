import { 
  getArtisanById as libGetArtisanById,
  createArtisan as libCreateArtisan,
  updateArtisan as libUpdateArtisan
} from '../lib/supabase/artisans';
import {
  getProductsByArtisan as libGetProductsByArtisan,
  createProduct as libCreateProduct,
  updateProduct as libUpdateProduct,
  deleteProduct as libDeleteProduct
} from '../lib/supabase/products';
import {
  signInWithPhone,
  signUpWithPhone,
  signOut
} from '../lib/supabase/auth';
import type { Database } from '../lib/supabase/database.types';

// Artisan Services
export const getArtisanProfile = async (id: string) => {
  return await libGetArtisanById(id);
};

export const registerArtisanProfile = async (artisan: Database['public']['Tables']['artisans']['Insert']) => {
  return await libCreateArtisan(artisan);
};

export const updateArtisanProfile = async (id: string, updates: Database['public']['Tables']['artisans']['Update']) => {
  return await libUpdateArtisan(id, updates);
};

// Product Services
export const fetchArtisanProducts = async (artisanId: string) => {
  return await libGetProductsByArtisan(artisanId, 'published');
};

export const addProduct = async (product: Database['public']['Tables']['products']['Insert']) => {
  return await libCreateProduct(product);
};

export const modifyProduct = async (id: string, updates: Database['public']['Tables']['products']['Update']) => {
  return await libUpdateProduct(id, updates);
};

export const removeProduct = async (id: string) => {
  return await libDeleteProduct(id);
};

// Auth Services
export const login = async (phone: string, passwordHash: string) => {
  return await signInWithPhone(phone, passwordHash);
};

export const register = async (phone: string, passwordHash: string, name: string) => {
  return await signUpWithPhone(phone, passwordHash, name);
};

export const logout = async () => {
  return await signOut();
};
