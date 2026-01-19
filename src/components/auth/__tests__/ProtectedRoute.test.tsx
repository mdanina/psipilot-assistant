import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import * as AuthContext from '@/contexts/AuthContext';

// Mock the AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(AuthContext.useAuth);

// Helper to render component with router
const renderWithRouter = (
  ui: React.ReactElement,
  { initialEntries = ['/protected'] } = {}
) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/onboarding" element={<div>Onboarding Page</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
        <Route path="/protected" element={ui} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should show loading spinner when isLoading is true', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        profile: null,
        user: null,
        session: null,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: null,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Should show loading state (spinner)
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('authentication', () => {
    it('should redirect to login when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        profile: null,
        user: null,
        session: null,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: null,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Login Page')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should render children when authenticated with profile', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'therapist',
          clinic_id: 'clinic-123',
          clinic: null,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          onboarding_completed: true,
          specialization: 'psychologist',
        },
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('onboarding', () => {
    it('should redirect to onboarding when profile has no clinic_id', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'therapist',
          clinic_id: null,
          clinic: null,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          onboarding_completed: false,
          specialization: null,
        },
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Onboarding Page')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should skip onboarding check when skipOnboardingCheck is true', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'therapist',
          clinic_id: null,
          clinic: null,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          onboarding_completed: false,
          specialization: null,
        },
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute skipOnboardingCheck>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('role-based access', () => {
    it('should allow access when user has required role', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'admin',
          clinic_id: 'clinic-123',
          clinic: null,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          onboarding_completed: true,
          specialization: null,
        },
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute requiredRole="admin">
          <div>Admin Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Admin Content')).toBeInTheDocument();
    });

    it('should redirect to unauthorized when user does not have required role', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'therapist',
          clinic_id: 'clinic-123',
          clinic: null,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          onboarding_completed: true,
          specialization: 'psychologist',
        },
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute requiredRole="admin">
          <div>Admin Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    });

    it('should allow access when user has one of multiple required roles', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'supervisor',
          clinic_id: 'clinic-123',
          clinic: null,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          onboarding_completed: true,
          specialization: null,
        },
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute requiredRole={['admin', 'supervisor']}>
          <div>Privileged Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Privileged Content')).toBeInTheDocument();
    });

    it('should redirect when user has none of the required roles', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'therapist',
          clinic_id: 'clinic-123',
          clinic: null,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          onboarding_completed: true,
          specialization: 'psychologist',
        },
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute requiredRole={['admin', 'supervisor']}>
          <div>Privileged Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });
  });

  describe('profile loading', () => {
    it('should show loading when authenticated but profile is null and not skipping onboarding', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        profile: null,
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: {} as any,
        mfaEnabled: false,
        mfaVerified: false,
        lastActivity: Date.now(),
        sessionExpiresAt: Date.now() + 900000,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        enableMFA: vi.fn(),
        verifyMFA: vi.fn(),
        disableMFA: vi.fn(),
        updateActivity: vi.fn(),
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      // Should show loading, not protected content
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });
});
