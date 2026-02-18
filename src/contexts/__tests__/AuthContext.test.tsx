import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { ProfileWithClinic } from '@/types';
import { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock modules
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      mfa: {
        enroll: vi.fn(),
        verify: vi.fn(),
        listFactors: vi.fn(),
        unenroll: vi.fn(),
        challenge: vi.fn(),
      },
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
  isSupabaseConfigured: true,
}));

vi.mock('@/lib/local-recording-storage', () => ({
  clearAllLocalRecordings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/recording-encryption', () => ({
  clearSessionKey: vi.fn(),
}));

const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: { full_name: 'Test User' },
};

const mockSession = {
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser,
};

const mockProfile = {
  id: 'test-user-id',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'therapist',
  clinic_id: 'clinic-123',
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  onboarding_completed: true,
  specialization: 'psychologist',
  mfa_enabled: false,
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>
    <AuthProvider>{children}</AuthProvider>
  </BrowserRouter>
);

describe('AuthContext', () => {
  let authStateCallback: ((event: string, session: Session | null) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;

    // Default mock setup
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authStateCallback = callback;
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    });

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
      order: vi.fn().mockReturnThis(),
    } as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });

    it('should provide auth context when used inside AuthProvider', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
        expect(result.current.signIn).toBeInstanceOf(Function);
        expect(result.current.signUp).toBeInstanceOf(Function);
        expect(result.current.signOut).toBeInstanceOf(Function);
      });
    });
  });

  describe('initial state', () => {
    it('should start with loading state', async () => {
      let resolveSession: (value: unknown) => void;
      const sessionPromise = new Promise((resolve) => {
        resolveSession = resolve;
      });
      vi.mocked(supabase.auth.getSession).mockReturnValue(sessionPromise as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();

      // Resolve the promise
      resolveSession!({ data: { session: null }, error: null });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should be unauthenticated when no session exists', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
    });

    it('should be authenticated when session exists', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
    });
  });

  describe('signIn', () => {
    it('should sign in successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      } as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let signInResult: { error: Error | null };
      await act(async () => {
        signInResult = await result.current.signIn('test@example.com', 'password123');
      });

      expect(signInResult.error).toBeNull();
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should return error on invalid credentials', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', status: 400 } as never,
      } as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let signInResult: { error: Error | null };
      await act(async () => {
        signInResult = await result.current.signIn('wrong@example.com', 'wrongpassword');
      });

      expect(signInResult.error).toBeDefined();
      expect(signInResult.error.message).toBe('Invalid login credentials');
    });
  });

  describe('signUp', () => {
    it('should sign up successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      } as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let signUpResult: { error: Error | null };
      await act(async () => {
        signUpResult = await result.current.signUp('new@example.com', 'password123', 'New User');
      });

      expect(signUpResult.error).toBeNull();
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
        options: {
          data: { full_name: 'New User' },
        },
      });
    });

    it('should return error when email already exists', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered', status: 400 } as never,
      } as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let signUpResult: { error: Error | null };
      await act(async () => {
        signUpResult = await result.current.signUp('existing@example.com', 'password123', 'Test');
      });

      expect(signUpResult.error).toBeDefined();
    });
  });

  describe('signOut', () => {
    it('should sign out successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should send reset password email', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
        data: {},
        error: null,
      } as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let resetResult: { error: Error | null };
      await act(async () => {
        resetResult = await result.current.resetPassword('test@example.com');
      });

      expect(resetResult.error).toBeNull();
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(Object)
      );
    });
  });

  describe('updatePassword', () => {
    it('should update password successfully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      vi.mocked(supabase.auth.updateUser).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      } as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updateResult: { error: Error | null };
      await act(async () => {
        updateResult = await result.current.updatePassword('newPassword123');
      });

      expect(updateResult.error).toBeNull();
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newPassword123' });
    });
  });

  describe('auth state changes', () => {
    it('should handle SIGNED_IN event', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);

      // Trigger SIGNED_IN event
      act(() => {
        if (authStateCallback) {
          authStateCallback('SIGNED_IN', mockSession);
        }
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });
    });

    it('should handle SIGNED_OUT event', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Trigger SIGNED_OUT event
      act(() => {
        if (authStateCallback) {
          authStateCallback('SIGNED_OUT', null);
        }
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
      });
    });

    it('should handle TOKEN_REFRESHED event', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      const newSession = {
        ...mockSession,
        access_token: 'new-token',
      };

      // Trigger TOKEN_REFRESHED event
      act(() => {
        if (authStateCallback) {
          authStateCallback('TOKEN_REFRESHED', newSession);
        }
      });

      // Session should be updated
      await waitFor(() => {
        expect(result.current.session?.access_token).toBe('new-token');
      });
    });
  });

  describe('updateActivity', () => {
    it('should update lastActivity timestamp', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialActivity = result.current.lastActivity;

      // Wait a bit and update activity
      await new Promise((resolve) => setTimeout(resolve, 10));

      act(() => {
        result.current.updateActivity();
      });

      expect(result.current.lastActivity).toBeGreaterThanOrEqual(initialActivity);
    });
  });

  describe('profile loading', () => {
    it('should load profile after authentication', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).not.toBeNull();
      });

      expect(result.current.profile?.email).toBe('test@example.com');
      expect(result.current.profile?.full_name).toBe('Test User');
    });

    it('should handle profile fetch error gracefully', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Profile not found' },
        }),
      } as never);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should still be authenticated even if profile fails
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('refreshProfile', () => {
    it('should refresh profile data', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).not.toBeNull();
      });

      // Update the mock to return updated profile
      const updatedProfile = { ...mockProfile, full_name: 'Updated Name' };
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedProfile, error: null }),
      } as never);

      let refreshedProfile: ProfileWithClinic | null;
      await act(async () => {
        refreshedProfile = await result.current.refreshProfile();
      });

      expect(refreshedProfile?.full_name).toBe('Updated Name');
    });
  });
});
