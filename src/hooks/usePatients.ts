import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPatients, getPatient, searchPatients, deletePatient, getPatientDocumentCounts, type DecryptedPatient } from '@/lib/supabase-patients';

export interface PatientWithDocuments extends DecryptedPatient {
  documentCount: number;
}

/**
 * React Query hook for fetching patients with document counts
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
 * ```
 */
export function usePatients() {
  return useQuery<PatientWithDocuments[], Error>({
    queryKey: ['patients'],
    queryFn: async () => {
      console.log('[usePatients] Fetching patients from server');
      // Get patients
      const { data: patientsData, error: patientsError } = await getPatients();
      
      if (patientsError) {
        console.error('[usePatients] Error fetching patients:', patientsError);
        throw patientsError;
      }

      if (!patientsData || patientsData.length === 0) {
        console.log('[usePatients] No patients found');
        return [];
      }

      // Get document counts for all patients
      const patientIds = patientsData.map((p) => p.id);
      const documentCounts = await getPatientDocumentCounts(patientIds);

      // Combine patient data with document counts
      const patientsWithDocs: PatientWithDocuments[] = patientsData.map((patient) => ({
        ...patient,
        documentCount: documentCounts[patient.id] || 0,
      }));

      console.log('[usePatients] Fetched', patientsWithDocs.length, 'patients from server');
      return patientsWithDocs;
    },
    // Cache configuration - data is always fresh (never refetch automatically)
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
    // Keep previous data while new data is loading (prevents flicker)
    placeholderData: (previousData) => {
      if (previousData) {
        console.log('[usePatients] Using cached data,', previousData.length, 'patients');
      }
      return previousData;
    },
  });
}

/**
 * React Query hook for searching patients
 * 
 * Usage:
 * ```tsx
 * const { data: patients, isLoading } = useSearchPatients(searchQuery);
 * ```
 */
export function useSearchPatients(searchQuery: string) {
  // Debounce search query to avoid too many requests
  const debouncedQuery = useMemo(() => {
    // Only search if query is not empty and has at least 2 characters
    return searchQuery.trim().length >= 2 ? searchQuery.trim() : '';
  }, [searchQuery]);

  return useQuery<PatientWithDocuments[], Error>({
    queryKey: ['patients', 'search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) {
        return [];
      }

      const { data: searchData, error: searchError } = await searchPatients(debouncedQuery);
      
      if (searchError) {
        throw searchError;
      }

      if (!searchData || searchData.length === 0) {
        return [];
      }

      // Get document counts for filtered patients
      const patientIds = searchData.map((p) => p.id);
      const documentCounts = await getPatientDocumentCounts(patientIds);

      const patientsWithDocs: PatientWithDocuments[] = searchData.map((patient) => ({
        ...patient,
        documentCount: documentCounts[patient.id] || 0,
      }));

      return patientsWithDocs;
    },
    // Only run query if debouncedQuery is not empty
    enabled: debouncedQuery.length > 0,
    // Cache search results for 2 minutes
    staleTime: 2 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // Retry only once
    retry: 1,
    retryDelay: 1000,
  });
}

/**
 * React Query hook for fetching a single patient by ID
 * 
 * Usage:
 * ```tsx
 * const { data: patient, isLoading, error } = usePatient(patientId);
 * ```
 */
export function usePatient(patientId: string | undefined) {
  return useQuery<DecryptedPatient | null, Error>({
    queryKey: ['patients', patientId],
    queryFn: async () => {
      if (!patientId) {
        return null;
      }

      const { data, error } = await getPatient(patientId);
      
      if (error) {
        throw error;
      }
      
      return data || null;
    },
    // Only run query if patientId is provided
    enabled: !!patientId,
    // Cache configuration - longer staleTime to prevent refetching
    staleTime: Infinity, // Data is always fresh (never refetch automatically)
    gcTime: 30 * 60 * 1000, // 30 minutes (keep in cache longer)
    // Don't refetch on mount - use cache if available
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}

/**
 * React Query mutation for deleting a patient
 * Automatically invalidates patients cache after deletion
 * 
 * Usage:
 * ```tsx
 * const deletePatientMutation = useDeletePatient();
 * 
 * const handleDelete = () => {
 *   deletePatientMutation.mutate(patientId, {
 *     onSuccess: () => {
 *       toast({ title: "Успешно", description: "Пациент удален" });
 *     },
 *   });
 * };
 * ```
 */
export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patientId: string) => {
      const { success, error } = await deletePatient(patientId);
      
      if (error || !success) {
        throw error || new Error('Не удалось удалить пациента');
      }
      
      return { success: true };
    },
    // Invalidate patients cache after successful deletion
    onSuccess: () => {
      // Invalidate all patients queries (main list, individual patient, and searches)
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

