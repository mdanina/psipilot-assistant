import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BackgroundUploadProvider, useBackgroundUpload } from '../BackgroundUploadContext';
import { ReactNode } from 'react';

// ================================================================
// Mock dependencies
// ================================================================

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockRefetchQueries = vi.fn().mockResolvedValue(undefined);
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    refetchQueries: mockRefetchQueries,
  }),
}));

const mockCreateSession = vi.fn();
vi.mock('@/lib/supabase-sessions', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}));

const mockCreateRecording = vi.fn();
const mockUploadAudioFile = vi.fn();
const mockUpdateRecording = vi.fn();
const mockStartTranscription = vi.fn();
const mockValidateFileSize = vi.fn();
vi.mock('@/lib/supabase-recordings', () => ({
  createRecording: (...args: unknown[]) => mockCreateRecording(...args),
  uploadAudioFile: (...args: unknown[]) => mockUploadAudioFile(...args),
  updateRecording: (...args: unknown[]) => mockUpdateRecording(...args),
  startTranscription: (...args: unknown[]) => mockStartTranscription(...args),
  validateFileSize: (...args: unknown[]) => mockValidateFileSize(...args),
  MAX_FILE_SIZE_MB: 500,
}));

const mockSaveRecordingLocally = vi.fn();
const mockMarkRecordingUploaded = vi.fn();
const mockMarkRecordingUploadFailed = vi.fn();
const mockDeleteLocalRecording = vi.fn();
vi.mock('@/lib/local-recording-storage', () => ({
  saveRecordingLocally: (...args: unknown[]) => mockSaveRecordingLocally(...args),
  markRecordingUploaded: (...args: unknown[]) => mockMarkRecordingUploaded(...args),
  markRecordingUploadFailed: (...args: unknown[]) => mockMarkRecordingUploadFailed(...args),
  deleteLocalRecording: (...args: unknown[]) => mockDeleteLocalRecording(...args),
}));

// Mock supabase — used by orphan cleanup via dynamic import
const mockSupabaseDeleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSupabaseDeleteFn = vi.fn().mockReturnValue({ eq: mockSupabaseDeleteEq });
const mockSupabaseFromFn = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: mockSupabaseDeleteFn,
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (...args: unknown[]) => mockSupabaseFromFn(...args),
  },
  isSupabaseConfigured: true,
}));

// Mock AuthContext
const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockProfile = { clinic_id: 'clinic-123' };
const mockUpdateActivity = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    updateActivity: mockUpdateActivity,
  }),
}));

// ================================================================

const wrapper = ({ children }: { children: ReactNode }) => (
  <BackgroundUploadProvider>{children}</BackgroundUploadProvider>
);

