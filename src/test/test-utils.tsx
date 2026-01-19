import React, { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface AllProvidersProps {
  children: ReactNode;
}

function AllProviders({ children }: AllProvidersProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Helper to create mock functions with specific return values
export function createMockFn<T>(returnValue?: T) {
  return vi.fn().mockReturnValue(returnValue);
}

// Helper for async mock functions
export function createAsyncMockFn<T>(resolvedValue?: T) {
  return vi.fn().mockResolvedValue(resolvedValue);
}

// Helper to wait for async operations
export async function waitForAsync(ms = 0) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock user for auth tests
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {
    full_name: 'Test User',
  },
};

// Mock session for auth tests
export const mockSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_at: Date.now() + 3600000,
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser,
};

// Mock profile for auth tests
export const mockProfile = {
  id: 'test-user-id',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'therapist',
  clinic_id: 'test-clinic-id',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  onboarding_completed: true,
  specialization: 'Психолог',
  mfa_enabled: false,
};

// Mock patient data
export const mockPatient = {
  id: 'test-patient-id',
  first_name: 'Иван',
  last_name: 'Иванов',
  middle_name: 'Иванович',
  email: 'patient@example.com',
  phone: '+7 999 123 45 67',
  birth_date: '1990-01-15',
  gender: 'male',
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  therapist_id: 'test-user-id',
  clinic_id: 'test-clinic-id',
};

// Mock session data
export const mockSessionData = {
  id: 'test-session-id',
  patient_id: 'test-patient-id',
  therapist_id: 'test-user-id',
  status: 'scheduled',
  scheduled_at: '2024-01-15T10:00:00Z',
  duration_minutes: 60,
  session_type: 'individual',
  notes: 'Тестовая сессия',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};
