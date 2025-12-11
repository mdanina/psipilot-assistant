import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { decryptPHI } from '@/lib/encryption';

export interface CaseSummaryData {
  caseSummary: string | null;
  generatedAt: string | null;
}

/**
 * React Query hook for fetching patient case summary with caching
 * 
 * Usage:
 * ```tsx
 * const { data, isLoading } = usePatientCaseSummary(patientId);
 * ```
 */
export function usePatientCaseSummary(patientId: string | undefined) {
  return useQuery<CaseSummaryData, Error>({
    queryKey: ['patients', patientId, 'case_summary'],
    queryFn: async () => {
      if (!patientId) {
        return { caseSummary: null, generatedAt: null };
      }

      // Get case summary from database
      const { data, error } = await supabase
        .from('patients')
        .select('case_summary_encrypted, case_summary_generated_at')
        .eq('id', patientId)
        .single();

      if (error) {
        throw error;
      }

      if (!data?.case_summary_encrypted) {
        // No case summary yet - return empty data (not an error)
        return { caseSummary: null, generatedAt: data?.case_summary_generated_at || null };
      }

      // Decrypt the case summary
      try {
        const decrypted = await decryptPHI(data.case_summary_encrypted);
        return {
          caseSummary: decrypted,
          generatedAt: data.case_summary_generated_at || null,
        };
      } catch (err) {
        console.error('Error decrypting case summary:', err);
        throw new Error('Failed to decrypt case summary');
      }
    },
    // Only run query if patientId is provided
    enabled: !!patientId,
    // Cache configuration - data is always fresh (never refetch automatically)
    staleTime: Infinity, // Data is always fresh (never refetch automatically)
    gcTime: 30 * 60 * 1000, // 30 minutes (keep in cache longer)
    // Don't refetch on mount - use cache if available
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}

/**
 * Invalidate case summary cache for a patient
 * Note: This should be called from a component that has access to QueryClient
 */
export function useInvalidatePatientCaseSummary() {
  const queryClient = useQueryClient();
  
  return (patientId: string) => {
    queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'case_summary'] });
  };
}

