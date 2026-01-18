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
    // Refetch sessions cache after successful creation
    onSuccess: async (_, variables) => {
      await queryClient.refetchQueries({ queryKey: ['sessions', variables.clinicId] });
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
    // Refetch sessions cache after successful deletion
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['sessions'] });
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
    // Refetch sessions cache after successful completion
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['sessions'] });
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
    // Refetch caches after successful linking
    // Note: We use refetchQueries instead of invalidateQueries because with staleTime: Infinity,
    // invalidateQueries only marks data as stale but doesn't trigger a refetch
    onSuccess: async (_, variables) => {
      // Refetch sessions cache
      await queryClient.refetchQueries({ queryKey: ['sessions'] });
      // Refetch patient activities cache so the session appears in patient's card
      await queryClient.refetchQueries({
        queryKey: ['patients', variables.patientId, 'activities']
      });
    },
  });
}

/**
 * React Query hook for fetching sessions by their IDs
 * Used for loading sessions that are open in tabs (independent of the 50 limit)
 *
 * Usage:
 * ```tsx
 * const { data: tabSessions, isLoading } = useSessionsByIds(sessionIds);
 * ```
 */
export function useSessionsByIds(sessionIds: string[]) {
  // Create stable key from sorted IDs
  const stableIds = useMemo(() => [...sessionIds].sort(), [sessionIds]);
  const idsKey = stableIds.join(',');

  return useQuery<Session[], Error>({
    queryKey: ['sessions', 'byIds', idsKey],
    queryFn: async () => {
      if (stableIds.length === 0) {
        return [];
      }

      console.log('[useSessionsByIds] Fetching', stableIds.length, 'sessions by IDs');
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .in('id', stableIds)
        .is('deleted_at', null);

      if (error) {
        console.error('[useSessionsByIds] Error fetching sessions:', error);
        throw error;
      }

      console.log('[useSessionsByIds] ✅ Fetched', data?.length || 0, 'sessions');
      return data || [];
    },
    enabled: stableIds.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

/**
 * Refetch sessions cache
 * Note: Named "invalidate" for backward compatibility, but actually refetches
 */
export function useInvalidateSessions() {
  const queryClient = useQueryClient();

  return async (clinicId?: string) => {
    if (clinicId) {
      await queryClient.refetchQueries({ queryKey: ['sessions', clinicId] });
    } else {
      await queryClient.refetchQueries({ queryKey: ['sessions'] });
    }
    // Also refetch sessions by IDs cache
    await queryClient.refetchQueries({ queryKey: ['sessions', 'byIds'] });
  };
}

