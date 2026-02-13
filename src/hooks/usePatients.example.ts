/**
 * EXAMPLE: Safe React Query hook for patients
 * 
 * This is an EXAMPLE file showing how to safely migrate to React Query.
 * 
 * TO USE:
 * 1. Copy this file to src/hooks/usePatients.ts
 * 2. Gradually replace getPatients() calls with this hook
 * 3. Old code continues to work - this is just an addition
 * 
 * SAFETY:
 * - Old code (getPatients, loadPatients) still works
 * - This hook can be used alongside old code
 * - Can be removed/reverted at any time
 */

import { useQuery } from '@tanstack/react-query';
import { getPatients, type DecryptedPatient } from '@/lib/supabase-patients';

export interface UsePatientsOptions {
  // Enable/disable the query (useful for conditional fetching)
  enabled?: boolean;
  
  // Refetch interval in milliseconds (optional)
  refetchInterval?: number;
}

/**
 * React Query hook for fetching patients
 * 
 * Benefits:
 * - Automatic caching (5 minutes)
 * - Automatic refetching on window focus (if enabled)
 * - Automatic retry on errors
 * - Loading and error states
 * 
 * Usage:
 * ```tsx
 * const { data: patients, isLoading, error, refetch } = usePatients();
 * 
 * if (isLoading) return <Loader />;
 * if (error) return <Error message={error.message} />;
 * 
 * return <PatientsList patients={patients || []} />;
 * ```
 */
export function usePatients(options: UsePatientsOptions = {}) {
  return useQuery<DecryptedPatient[], Error>({
    queryKey: ['patients'],
    queryFn: async () => {
      // Use existing getPatients function - no changes needed there!
      const { data, error } = await getPatients();
      if (error) {
        throw error;
      }
      return data || [];
    },
    // Use options
    enabled: options.enabled !== false,
    refetchInterval: options.refetchInterval,
    
    // Cache configuration (inherited from query-client.ts, but can override)
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Example: How to use this hook in PatientsPage
 * 
 * OLD CODE (still works):
 * ```tsx
 * const [patients, setPatients] = useState<PatientWithDocuments[]>([]);
 * const loadPatients = useCallback(async () => {
 *   const { data, error } = await getPatients();
 *   // ...
 * }, []);
 * ```
 * 
 * NEW CODE (optional, can be used alongside old code):
 * ```tsx
 * import { usePatients } from '@/hooks/usePatients';
 * 
 * const { data: patients = [], isLoading, error, refetch } = usePatients();
 * 
 * // That's it! No need for useState, useCallback, useEffect
 * // React Query handles everything automatically
 * ```
 * 
 * HYBRID APPROACH (safest migration):
 * ```tsx
 * // Keep old code as fallback
 * const [patients, setPatients] = useState<PatientWithDocuments[]>([]);
 * 
 * // Add new hook (optional)
 * const { data: cachedPatients, isLoading } = usePatients();
 * 
 * // Use cached data if available, otherwise use state
 * const displayPatients = cachedPatients || patients;
 * 
 * // Gradually migrate: when confident, remove old code
 * ```
 */
