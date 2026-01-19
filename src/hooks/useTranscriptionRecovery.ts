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
  addTranscription: (recordingId: string, sessionId: string, startedAt?: string) => void;
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

  const { user, isAuthenticated, updateActivity, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [processingTranscriptions, setProcessingTranscriptions] = useState<Map<string, ProcessingTranscription>>(new Map());

  // Refs for polling management
  const pollingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollingAttemptsRef = useRef<Map<string, number>>(new Map());
  const pollingActiveRef = useRef<Set<string>>(new Set()); // Tracks active polling to prevent duplicates
  const recordingInfoRef = useRef<Map<string, { startedAt?: string }>>(new Map());
  const isMountedRef = useRef(true);

  // Cleanup function for a single recording's polling
  const stopPolling = useCallback((recordingId: string) => {
    const timeout = pollingTimeoutsRef.current.get(recordingId);
    if (timeout) {
      clearTimeout(timeout);
      pollingTimeoutsRef.current.delete(recordingId);
    }
    pollingAttemptsRef.current.delete(recordingId);
    pollingActiveRef.current.delete(recordingId);
  }, []);

  // Cleanup all polling
  const stopAllPolling = useCallback(() => {
    pollingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    pollingTimeoutsRef.current.clear();
    pollingAttemptsRef.current.clear();
    pollingActiveRef.current.clear();
  }, []);

  // Poll status for a single recording
  const pollRecordingStatus = useCallback(async (recordingId: string, sessionIdForRecording: string) => {
    if (!isMountedRef.current || !isAuthenticated) {
      stopPolling(recordingId);
      return;
    }

    const attempts = (pollingAttemptsRef.current.get(recordingId) || 0) + 1;
    pollingAttemptsRef.current.set(recordingId, attempts);

    // Max attempts: ~12 hours at max interval (for long audio files like 50+ min)
    // Calculation: 6 attempts × 5s + 20 attempts × 30s + 690 attempts × 60s = 12 hours
    const MAX_ATTEMPTS = 720;
    if (attempts > MAX_ATTEMPTS) {
      console.warn(`[useTranscriptionRecovery] Max attempts reached for ${recordingId}, marking as stuck`);
      stopPolling(recordingId);

      // Mark as failed instead of silently removing
      try {
        await supabase
          .from('recordings')
          .update({
            transcription_status: 'failed',
            transcription_error: 'Транскрипция не завершилась за 12 часов. Попробуйте повторить.',
          })
          .eq('id', recordingId);
      } catch (e) {
        console.error('[useTranscriptionRecovery] Error marking as failed:', e);
      }

      setProcessingTranscriptions(prev => {
        const next = new Map(prev);
        next.delete(recordingId);
        return next;
      });

      toast({
        title: "Транскрипция не завершилась",
        description: "Превышено время ожидания. Попробуйте повторить транскрипцию.",
        variant: "destructive",
      });

      onError?.(recordingId, 'Transcription timed out after 12 hours');
      return;
    }

    try {
      // Update activity to prevent session timeout
      updateActivity();

      // Get recording info to check age
      const recordingInfo = recordingInfoRef.current.get(recordingId);
      const recordingAge = recordingInfo?.startedAt 
        ? Date.now() - new Date(recordingInfo.startedAt).getTime()
        : 0;
      
      // Determine if we should sync:
      // 1. First sync at attempt 1 if recording is older than 2 minutes (likely a recovery)
      // 2. Then sync at attempt 7 (after 30 seconds) - for short recordings
      // 3. Then sync every ~2 minutes (every 4 attempts at 30sec interval, which is attempts 10, 14, 18...)
      // 4. For long-running transcriptions (>1 hour), sync every 5 minutes
      const isOldRecording = recordingAge > 120000; // 2 minutes
      const isLongRunning = recordingAge > 60 * 60 * 1000; // > 1 hour
      const shouldSyncOnFirstAttempt = attempts === 1 && isOldRecording;
      const shouldSyncEarly = attempts === 7; // After 30 seconds (6 * 5sec = 30sec)
      const shouldSyncRegular = attempts > 7 && ((attempts - 7) % 4 === 0); // Every ~2 min after initial
      // For long-running transcriptions, sync every 5 minutes (every 5 attempts at 60sec interval)
      const shouldSyncLongRunning = isLongRunning && (attempts % 5 === 0);
      const shouldSync = shouldSyncOnFirstAttempt || shouldSyncEarly || shouldSyncRegular || shouldSyncLongRunning;
      
      const status = await getRecordingStatus(recordingId, transcriptionApiUrl, shouldSync);

      // Check for stuck transcriptions
      const syncError = (status as any).syncError as Error | undefined;
      const isVeryOld = recordingAge > 6 * 60 * 60 * 1000; // > 6 hours (reduced from 24h for better UX)
      const isModeratelyOld = recordingAge > 10 * 60 * 1000; // > 10 minutes

      // Mark as stuck/failed if:
      // 1. Recording is > 6 hours old (regardless of sync status) - even long audio shouldn't take this long
      // 2. Recording is > 10 minutes old AND sync failed with any error
      const shouldMarkAsFailed = isVeryOld || (isModeratelyOld && shouldSync && syncError);

      if (shouldMarkAsFailed && status.status === 'processing') {
        const errorMessage = syncError?.message || '';
        const isNoTranscriptIdError = errorMessage.includes('No transcript_id found') ||
                                      errorMessage.includes('transcript_id') ||
                                      errorMessage.includes('Transcription may not have started');

        const failureReason = isVeryOld
          ? 'Транскрипция зависла (более 6 часов). Попробуйте повторить.'
          : isNoTranscriptIdError
            ? 'Транскрипция не была запущена. Попробуйте повторить транскрипцию.'
            : 'Не удалось синхронизировать статус транскрипции. Попробуйте повторить.';

        console.warn(`[useTranscriptionRecovery] Stuck transcription (${Math.round(recordingAge / 1000 / 60)}min), marking as failed: ${recordingId}. Reason: ${failureReason}`);

        // Mark as failed in database
        try {
          const { error: updateError } = await supabase
            .from('recordings')
            .update({
              transcription_status: 'failed',
              transcription_error: failureReason,
            })
            .eq('id', recordingId);

          if (updateError) {
            console.error('[useTranscriptionRecovery] Failed to mark recording as failed:', updateError);
          } else {
            // Update status to reflect the change
            (status as any).status = 'failed';
            (status as any).error = failureReason;

            // For stuck transcriptions, remove from list after a short delay
            // This keeps the UI clean while still showing the toast notification
            setTimeout(() => {
              stopPolling(recordingId);
              setProcessingTranscriptions(prev => {
                const next = new Map(prev);
                next.delete(recordingId);
                return next;
              });
              console.log(`[useTranscriptionRecovery] Removed stuck transcription from UI: ${recordingId}`);
            }, 5000); // Remove after 5 seconds
          }
        } catch (updateErr) {
          console.error('[useTranscriptionRecovery] Error updating recording status:', updateErr);
        }
      }
      
      if (shouldSync) {
        console.log(`[useTranscriptionRecovery] Syncing status for ${recordingId} (attempt ${attempts}, age: ${Math.round(recordingAge / 1000)}s)`);
      }

      if (!isMountedRef.current) return;

      if (status.status === 'completed') {
        console.log(`[useTranscriptionRecovery] ✅ Transcription completed: ${recordingId}`);

        stopPolling(recordingId);
        setProcessingTranscriptions(prev => {
          const next = new Map(prev);
          next.delete(recordingId);
          return next;
        });

        // Invalidate React Query caches to ensure new session appears
        // Invalidate both specific clinic sessions and all sessions queries
        if (profile?.clinic_id) {
          console.log(`[useTranscriptionRecovery] Invalidating sessions cache for clinic: ${profile.clinic_id}, sessionId: ${sessionIdForRecording}`);
          
          // First invalidate to mark as stale
          queryClient.invalidateQueries({ queryKey: ['sessions', profile.clinic_id] });
          
          // Force immediate refetch to ensure new session appears
          try {
            await queryClient.refetchQueries({ 
              queryKey: ['sessions', profile.clinic_id],
              type: 'active' // Only refetch active queries
            });
            console.log(`[useTranscriptionRecovery] ✅ Refetched sessions for clinic: ${profile.clinic_id}`);
          } catch (refetchError) {
            console.error(`[useTranscriptionRecovery] Error refetching sessions:`, refetchError);
          }
        }
        // Invalidate all sessions queries
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        // Also invalidate sessions by IDs cache (for open tabs)
        queryClient.invalidateQueries({ queryKey: ['sessions', 'byIds'] });

        toast({
          title: "Транскрипция завершена",
          description: "Аудио успешно транскрибировано",
        });

        onComplete?.(recordingId, sessionIdForRecording);

      } else if (status.status === 'failed') {
        console.error(`[useTranscriptionRecovery] ❌ Transcription failed: ${recordingId}`, status.error);

        stopPolling(recordingId);
        
        // Show failed status briefly, then remove from list
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

        // Remove from list after showing notification (5 seconds)
        // This keeps the UI clean while user sees the error
        setTimeout(() => {
          setProcessingTranscriptions(prev => {
            const next = new Map(prev);
            next.delete(recordingId);
            return next;
          });
          recordingInfoRef.current.delete(recordingId);
        }, 5000);

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

      // If recording is very old (more than 7 days) and we keep getting errors, stop polling
      const recordingInfo = recordingInfoRef.current.get(recordingId);
      const recordingAge = recordingInfo?.startedAt 
        ? Date.now() - new Date(recordingInfo.startedAt).getTime()
        : 0;
      const isVeryOld = recordingAge > 7 * 24 * 60 * 60 * 1000; // 7 days

      if (isVeryOld && attempts > 10) {
        console.warn(`[useTranscriptionRecovery] Very old transcription (${Math.round(recordingAge / 1000 / 60 / 60)}h) with persistent errors, stopping polling: ${recordingId}`);
        stopPolling(recordingId);
        setProcessingTranscriptions(prev => {
          const next = new Map(prev);
          next.delete(recordingId);
          return next;
        });
        return;
      }

      // Retry with longer interval on error
      const timeout = setTimeout(() => {
        pollRecordingStatus(recordingId, sessionIdForRecording);
      }, 30000);
      pollingTimeoutsRef.current.set(recordingId, timeout);
    }
  }, [isAuthenticated, updateActivity, queryClient, toast, onComplete, onError, stopPolling]);

  // Start polling for a recording
  const startPolling = useCallback((recordingId: string, sessionIdForRecording: string) => {
    // Don't start if already polling (check both active flag and timeout)
    if (pollingActiveRef.current.has(recordingId) || pollingTimeoutsRef.current.has(recordingId)) {
      console.log(`[useTranscriptionRecovery] Polling already active for ${recordingId}, skipping`);
      return;
    }

    // Mark as active BEFORE starting async operation to prevent race conditions
    pollingActiveRef.current.add(recordingId);

    // Start immediately
    pollRecordingStatus(recordingId, sessionIdForRecording);
  }, [pollRecordingStatus]);

  // Add a transcription to track
  const addTranscription = useCallback((recordingId: string, sessionIdForRecording: string, startedAt?: string) => {
    setProcessingTranscriptions(prev => {
      const next = new Map(prev);
      next.set(recordingId, {
        recordingId,
        sessionId: sessionIdForRecording,
        status: 'processing',
        startedAt,
      });
      return next;
    });

    // Store in ref for quick access during polling
    if (startedAt) {
      recordingInfoRef.current.set(recordingId, { startedAt });
    }

    startPolling(recordingId, sessionIdForRecording);
  }, [startPolling]);

  // Remove a transcription from tracking
  const removeTranscription = useCallback((recordingId: string) => {
    stopPolling(recordingId);
    recordingInfoRef.current.delete(recordingId);
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
      // Use functional update to avoid dependency on processingTranscriptions
      const recordingsToTrack: Array<{ id: string; session_id: string; file_name: string | null; created_at: string }> = [];
      
      data.forEach((recording: { id: string; session_id: string; file_name: string | null; created_at: string }) => {
        setProcessingTranscriptions(prev => {
          // Skip if already tracking
          if (prev.has(recording.id)) {
            return prev;
          }
          
          const recordingAge = Date.now() - new Date(recording.created_at).getTime();
          const isOldRecording = recordingAge > 120000; // Older than 2 minutes
          
          const next = new Map(prev);
          next.set(recording.id, {
            recordingId: recording.id,
            sessionId: recording.session_id,
            status: 'processing',
            fileName: recording.file_name || undefined,
            startedAt: recording.created_at,
          });

          // Store in ref for quick access during polling
          recordingInfoRef.current.set(recording.id, { startedAt: recording.created_at });

          // If recording is old, sync immediately on first poll
          // This helps catch stuck transcriptions that were found during recovery
          if (isOldRecording) {
            console.log(`[useTranscriptionRecovery] Old recording found (${Math.round(recordingAge / 1000)}s), will sync immediately: ${recording.id}`);
          }

          // Collect recordings to start polling after state updates
          recordingsToTrack.push(recording);

          return next;
        });
      });
      
      // Start polling for all new recordings after state updates
      recordingsToTrack.forEach(recording => {
        startPolling(recording.id, recording.session_id);
      });
    } catch (error) {
      console.error('[useTranscriptionRecovery] Error in refreshFromDatabase:', error);
    }
  }, [user?.id, isAuthenticated, sessionId, startPolling]);

  // On mount: fetch processing recordings and start polling
  useEffect(() => {
    isMountedRef.current = true;
    let timeoutId: NodeJS.Timeout | null = null;

    if (isAuthenticated && user?.id) {
      console.log('[useTranscriptionRecovery] Component mounted, refreshing from database...');
      // Small delay to ensure component is fully mounted
      timeoutId = setTimeout(() => {
        refreshFromDatabase();
      }, 100);
    }

    // Unified cleanup function - always runs on unmount
    return () => {
      isMountedRef.current = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
