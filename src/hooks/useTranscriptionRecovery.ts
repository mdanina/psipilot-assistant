import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getRecordingStatus, syncTranscriptionStatus } from '@/lib/supabase-recordings';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/types/database.types';

type Recording = Database['public']['Tables']['recordings']['Row'];

export interface ProcessingTranscription {
  recordingId: string;
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  fileName?: string;
  startedAt?: string;
}

interface UseTranscriptionRecoveryOptions {
  /**
   * Filter by specific session ID.
   * If provided, only tracks transcriptions for this session.
   * If not provided, tracks all user's transcriptions.
   */
  sessionId?: string;
  /** Called when any transcription completes successfully */
  onComplete?: (recordingId: string, sessionId: string) => void;
  /** Called when any transcription fails */
  onError?: (recordingId: string, error: string) => void;
}

interface UseTranscriptionRecoveryReturn {
  /** Map of currently processing transcriptions */
  processingTranscriptions: Map<string, ProcessingTranscription>;
  /** Whether any transcription is currently processing */
  isAnyProcessing: boolean;
  /** Number of active transcriptions */
  count: number;
  /** Manually add a transcription to track (called after starting transcription) */
  addTranscription: (recordingId: string, sessionId: string) => void;
  /** Manually remove a transcription from tracking */
  removeTranscription: (recordingId: string) => void;
  /** Force refresh status from database */
  refreshFromDatabase: () => Promise<void>;
}

/**
 * Adaptive polling interval based on elapsed time
 * - First 30 seconds: every 5 seconds (quick feedback for short files)
 * - 30 sec - 10 min: every 30 seconds
 * - After 10 min: every 60 seconds (for long files like 40+ min)
 */
function getPollingInterval(attempts: number): number {
  if (attempts < 6) return 5000;      // first 30 sec
  if (attempts < 26) return 30000;    // up to ~10 min
  return 60000;                        // after 10 min
}

const transcriptionApiUrl = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://localhost:3001';

/**
 * Hook for recovering and tracking transcription status across page navigations.
 *
 * On mount:
 * 1. Fetches all recordings with 'processing' status for current user
 * 2. Starts adaptive polling for each
 * 3. Shows toast notifications on completion/failure
 * 4. Updates activity to prevent session timeout during active transcriptions
 *
 * Usage:
 * ```tsx
 * // Track all user's transcriptions (ScribePage)
 * const { processingTranscriptions, isAnyProcessing, addTranscription } = useTranscriptionRecovery();
 *
 * // Track only specific session's transcriptions (SessionsPage)
 * const { processingTranscriptions } = useTranscriptionRecovery({ sessionId: activeSession });
 * ```
 */
