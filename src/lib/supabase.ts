import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

/**
 * Supabase client configuration for PsiPilot Assistant
 *
 * For self-hosted Supabase, set the following environment variables:
 * - VITE_SUPABASE_URL: Your Supabase API URL (e.g., http://localhost:8000 or https://your-domain.com)
 * - VITE_SUPABASE_ANON_KEY: Your Supabase anon/public key
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check for missing environment variables early
const missingEnvVars: string[] = [];

if (!supabaseUrl) {
  missingEnvVars.push('VITE_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  missingEnvVars.push('VITE_SUPABASE_ANON_KEY');
}

// Export flag for checking if Supabase is properly configured
export const isSupabaseConfigured = missingEnvVars.length === 0;

if (!isSupabaseConfigured) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('   Please copy .env.example to .env.local and fill in the values');
  console.error('   Example: cp .env.example .env.local');
}

// Validate URL format
if (supabaseUrl && !supabaseUrl.startsWith('http')) {
  console.warn('⚠️  VITE_SUPABASE_URL should start with http:// or https://');
  console.warn(`   Current value: ${supabaseUrl}`);
}

/**
 * Typed Supabase client for the PsiPilot database
 */
export const supabase = createClient<Database>(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      // Persist session in localStorage
      persistSession: true,
      // Auto refresh token before expiry
      autoRefreshToken: true,
      // Detect session from URL (for OAuth)
      detectSessionInUrl: true,
    },
    // Global options
    global: {
      headers: {
        'x-application-name': 'psipilot-assistant',
      },
    },
  }
);

/**
 * Helper to get current authenticated user
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error.message);
    return null;
  }
  return user;
}

/**
 * Helper to get current user's profile
 */
export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*, clinic:clinics(*)')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error getting profile:', error.message);
    return null;
  }

  return profile;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
) {
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Sign out current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error.message);
    throw error;
  }
}

export default supabase;
