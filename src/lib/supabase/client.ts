import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder-signature-for-demo-only';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('Kaaragir: Running in demo mode. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for full functionality.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