export function useTranscriptionRecovery(
  options: UseTranscriptionRecoveryOptions = {}
): UseTranscriptionRecoveryReturn {
  const { sessionId, onComplete, onError } = options;

  const { user, isAuthenticated, updateActivity } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [processingTranscriptions, setProcessingTranscriptions] = useState<Map<string, ProcessingTranscription>>(new Map());

  // Refs for polling management
  const pollingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollingAttemptsRef = useRef<Map<string, number>>(new Map());
  const isMountedRef = useRef(true);

  // Cleanup function for a single recording's polling
  const stopPolling = useCallback((recordingId: string) => {
    const timeout = pollingTimeoutsRef.current.get(recordingId);
    if (timeout) {
      clearTimeout(timeout);
      pollingTimeoutsRef.current.delete(recordingId);
    }
    pollingAttemptsRef.current.delete(recordingId);
  }, []);

  // Cleanup all polling
  const stopAllPolling = useCallback(() => {
    pollingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    pollingTimeoutsRef.current.clear();
    pollingAttemptsRef.current.clear();
  }, []);

  // Poll status for a single recording
  const pollRecordingStatus = useCallback(async (recordingId: string, sessionIdForRecording: string) => {
    if (!isMountedRef.current || !isAuthenticated) {
      stopPolling(recordingId);
      return;
    }

    const attempts = (pollingAttemptsRef.current.get(recordingId) || 0) + 1;
    pollingAttemptsRef.current.set(recordingId, attempts);

    // Max attempts: ~2 hours at max interval
    const MAX_ATTEMPTS = 150;
    if (attempts > MAX_ATTEMPTS) {
      console.warn(`[useTranscriptionRecovery] Max attempts reached for ${recordingId}`);
      stopPolling(recordingId);
      setProcessingTranscriptions(prev => {
        const next = new Map(prev);
        next.delete(recordingId);
        return next;
      });
      return;
    }

    try {
      // Update activity to prevent session timeout
      updateActivity();

      // Sync with AssemblyAI after 2 minutes (4 attempts at 30sec interval)
      const shouldSync = attempts > 10 && attempts % 5 === 0;
      const status = await getRecordingStatus(recordingId, transcriptionApiUrl, shouldSync);

      if (!isMountedRef.current) return;

      if (status.status === 'completed') {
        console.log(`[useTranscriptionRecovery] ✅ Transcription completed: ${recordingId}`);

        stopPolling(recordingId);
        setProcessingTranscriptions(prev => {
          const next = new Map(prev);
          next.delete(recordingId);
          return next;
        });

        // Invalidate React Query caches
        queryClient.invalidateQueries({ queryKey: ['sessions'] });

        toast({
          title: "Транскрипция завершена",
          description: "Аудио успешно транскрибировано",
        });

        onComplete?.(recordingId, sessionIdForRecording);

      } else if (status.status === 'failed') {
        console.error(`[useTranscriptionRecovery] ❌ Transcription failed: ${recordingId}`, status.error);

        stopPolling(recordingId);
        setProcessingTranscriptions(prev => {
          const next = new Map(prev);
          const existing = next.get(recordingId);
          if (existing) {
            next.set(recordingId, { ...existing, status: 'failed' });
          }
          return next;
        });

        toast({
          title: "Ошибка транскрипции",
          description: status.error || "Не удалось выполнить транскрипцию",
          variant: "destructive",
        });

        onError?.(recordingId, status.error || 'Unknown error');

      } else {
        // Still processing - schedule next poll
        const interval = getPollingInterval(attempts);
        const timeout = setTimeout(() => {
          pollRecordingStatus(recordingId, sessionIdForRecording);
        }, interval);
        pollingTimeoutsRef.current.set(recordingId, timeout);
      }
    } catch (error) {
      console.error(`[useTranscriptionRecovery] Error polling status:`, error);

      if (!isMountedRef.current) return;

      // Retry with longer interval on error
      const timeout = setTimeout(() => {
        pollRecordingStatus(recordingId, sessionIdForRecording);
      }, 30000);
      pollingTimeoutsRef.current.set(recordingId, timeout);
    }
  }, [isAuthenticated, updateActivity, queryClient, toast, onComplete, onError, stopPolling]);

  // Start polling for a recording
  const startPolling = useCallback((recordingId: string, sessionIdForRecording: string) => {
    // Don't start if already polling
    if (pollingTimeoutsRef.current.has(recordingId)) {
      return;
    }

    // Start immediately
    pollRecordingStatus(recordingId, sessionIdForRecording);
  }, [pollRecordingStatus]);

  // Add a transcription to track
  const addTranscription = useCallback((recordingId: string, sessionIdForRecording: string) => {
    setProcessingTranscriptions(prev => {
      const next = new Map(prev);
      next.set(recordingId, {
        recordingId,
        sessionId: sessionIdForRecording,
        status: 'processing',
      });
      return next;
    });

    startPolling(recordingId, sessionIdForRecording);
  }, [startPolling]);

  // Remove a transcription from tracking
  const removeTranscription = useCallback((recordingId: string) => {
    stopPolling(recordingId);
    setProcessingTranscriptions(prev => {
      const next = new Map(prev);
      next.delete(recordingId);
      return next;
    });
  }, [stopPolling]);

  // Fetch processing recordings from database
  const refreshFromDatabase = useCallback(async () => {
    if (!user?.id || !isAuthenticated) {
      return;
    }

    try {
      console.log('[useTranscriptionRecovery] Fetching processing recordings from DB...');

      let query = supabase
        .from('recordings')
        .select('id, session_id, file_name, created_at')
        .eq('user_id', user.id)
        .eq('transcription_status', 'processing')
        .is('deleted_at', null);

      // Filter by session if provided
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[useTranscriptionRecovery] Error fetching recordings:', error);
        return;
      }

      if (!data || data.length === 0) {
        console.log('[useTranscriptionRecovery] No processing recordings found');
        return;
      }

      console.log(`[useTranscriptionRecovery] Found ${data.length} processing recording(s)`);

      // Add each to tracking and start polling
      data.forEach((recording: { id: string; session_id: string; file_name: string | null; created_at: string }) => {
        if (!processingTranscriptions.has(recording.id)) {
          setProcessingTranscriptions(prev => {
            const next = new Map(prev);
            next.set(recording.id, {
              recordingId: recording.id,
              sessionId: recording.session_id,
              status: 'processing',
              fileName: recording.file_name || undefined,
              startedAt: recording.created_at,
            });
            return next;
          });

          startPolling(recording.id, recording.session_id);
        }
      });
    } catch (error) {
      console.error('[useTranscriptionRecovery] Error in refreshFromDatabase:', error);
    }
  }, [user?.id, isAuthenticated, sessionId, processingTranscriptions, startPolling]);

  // On mount: fetch processing recordings and start polling
  useEffect(() => {
    isMountedRef.current = true;

    if (isAuthenticated && user?.id) {
      refreshFromDatabase();
    }

    return () => {
      isMountedRef.current = false;
      stopAllPolling();
    };
  }, [isAuthenticated, user?.id]); // intentionally not including refreshFromDatabase to avoid loops

  // When sessionId filter changes, refresh
  useEffect(() => {
    if (isAuthenticated && user?.id && sessionId !== undefined) {
      // Clear current tracking when sessionId changes
      stopAllPolling();
      setProcessingTranscriptions(new Map());
      refreshFromDatabase();
    }
  }, [sessionId]); // intentionally minimal deps

  return {
    processingTranscriptions,
    isAnyProcessing: processingTranscriptions.size > 0,
    count: processingTranscriptions.size,
    addTranscription,
    removeTranscription,
    refreshFromDatabase,
  };
}
