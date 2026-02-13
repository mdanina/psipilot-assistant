import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  encryptPHI,
  decryptPHI,
  encryptPHIBatch,
  decryptPHIBatch,
  isEncryptionConfigured,
  isEncryptionConfiguredAsync,
  clearEncryptionStatusCache,
} from '../encryption';
import { supabase } from '../supabase';

// Mock supabase
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEncryptionStatusCache();

    // Default mock for getSession
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          expires_at: Date.now() + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            aud: 'authenticated',
            role: 'authenticated',
            created_at: '2024-01-01',
            app_metadata: {},
            user_metadata: {},
          },
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('encryptPHI', () => {
    it('should return empty string for empty input', async () => {
      const result = await encryptPHI('');
      expect(result).toBe('');
    });

    it('should call encryption API with correct data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { encrypted: 'encrypted-data' },
        }),
      });

      const result = await encryptPHI('sensitive-data');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/crypto/encrypt'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: 'sensitive-data' }),
        })
      );
      expect(result).toBe('encrypted-data');
    });

    it('should throw error on unauthorized response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(encryptPHI('data')).rejects.toThrow(/Unauthorized/);
    });

    it('should throw error on failed encryption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Encryption failed',
        }),
      });

      await expect(encryptPHI('data')).rejects.toThrow('Encryption failed');
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });

      await expect(encryptPHI('data')).rejects.toThrow();
    });

    it('should throw error when not authenticated', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(encryptPHI('data')).rejects.toThrow(/Not authenticated/);
    });
  });

  describe('decryptPHI', () => {
    it('should return empty string for empty input', async () => {
      const result = await decryptPHI('');
      expect(result).toBe('');
    });

    it('should call decryption API with correct data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { decrypted: 'decrypted-data' },
        }),
      });

      const result = await decryptPHI('encrypted-data');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/crypto/decrypt'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: 'encrypted-data' }),
        })
      );
      expect(result).toBe('decrypted-data');
    });

    it('should throw error on unauthorized response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Token expired' }),
      });

      await expect(decryptPHI('data')).rejects.toThrow(/Unauthorized/);
    });

    it('should throw error on failed decryption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Decryption failed',
        }),
      });

      await expect(decryptPHI('data')).rejects.toThrow('Decryption failed');
    });
  });

  describe('encryptPHIBatch', () => {
    it('should return empty array for empty input', async () => {
      const result = await encryptPHIBatch([]);
      expect(result).toEqual([]);
    });

    it('should return empty array for null-ish input', async () => {
      const result = await encryptPHIBatch(null as unknown as string[]);
      expect(result).toEqual([]);
    });

    it('should call batch encryption API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { encrypted: ['enc1', 'enc2', 'enc3'] },
        }),
      });

      const result = await encryptPHIBatch(['data1', 'data2', 'data3']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/crypto/encrypt'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: ['data1', 'data2', 'data3'] }),
        })
      );
      expect(result).toEqual(['enc1', 'enc2', 'enc3']);
    });

    it('should throw error on unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(encryptPHIBatch(['data'])).rejects.toThrow(/Unauthorized/);
    });
  });

  describe('decryptPHIBatch', () => {
    it('should return empty array for empty input', async () => {
      const result = await decryptPHIBatch([]);
      expect(result).toEqual([]);
    });

    it('should return empty array for null-ish input', async () => {
      const result = await decryptPHIBatch(null as unknown as string[]);
      expect(result).toEqual([]);
    });

    it('should call batch decryption API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { decrypted: ['dec1', 'dec2'] },
        }),
      });

      const result = await decryptPHIBatch(['enc1', 'enc2']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/crypto/decrypt'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: ['enc1', 'enc2'] }),
        })
      );
      expect(result).toEqual(['dec1', 'dec2']);
    });

    it('should throw error when backend returns non-array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { decrypted: 'not-an-array' },
        }),
      });

      await expect(decryptPHIBatch(['data'])).rejects.toThrow(/invalid/i);
    });
  });

  describe('isEncryptionConfigured', () => {
    it('should return true by default (cached value or assumed)', () => {
      // By default, assumes backend is configured
      expect(isEncryptionConfigured()).toBe(true);
    });
  });

  describe('isEncryptionConfiguredAsync', () => {
    it('should return true when backend reports configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { configured: true },
        }),
      });

      const result = await isEncryptionConfiguredAsync();
      expect(result).toBe(true);
    });

    it('should return false when backend reports not configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { configured: false },
        }),
      });

      const result = await isEncryptionConfiguredAsync();
      expect(result).toBe(false);
    });

    it('should return false on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await isEncryptionConfiguredAsync();
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await isEncryptionConfiguredAsync();
      expect(result).toBe(false);
    });

    it('should use cache within TTL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { configured: true },
        }),
      });

      // First call
      await isEncryptionConfiguredAsync();
      // Second call should use cache
      await isEncryptionConfiguredAsync();

      // Should only be called once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearEncryptionStatusCache', () => {
    it('should clear cache and allow fresh check', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { configured: true },
        }),
      });

      await isEncryptionConfiguredAsync();
      clearEncryptionStatusCache();
      await isEncryptionConfiguredAsync();

      // Should be called twice after clearing cache
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
