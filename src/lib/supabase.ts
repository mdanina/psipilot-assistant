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
 * Create Supabase client with proper error handling
 */
function createSupabaseClient() {
  if (!isSupabaseConfigured) {
    // Return a mock client that throws helpful errors
    // This prevents crashes during development without proper config
    const mockHandler = {
      get(_target: any, prop: string) {
        if (prop === 'auth') {
          return {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            getUser: () => Promise.resolve({ data: { user: null }, error: null }),
            signInWithPassword: () => Promise.resolve({
              data: { session: null, user: null },
              error: new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'),
            }),
            signUp: () => Promise.resolve({
              data: { session: null, user: null },
              error: new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'),
            }),
            signOut: () => Promise.resolve({ error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            mfa: {
              enroll: () => Promise.resolve({ error: new Error('Supabase not configured') }),
              verify: () => Promise.resolve({ error: new Error('Supabase not configured') }),
              listFactors: () => Promise.resolve({ data: { totp: [] }, error: null }),
              unenroll: () => Promise.resolve({ error: null }),
            },
          };
        }
        if (prop === 'from') {
          return () => ({
            select: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            insert: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            update: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            delete: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
          });
        }
        if (prop === 'rpc') {
          return () => Promise.resolve({ data: null, error: new Error('Supabase not configured') });
        }
        return undefined;
      },
    };
    return new Proxy({}, mockHandler) as ReturnType<typeof createClient<Database>>;
  }

  return createClient<Database>(
    supabaseUrl!,
    supabaseAnonKey!,
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
}

/**
 * Typed Supabase client for the PsiPilot database
 */
export const supabase = createSupabaseClient();

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
