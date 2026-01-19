import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCalendarFeedToken, revokeCalendarFeedToken } from '../calendar-feed';
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

describe('calendar-feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

  describe('generateCalendarFeedToken', () => {
    it('should generate a calendar feed token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          token: 'calendar-token-123',
          feedUrl: 'https://api.example.com/calendar/feed/calendar-token-123',
        }),
      });

      const result = await generateCalendarFeedToken();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/calendar/generate-token'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result.token).toBe('calendar-token-123');
      expect(result.feedUrl).toBe('https://api.example.com/calendar/feed/calendar-token-123');
    });

    it('should throw error when not authenticated', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(generateCalendarFeedToken()).rejects.toThrow('Необходима авторизация');
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      await expect(generateCalendarFeedToken()).rejects.toThrow('Server error');
    });

    it('should throw error when response is missing token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          feedUrl: 'https://api.example.com/feed',
          // token is missing
        }),
      });

      await expect(generateCalendarFeedToken()).rejects.toThrow('Сервер не вернул данные токена');
    });

    it('should throw error when response is missing feedUrl', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          token: 'token-123',
          // feedUrl is missing
        }),
      });

      await expect(generateCalendarFeedToken()).rejects.toThrow('Сервер не вернул данные токена');
    });

    it('should throw error when success is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Token generation failed',
        }),
      });

      await expect(generateCalendarFeedToken()).rejects.toThrow('Сервер не вернул данные токена');
    });

    it('should handle default error message when API returns empty error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(generateCalendarFeedToken()).rejects.toThrow('Ошибка генерации токена');
    });

    it('should handle JSON parse error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(generateCalendarFeedToken()).rejects.toThrow('Ошибка генерации токена');
    });
  });

  describe('revokeCalendarFeedToken', () => {
    it('should revoke calendar feed token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await expect(revokeCalendarFeedToken()).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/calendar/revoke-token'),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should throw error when not authenticated', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(revokeCalendarFeedToken()).rejects.toThrow('Необходима авторизация');
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Token not found' }),
      });

      await expect(revokeCalendarFeedToken()).rejects.toThrow('Token not found');
    });

    it('should handle default error message when API returns empty error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(revokeCalendarFeedToken()).rejects.toThrow('Ошибка отзыва токена');
    });

    it('should handle JSON parse error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(revokeCalendarFeedToken()).rejects.toThrow('Ошибка отзыва токена');
    });
  });

  describe('authentication headers', () => {
    it('should include correct authorization header', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'custom-token-abc',
            refresh_token: 'test-refresh',
            expires_at: Date.now() + 3600,
            expires_in: 3600,
            token_type: 'bearer',
            user: {
              id: 'user-id',
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          token: 'token',
          feedUrl: 'url',
        }),
      });

      await generateCalendarFeedToken();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer custom-token-abc',
          }),
        })
      );
    });
  });
});
