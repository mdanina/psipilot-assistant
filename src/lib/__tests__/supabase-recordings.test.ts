import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRecording,
  uploadAudioFile,
  updateRecording,
  startTranscription,
  getRecordingStatus,
  getSessionRecordings,
  deleteRecording,
  validateFileSize,
  MAX_FILE_SIZE_MB,
} from '../supabase-recordings';
import { supabase } from '../supabase';

// Verify pollTranscriptionStatus is NOT exported (dead code removal)
import * as recordingsModule from '../supabase-recordings';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock('../encryption', () => ({
  decryptPHI: vi.fn().mockImplementation((text: string) => Promise.resolve(`decrypted:${text}`)),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('supabase-recordings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ================================================================
  // Dead code removal regression test
  // ================================================================
  describe('pollTranscriptionStatus removal', () => {
    it('should NOT export pollTranscriptionStatus (dead code removed)', () => {
      expect('pollTranscriptionStatus' in recordingsModule).toBe(false);
    });

    it('should still export all active functions', () => {
      expect(recordingsModule.createRecording).toBeInstanceOf(Function);
      expect(recordingsModule.uploadAudioFile).toBeInstanceOf(Function);
      expect(recordingsModule.updateRecording).toBeInstanceOf(Function);
      expect(recordingsModule.startTranscription).toBeInstanceOf(Function);
      expect(recordingsModule.getRecordingStatus).toBeInstanceOf(Function);
      expect(recordingsModule.getSessionRecordings).toBeInstanceOf(Function);
      expect(recordingsModule.deleteRecording).toBeInstanceOf(Function);
      expect(recordingsModule.validateFileSize).toBeInstanceOf(Function);
      expect(recordingsModule.MAX_FILE_SIZE_MB).toBe(500);
    });
  });

  // ================================================================
  // validateFileSize
  // ================================================================
  describe('validateFileSize', () => {
    it('should accept file within size limit', () => {
      const blob = new Blob(['x'.repeat(100)], { type: 'audio/webm' });
      expect(() => validateFileSize(blob)).not.toThrow();
    });

    it('should reject file exceeding size limit', () => {
      // Create a blob that reports a large size via Object.defineProperty
      const blob = new Blob(['x'], { type: 'audio/webm' });
      Object.defineProperty(blob, 'size', { value: 600 * 1024 * 1024 }); // 600MB
      expect(() => validateFileSize(blob)).toThrow(/слишком большой/);
    });

    it('should accept file at exactly the limit', () => {
      const blob = new Blob(['x'], { type: 'audio/webm' });
      Object.defineProperty(blob, 'size', { value: MAX_FILE_SIZE_MB * 1024 * 1024 });
      expect(() => validateFileSize(blob)).not.toThrow();
    });

    it('should use custom max size when provided', () => {
      const blob = new Blob(['x'], { type: 'audio/webm' });
      Object.defineProperty(blob, 'size', { value: 11 * 1024 * 1024 }); // 11MB
      expect(() => validateFileSize(blob, 10)).toThrow(/слишком большой/);
    });
  });

  // ================================================================
  // createRecording
  // ================================================================
  describe('createRecording', () => {
    it('should create recording using auth UID', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            user: { id: 'auth-user-123' },
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: 0,
            expires_in: 0,
            token_type: 'bearer',
          },
        },
        error: null,
      } as any);

      const mockRecording = {
        id: 'rec-123',
        session_id: 'session-123',
        user_id: 'auth-user-123',
        file_path: 'recordings/temp/test.webm',
        file_name: 'test.webm',
        transcription_status: 'pending',
      };

      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRecording, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await createRecording({
        sessionId: 'session-123',
        userId: 'auth-user-123',
        fileName: 'test.webm',
      });

      expect(result.id).toBe('rec-123');
      expect(supabase.from).toHaveBeenCalledWith('recordings');
      // Verify it uses auth UID in the insert
      expect(mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'session-123',
          user_id: 'auth-user-123',
          transcription_status: 'pending',
        })
      );
    });

    it('should throw when not authenticated', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as any);

      await expect(
        createRecording({ sessionId: 's1', userId: 'u1' })
      ).rejects.toThrow(/No authenticated session/);
    });

    it('should use auth UID even when passed userId differs', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            user: { id: 'real-auth-uid' },
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: 0,
            expires_in: 0,
            token_type: 'bearer',
          },
        },
        error: null,
      } as any);

      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'rec-1', user_id: 'real-auth-uid' },
          error: null,
        }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await createRecording({
        sessionId: 's1',
        userId: 'wrong-uid', // Mismatched!
      });

      // Should use the auth UID, not the passed one
      expect(mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'real-auth-uid' })
      );
    });
  });

  // ================================================================
  // startTranscription
  // ================================================================
  describe('startTranscription', () => {
    it('should call transcription API with auth token', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'test-jwt-token',
            user: { id: 'u1' },
            refresh_token: '',
            expires_at: 0,
            expires_in: 0,
            token_type: 'bearer',
          },
        },
        error: null,
      } as any);

      mockFetch.mockResolvedValueOnce({ ok: true });

      await startTranscription('rec-123', 'http://localhost:3001');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/transcribe',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
          body: JSON.stringify({ recordingId: 'rec-123' }),
        })
      );
    });

    it('should throw when no session', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as any);

      await expect(
        startTranscription('rec-123', 'http://localhost:3001')
      ).rejects.toThrow(/No active session/);
    });

    it('should throw on API error', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'token',
            user: { id: 'u1' },
            refresh_token: '',
            expires_at: 0,
            expires_in: 0,
            token_type: 'bearer',
          },
        },
        error: null,
      } as any);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Internal Server Error',
      });

      await expect(
        startTranscription('rec-123', 'http://localhost:3001')
      ).rejects.toThrow(/Failed to start transcription/);
    });
  });

  // ================================================================
  // deleteRecording (soft delete)
  // ================================================================
  describe('deleteRecording', () => {
    it('should soft delete by setting deleted_at', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await deleteRecording('rec-123');

      expect(supabase.from).toHaveBeenCalledWith('recordings');
      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) })
      );
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'rec-123');
    });

    it('should throw on database error', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'RLS violation' },
        }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await expect(deleteRecording('rec-123')).rejects.toThrow(/Failed to delete/);
    });
  });

  // ================================================================
  // getSessionRecordings
  // ================================================================
  describe('getSessionRecordings', () => {
    it('should filter out deleted recordings', async () => {
      const mockRecordings = [
        { id: 'r1', transcription_encrypted: false, transcription_text: 'text1' },
        { id: 'r2', transcription_encrypted: false, transcription_text: 'text2' },
      ];

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRecordings, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await getSessionRecordings('session-123');

      expect(result).toHaveLength(2);
      // Verify .is('deleted_at', null) is called
      expect(mockChain.is).toHaveBeenCalledWith('deleted_at', null);
    });

    it('should decrypt encrypted transcriptions', async () => {
      const mockRecordings = [
        { id: 'r1', transcription_encrypted: true, transcription_text: 'encrypted-text' },
      ];

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRecordings, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await getSessionRecordings('session-123');

      expect(result[0].transcription_text).toBe('decrypted:encrypted-text');
    });

    it('should return empty array when no data', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await getSessionRecordings('session-123');

      expect(result).toEqual([]);
    });
  });
});