describe('BackgroundUploadContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-set mock implementations after clearAllMocks
    mockSupabaseDeleteEq.mockResolvedValue({ data: null, error: null });
    mockSupabaseDeleteFn.mockReturnValue({ eq: mockSupabaseDeleteEq });
    mockSupabaseFromFn.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: mockSupabaseDeleteFn,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    // Reset validateFileSize to no-op (clearAllMocks doesn't reset implementations)
    mockValidateFileSize.mockImplementation(() => {});

    // Default happy path mocks
    mockSaveRecordingLocally.mockResolvedValue('local-rec-123');
    mockCreateSession.mockResolvedValue({ id: 'session-new' });
    mockCreateRecording.mockResolvedValue({
      id: 'rec-db-123',
      file_name: 'recording.webm',
    });
    mockUploadAudioFile.mockResolvedValue('recordings/rec-db-123/recording.webm');
    mockUpdateRecording.mockResolvedValue({});
    mockMarkRecordingUploaded.mockResolvedValue(undefined);
    mockMarkRecordingUploadFailed.mockResolvedValue(undefined);
    mockStartTranscription.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useBackgroundUpload hook', () => {
    it('should throw when used outside BackgroundUploadProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useBackgroundUpload());
      }).toThrow('useBackgroundUpload must be used within BackgroundUploadProvider');
      consoleSpy.mockRestore();
    });

    it('should provide context when used inside provider', () => {
      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      expect(result.current.queueUpload).toBeInstanceOf(Function);
      expect(result.current.retryUpload).toBeInstanceOf(Function);
      expect(result.current.cancelUpload).toBeInstanceOf(Function);
      expect(result.current.dismissFailedUpload).toBeInstanceOf(Function);
      expect(result.current.hasActiveUploads).toBe(false);
      expect(result.current.hasFailedUploads).toBe(false);
    });
  });

  describe('queueUpload - successful flow', () => {
    it('should complete full upload pipeline', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio-data'], { type: 'audio/webm' });
      let uploadId: string;

      await act(async () => {
        uploadId = await result.current.queueUpload({
          blob,
          duration: 120,
          sessionId: 'existing-session',
        });
      });

      // Wait for async processing (setTimeout(fn, 0) fires with real timers)
      await waitFor(() => {
        const upload = result.current.pendingUploads.get(uploadId!);
        expect(upload?.status === 'completed' || !upload).toBe(true);
      }, { timeout: 5000 });

      expect(mockCreateRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'existing-session',
          userId: 'user-123',
        })
      );
      expect(mockUploadAudioFile).toHaveBeenCalled();
      expect(mockStartTranscription).toHaveBeenCalledWith('rec-db-123', expect.any(String));

      consoleSpy.mockRestore();
    });
  });

  describe('queueUpload - file size validation', () => {
    it('should reject oversized files before queuing', async () => {
      mockValidateFileSize.mockImplementation(() => {
        throw new Error('File too large');
      });

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const bigBlob = new Blob(['x'], { type: 'audio/webm' });
      Object.defineProperty(bigBlob, 'size', { value: 600 * 1024 * 1024 });

      let error: Error | undefined;
      try {
        await act(async () => {
          await result.current.queueUpload({ blob: bigBlob, duration: 60 });
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Файл слишком большой' })
      );
      expect(mockCreateRecording).not.toHaveBeenCalled();
    });
  });

  describe('orphan recording cleanup (DATA-2)', () => {
    it('should mark upload as failed when uploadAudioFile fails after createRecording', async () => {
      // Step 3 (createRecording) succeeds, step 4 (uploadAudioFile) fails
      // The catch block should attempt orphan cleanup and then mark as failed
      mockUploadAudioFile.mockRejectedValue(new Error('Upload network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio-data'], { type: 'audio/webm' });
      let uploadId: string;

      await act(async () => {
        uploadId = await result.current.queueUpload({
          blob,
          duration: 60,
          sessionId: 'session-1',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingUploads.get(uploadId!)?.status).toBe('failed');
      }, { timeout: 5000 });

      // Verify createRecording was called (step 3 succeeded) before uploadAudioFile failed
      expect(mockCreateRecording).toHaveBeenCalled();
      expect(mockUploadAudioFile).toHaveBeenCalled();

      // Upload should be marked failed with proper error
      const upload = result.current.pendingUploads.get(uploadId!);
      expect(upload?.status).toBe('failed');
      expect(upload?.error).toBe('Upload network error');

      // Error toast shown
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );

      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should mark upload as failed when createRecording itself fails', async () => {
      // Step 3 (createRecording) fails — no orphaned recording to clean up
      mockCreateRecording.mockRejectedValue(new Error('RLS violation'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio-data'], { type: 'audio/webm' });
      let uploadId: string;

      await act(async () => {
        uploadId = await result.current.queueUpload({
          blob,
          duration: 60,
          sessionId: 'session-1',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingUploads.get(uploadId!)?.status).toBe('failed');
      }, { timeout: 5000 });

      // createRecording was called but failed
      expect(mockCreateRecording).toHaveBeenCalled();
      // uploadAudioFile should NOT have been called
      expect(mockUploadAudioFile).not.toHaveBeenCalled();

      const upload = result.current.pendingUploads.get(uploadId!);
      expect(upload?.status).toBe('failed');
      expect(upload?.error).toBe('RLS violation');

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should mark local recording as failed on upload error', async () => {
      mockUploadAudioFile.mockRejectedValue(new Error('Upload failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio-data'], { type: 'audio/webm' });
      let uploadId: string;

      await act(async () => {
        uploadId = await result.current.queueUpload({
          blob,
          duration: 60,
          sessionId: 'session-1',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingUploads.get(uploadId!)?.status).toBe('failed');
      }, { timeout: 5000 });

      // Local recording should be marked as failed
      expect(mockMarkRecordingUploadFailed).toHaveBeenCalledWith(
        'local-rec-123',
        'Upload failed'
      );

      // Error toast should still be shown
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );

      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('session creation flow', () => {
    it('should create session when no sessionId provided but patientId exists', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio'], { type: 'audio/webm' });

      await act(async () => {
        await result.current.queueUpload({
          blob,
          duration: 60,
          patientId: 'patient-456',
        });
      });

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      }, { timeout: 5000 });

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: 'patient-456',
          clinicId: 'clinic-123',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('failed upload management', () => {
    it('should mark upload as failed with error message', async () => {
      mockCreateRecording.mockRejectedValue(new Error('Ошибка создания записи'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio'], { type: 'audio/webm' });
      let uploadId: string;

      await act(async () => {
        uploadId = await result.current.queueUpload({
          blob,
          duration: 60,
          sessionId: 'session-1',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingUploads.get(uploadId!)?.status).toBe('failed');
      }, { timeout: 5000 });

      expect(result.current.hasFailedUploads).toBe(true);
      expect(result.current.failedUploadsCount).toBe(1);

      const upload = result.current.pendingUploads.get(uploadId!);
      expect(upload?.error).toBe('Ошибка создания записи');

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should dismiss failed upload', async () => {
      mockCreateRecording.mockRejectedValue(new Error('Error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio'], { type: 'audio/webm' });
      let uploadId: string;

      await act(async () => {
        uploadId = await result.current.queueUpload({
          blob,
          duration: 60,
          sessionId: 'session-1',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingUploads.get(uploadId!)?.status).toBe('failed');
      }, { timeout: 5000 });

      act(() => {
        result.current.dismissFailedUpload(uploadId!);
      });

      expect(result.current.pendingUploads.has(uploadId!)).toBe(false);
      expect(result.current.hasFailedUploads).toBe(false);

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('transcription error handling', () => {
    it('should mark upload as completed even when transcription start fails', async () => {
      mockStartTranscription.mockRejectedValue(new Error('Transcription API down'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useBackgroundUpload(), { wrapper });

      const blob = new Blob(['audio'], { type: 'audio/webm' });
      let uploadId: string;

      await act(async () => {
        uploadId = await result.current.queueUpload({
          blob,
          duration: 60,
          sessionId: 'session-1',
        });
      });

      await waitFor(() => {
        const upload = result.current.pendingUploads.get(uploadId!);
        expect(upload?.status === 'completed' || !upload).toBe(true);
      }, { timeout: 5000 });

      // Upload should be completed (not failed), since the file was uploaded successfully
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Запись загружена' })
      );

      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });
});
