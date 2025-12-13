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
import { getSupervisorConversations, type SupervisorConversationWithMessages } from '@/lib/supabase-supervisor-conversations';
import type { Database } from '@/types/database.types';
import type { GeneratedClinicalNote } from '@/types/ai.types';

type Session = Database['public']['Tables']['sessions']['Row'];

export interface PatientActivitiesData {
  sessions: Session[];
  clinicalNotes: GeneratedClinicalNote[];
  supervisorConversations: SupervisorConversationWithMessages[];
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
          supervisorConversations: [],
          contentCounts: new Map(),
        };
      }

      // Load sessions, clinical notes, and supervisor conversations in parallel
      // Use Promise.allSettled to handle errors gracefully - if one fails, others still work
      const [sessionsResult, notesResult, conversationsResult] = await Promise.allSettled([
        getPatientSessions(patientId),
        getClinicalNotesForPatient(patientId).catch((err) => {
          // Gracefully handle errors for clinical notes
          console.warn('Failed to load clinical notes:', err);
          return [];
        }),
        getSupervisorConversations(patientId).catch((err) => {
          // Gracefully handle errors (e.g., table doesn't exist yet)
          console.warn('Failed to load supervisor conversations:', err);
          return { data: [], error: null };
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

      // Handle supervisor conversations (gracefully handle errors)
      const conversationsData = conversationsResult.status === 'fulfilled'
        ? conversationsResult.value
        : { data: [], error: null };
      
      // Check if conversationsData has an error, but don't throw - just log it
      if (conversationsData.error) {
        console.warn('Error loading supervisor conversations:', conversationsData.error);
      }

      // Load content counts for all sessions
      let contentCounts = new Map<string, SessionContentCounts>();
      if (sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        contentCounts = await getSessionsContentCounts(sessionIds);
      }

      return {
        sessions: sessions.filter(s => s != null),
        clinicalNotes: (notesData || []).filter(n => n != null),
        supervisorConversations: (conversationsData.data || []).filter(c => c != null && c.id != null),
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

