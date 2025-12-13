import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getPatientSessions, 
  getSessionsContentCounts, 
  searchPatientSessions, 
  deleteSession,
  type SessionContentCounts 
} from '@/lib/supabase-sessions';
import { getClinicalNotesForPatient, softDeleteClinicalNote } from '@/lib/supabase-ai';
import type { Database } from '@/types/database.types';
import type { GeneratedClinicalNote } from '@/types/ai.types';

type Session = Database['public']['Tables']['sessions']['Row'];

export interface PatientActivitiesData {
  sessions: Session[];
  clinicalNotes: GeneratedClinicalNote[];
  contentCounts: Map<string, SessionContentCounts>;
}

/**
 * React Query hook for fetching patient activities (sessions + clinical notes)
 * 
 * Usage:
 * ```tsx
 * const { data, isLoading, error } = usePatientActivities(patientId);
 * ```
 */
export function usePatientActivities(patientId: string | undefined) {
  return useQuery<PatientActivitiesData, Error>({
    queryKey: ['patients', patientId, 'activities'],
    queryFn: async () => {
      if (!patientId) {
        return {
          sessions: [],
          clinicalNotes: [],
          contentCounts: new Map(),
        };
      }

      // Load sessions and clinical notes in parallel
      // Use Promise.allSettled to handle errors gracefully - if one fails, others still work
      const [sessionsResult, notesResult] = await Promise.allSettled([
        getPatientSessions(patientId),
        getClinicalNotesForPatient(patientId).catch((err) => {
          // Gracefully handle errors for clinical notes
          console.warn('Failed to load clinical notes:', err);
          return [];
        }),
      ]);

      // Handle sessions
      if (sessionsResult.status === 'rejected') {
        throw sessionsResult.reason;
      }
      const sessionsData = sessionsResult.value;
      if (sessionsData.error) {
        throw sessionsData.error;
      }
      const sessions = sessionsData.data || [];

      // Handle clinical notes
      const notesData = notesResult.status === 'fulfilled' 
        ? notesResult.value 
        : [];

      // Load content counts for all sessions
      let contentCounts = new Map<string, SessionContentCounts>();
      if (sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        contentCounts = await getSessionsContentCounts(sessionIds);
      }

      return {
        sessions: sessions.filter(s => s != null),
        clinicalNotes: (notesData || []).filter(n => n != null),
        contentCounts,
      };
    },
    // Only run query if patientId is provided
    enabled: !!patientId,
    // Cache configuration - data is always fresh (never refetch automatically)
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}

/**
 * React Query hook for searching patient sessions
 * 
 * Usage:
 * ```tsx
 * const { data: sessionIds, isLoading } = useSearchPatientSessions(patientId, searchQuery);
 * ```
 */
export function useSearchPatientSessions(patientId: string | undefined, searchQuery: string) {
  // Debounce search query
  const debouncedQuery = useMemo(() => {
    return searchQuery.trim().length >= 2 ? searchQuery.trim() : '';
  }, [searchQuery]);

  return useQuery<string[], Error>({
    queryKey: ['patients', patientId, 'sessions', 'search', debouncedQuery],
    queryFn: async () => {
      if (!patientId || !debouncedQuery) {
        return [];
      }

      const { data, error } = await searchPatientSessions(patientId, debouncedQuery);
      
      if (error) {
        throw error;
      }
      
      return data || [];
    },
    // Only run query if patientId and debouncedQuery are provided
    enabled: !!patientId && debouncedQuery.length > 0,
    // Cache search results for 2 minutes
    staleTime: 2 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 1000,
  });
}

/**
 * React Query mutation for deleting a session
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      // deleteSession throws on error, returns void on success
      await deleteSession(sessionId);
      return { success: true };
    },
    // Invalidate activities cache after successful deletion
    onSuccess: (_, sessionId) => {
      // Invalidate all patient activities queries
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/**
 * React Query mutation for deleting a clinical note
 */
export function useDeleteClinicalNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      // softDeleteClinicalNote throws on error, returns void on success
      await softDeleteClinicalNote(noteId);
      return { success: true };
    },
    // Invalidate activities cache after successful deletion
    onSuccess: () => {
      // Invalidate all patient activities queries
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/**
 * Invalidate patient activities cache
 */
export function useInvalidatePatientActivities() {
  const queryClient = useQueryClient();
  
  return (patientId: string) => {
    queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'activities'] });
  };
}

