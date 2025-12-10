import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { createSession, deleteSession, completeSession, linkSessionToPatient } from '@/lib/supabase-sessions';
import type { Database } from '@/types/database.types';

type Session = Database['public']['Tables']['sessions']['Row'];

/**
 * React Query hook for fetching all sessions for a clinic
 * 
 * Usage:
 * ```tsx
 * const { data: sessions, isLoading, error } = useSessions(clinicId);
 * ```
 */
export function useSessions(clinicId: string | undefined) {
  // Use a ref to track the last valid clinicId to prevent queryKey changes
  // This ensures that once we have a clinicId, we keep using it even if it briefly becomes undefined
  const stableClinicId = clinicId || null;
  
  return useQuery<Session[], Error>({
    // Use stable queryKey - use null instead of 'no-clinic' to be more explicit
    queryKey: ['sessions', stableClinicId],
    queryFn: async () => {
      if (!stableClinicId) {
        console.log('[useSessions] No clinicId, returning empty array');
        return [];
      }

      console.log('[useSessions] ⚠️ Fetching sessions from server for clinic:', stableClinicId);
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('clinic_id', stableClinicId)
        .is('deleted_at', null) // Only get non-deleted sessions
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[useSessions] Error fetching sessions:', error);
        throw error;
      }

      console.log('[useSessions] ✅ Fetched', data?.length || 0, 'sessions from server');
      return data || [];
    },
    // Only run query if clinicId is provided
    enabled: !!stableClinicId,
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
      if (previousData && previousData.length > 0) {
        console.log('[useSessions] ✅ Using cached data,', previousData.length, 'sessions');
      }
      return previousData;
    },
  });
}

/**
 * React Query mutation for creating a session
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: Parameters<typeof createSession>[0]) => {
      return await createSession(params);
    },
    // Invalidate sessions cache after successful creation
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', variables.clinicId] });
    },
  });
}

/**
 * React Query mutation for deleting a session
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      // deleteSession returns Promise<void> and throws on error
      await deleteSession(sessionId);
      return { success: true };
    },
    // Invalidate sessions cache after successful deletion
    onSuccess: () => {
      // Invalidate all sessions queries
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * React Query mutation for completing a session
 */
export function useCompleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return await completeSession(sessionId);
    },
    // Invalidate sessions cache after successful completion
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * React Query mutation for linking a session to a patient
 */
export function useLinkSessionToPatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      patientId, 
      options 
    }: { 
      sessionId: string; 
      patientId: string;
      options?: {
        allowRelinkFinalized?: boolean;
        allowRelinkSigned?: boolean;
      };
    }) => {
      return await linkSessionToPatient(sessionId, patientId, options);
    },
    // Invalidate sessions cache after successful linking
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      // Also invalidate patients cache in case patient data changed
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/**
 * Invalidate sessions cache
 */
export function useInvalidateSessions() {
  const queryClient = useQueryClient();
  
  return (clinicId?: string) => {
    if (clinicId) {
      queryClient.invalidateQueries({ queryKey: ['sessions', clinicId] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
  };
}

