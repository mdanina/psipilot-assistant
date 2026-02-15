import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ============================================================================
// Mocks — must be declared before imports
// ============================================================================

const mockToast = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockRefetchQueries = vi.fn().mockResolvedValue(undefined);
const mockUpdateActivity = vi.fn();
const mockGetRecordingStatus = vi.fn();
const mockSyncTranscriptionStatus = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    refetchQueries: mockRefetchQueries,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
    isAuthenticated: true,
    updateActivity: mockUpdateActivity,
    profile: { clinic_id: 'clinic-456' },
  }),
}));

vi.mock('@/lib/supabase-recordings', () => ({
  getRecordingStatus: (...args: unknown[]) => mockGetRecordingStatus(...args),
  syncTranscriptionStatus: (...args: unknown[]) => mockSyncTranscriptionStatus(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    }),
  },
}));

import { useTranscriptionRecovery } from '../useTranscriptionRecovery';
import { supabase } from '@/lib/supabase';

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

  mockGetRecordingStatus.mockResolvedValue({
    status: 'processing',
    error: null,
  });

  // Mock supabase queries to return empty by default
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
  };

  vi.mocked(supabase.from).mockReturnValue(mockChain as never);
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Tests
// ============================================================================

describe('useTranscriptionRecovery', () => {
  // ------------------------------------------------------------------
  // Initial state
  // ------------------------------------------------------------------
  describe('initial state', () => {
    it('should start with no processing transcriptions', async () => {
      const { result } = renderHook(() => useTranscriptionRecovery());

      // Let initial useEffect run
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.isAnyProcessing).toBe(false);
      expect(result.current.count).toBe(0);
      expect(result.current.processingTranscriptions.size).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // addTranscription
  // ------------------------------------------------------------------
  describe('addTranscription', () => {
    it('should add transcription to tracking and start polling', async () => {
      const { result } = renderHook(() => useTranscriptionRecovery());

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1', new Date().toISOString());
      });

      expect(result.current.count).toBe(1);
      expect(result.current.isAnyProcessing).toBe(true);
      expect(result.current.processingTranscriptions.get('rec-1')).toEqual(
        expect.objectContaining({
          recordingId: 'rec-1',
          sessionId: 'session-1',
          status: 'processing',
        })
      );
    });
  });

  // ------------------------------------------------------------------
  // removeTranscription
  // ------------------------------------------------------------------
  describe('removeTranscription', () => {
    it('should remove transcription from tracking', async () => {
      const { result } = renderHook(() => useTranscriptionRecovery());

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1');
      });

      expect(result.current.count).toBe(1);

      act(() => {
        result.current.removeTranscription('rec-1');
      });

      expect(result.current.count).toBe(0);
      expect(result.current.isAnyProcessing).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Polling: completed
  // ------------------------------------------------------------------
  describe('polling - transcription completed', () => {
    it('should remove transcription and show toast on completion', async () => {
      mockGetRecordingStatus.mockResolvedValue({
        status: 'completed',
        error: null,
      });

      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useTranscriptionRecovery({ onComplete })
      );

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1', new Date().toISOString());
      });

      // Wait for polling to complete
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.count).toBe(0);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Транскрипция завершена',
        })
      );
      expect(onComplete).toHaveBeenCalledWith('rec-1', 'session-1');
      expect(mockInvalidateQueries).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Polling: failed
  // ------------------------------------------------------------------
  describe('polling - transcription failed', () => {
    it('should show error toast on failure', async () => {
      mockGetRecordingStatus.mockResolvedValue({
        status: 'failed',
        error: 'Transcription service error',
      });

      const onError = vi.fn();
      const { result } = renderHook(() =>
        useTranscriptionRecovery({ onError })
      );

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1', new Date().toISOString());
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ошибка транскрипции',
          variant: 'destructive',
        })
      );
      expect(onError).toHaveBeenCalledWith('rec-1', 'Transcription service error');
    });

    it('should remove failed transcription from UI after 5 seconds', async () => {
      mockGetRecordingStatus.mockResolvedValue({
        status: 'failed',
        error: 'error',
      });

      const { result } = renderHook(() => useTranscriptionRecovery());

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1');
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Still visible (shows 'failed' status briefly)
      expect(result.current.processingTranscriptions.has('rec-1')).toBe(true);

      // After 5 seconds, should be removed
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });

      expect(result.current.processingTranscriptions.has('rec-1')).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Adaptive polling interval
  // ------------------------------------------------------------------
  describe('adaptive polling interval', () => {
    it('should poll quickly initially (5s), then slower (30s)', async () => {
      let callCount = 0;
      mockGetRecordingStatus.mockImplementation(async () => {
        callCount++;
        return { status: 'processing', error: null };
      });

      const { result } = renderHook(() => useTranscriptionRecovery());

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1', new Date().toISOString());
      });

      // First call is immediate
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(callCount).toBe(1);

      // Next calls should happen every 5 seconds (first 6 attempts)
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
      }
      expect(callCount).toBe(6); // 1 initial + 5 at 5s intervals

      // After 6 attempts, interval should increase to 30s
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      // Should NOT have polled yet (need 30s not 5s)
      expect(callCount).toBe(6);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(25000); // total 30s
      });
      expect(callCount).toBe(7);
    });
  });

  // ------------------------------------------------------------------
  // Activity updates
  // ------------------------------------------------------------------
  describe('activity updates', () => {
    it('should call updateActivity on each poll', async () => {
      mockGetRecordingStatus.mockResolvedValue({
        status: 'processing',
        error: null,
      });

      const { result } = renderHook(() => useTranscriptionRecovery());

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1');
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockUpdateActivity).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  describe('cleanup on unmount', () => {
    it('should stop all polling on unmount', async () => {
      mockGetRecordingStatus.mockResolvedValue({
        status: 'processing',
        error: null,
      });

      const { result, unmount } = renderHook(() => useTranscriptionRecovery());

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1');
        result.current.addTranscription('rec-2', 'session-2');
      });

      const callCountBefore = mockGetRecordingStatus.mock.calls.length;

      unmount();

      // Advance timers — no more polling calls should happen
      await act(async () => {
        vi.advanceTimersByTime(60000);
      });

      // At most 1-2 more calls might slip through from the initial poll, but no new polls
      // The key test is that the hook doesn't crash on unmount
      expect(mockGetRecordingStatus.mock.calls.length).toBeLessThanOrEqual(callCountBefore + 2);
    });
  });

  // ------------------------------------------------------------------
  // Duplicate polling prevention
  // ------------------------------------------------------------------
  describe('duplicate polling prevention', () => {
    it('should not start duplicate polling for same recording', async () => {
      const { result } = renderHook(() => useTranscriptionRecovery());

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1');
        result.current.addTranscription('rec-1', 'session-1'); // duplicate
      });

      // Should only have one entry
      expect(result.current.count).toBe(1);
    });
  });

  // ------------------------------------------------------------------
  // Max attempts
  // ------------------------------------------------------------------
  describe('max attempts', () => {
    it('should stop polling after max attempts and show toast', async () => {
      let callCount = 0;
      mockGetRecordingStatus.mockImplementation(async () => {
        callCount++;
        return { status: 'processing', error: null };
      });

      // Mock supabase update for marking as failed
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: mockUpdate,
      } as never);

      const onError = vi.fn();
      const { result } = renderHook(() =>
        useTranscriptionRecovery({ onError })
      );

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        result.current.addTranscription('rec-1', 'session-1', new Date().toISOString());
      });

      // Advance through all 720 max attempts
      // First 6 at 5s = 30s, next 20 at 30s = 600s, rest at 60s
      // Rather than simulating all, just fast-forward a lot
      for (let i = 0; i < 730; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60000);
        });
      }

      // Stuck detection fires at 6 hours (before max attempts at 12h),
      // so the error message is about stuck transcription, not timeout
      expect(onError).toHaveBeenCalledWith('rec-1', expect.stringContaining('Транскрипция зависла'));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ошибка транскрипции',
          variant: 'destructive',
        })
      );
    });
  });
});
