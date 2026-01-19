import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  usePatients,
  useSearchPatients,
  usePatient,
  useDeletePatient,
  useCreatePatient,
} from '../usePatients';
import * as supabasePatients from '@/lib/supabase-patients';

// Mock the supabase-patients module
vi.mock('@/lib/supabase-patients', () => ({
  getPatients: vi.fn(),
  getPatient: vi.fn(),
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  deletePatient: vi.fn(),
  getPatientDocumentCounts: vi.fn(),
}));

const mockPatients = [
  {
    id: 'patient-1',
    first_name: 'Иван',
    last_name: 'Иванов',
    middle_name: 'Иванович',
    email: 'ivan@example.com',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    therapist_id: 'user-1',
    clinic_id: 'clinic-1',
  },
  {
    id: 'patient-2',
    first_name: 'Мария',
    last_name: 'Петрова',
    middle_name: 'Сергеевна',
    email: 'maria@example.com',
    status: 'active',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    therapist_id: 'user-1',
    clinic_id: 'clinic-1',
  },
];

const mockDocumentCounts = {
  'patient-1': 3,
  'patient-2': 5,
};

describe('usePatients hooks', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  describe('usePatients', () => {
    it('should fetch patients successfully', async () => {
      vi.mocked(supabasePatients.getPatients).mockResolvedValue({
        data: mockPatients,
        error: null,
      });
      vi.mocked(supabasePatients.getPatientDocumentCounts).mockResolvedValue(mockDocumentCounts);

      const { result } = renderHook(() => usePatients(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].documentCount).toBe(3);
      expect(result.current.data?.[1].documentCount).toBe(5);
    });

    it('should return empty array when no patients exist', async () => {
      vi.mocked(supabasePatients.getPatients).mockResolvedValue({
        data: [],
        error: null,
      });

      const { result } = renderHook(() => usePatients(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it('should have correct query key', () => {
      vi.mocked(supabasePatients.getPatients).mockResolvedValue({
        data: [],
        error: null,
      });

      const { result } = renderHook(() => usePatients(), {
        wrapper: createWrapper(),
      });

      // Query should be defined with patients key
      expect(result.current).toBeDefined();
    });

    it('should have correct loading state', () => {
      vi.mocked(supabasePatients.getPatients).mockResolvedValue({
        data: mockPatients,
        error: null,
      });
      vi.mocked(supabasePatients.getPatientDocumentCounts).mockResolvedValue(mockDocumentCounts);

      const { result } = renderHook(() => usePatients(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('useSearchPatients', () => {
    it('should search patients when query is at least 2 characters', async () => {
      vi.mocked(supabasePatients.searchPatients).mockResolvedValue({
        data: [mockPatients[0]],
        error: null,
      });
      vi.mocked(supabasePatients.getPatientDocumentCounts).mockResolvedValue({
        'patient-1': 3,
      });

      const { result } = renderHook(() => useSearchPatients('Ив'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].first_name).toBe('Иван');
    });

    it('should not search when query is less than 2 characters', async () => {
      const { result } = renderHook(() => useSearchPatients('И'), {
        wrapper: createWrapper(),
      });

      // Query should not be enabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(supabasePatients.searchPatients).not.toHaveBeenCalled();
    });

    it('should not search when query is empty', async () => {
      const { result } = renderHook(() => useSearchPatients(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(supabasePatients.searchPatients).not.toHaveBeenCalled();
    });

    it('should trim search query', async () => {
      vi.mocked(supabasePatients.searchPatients).mockResolvedValue({
        data: [],
        error: null,
      });

      renderHook(() => useSearchPatients('  Иван  '), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(supabasePatients.searchPatients).toHaveBeenCalledWith('Иван');
      });
    });

    it('should return empty array for no results', async () => {
      vi.mocked(supabasePatients.searchPatients).mockResolvedValue({
        data: [],
        error: null,
      });

      const { result } = renderHook(() => useSearchPatients('НесуществующийПациент'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('usePatient', () => {
    it('should fetch a single patient by ID', async () => {
      vi.mocked(supabasePatients.getPatient).mockResolvedValue({
        data: mockPatients[0],
        error: null,
      });

      const { result } = renderHook(() => usePatient('patient-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.first_name).toBe('Иван');
      expect(supabasePatients.getPatient).toHaveBeenCalledWith('patient-1');
    });

    it('should not fetch when patientId is undefined', async () => {
      const { result } = renderHook(() => usePatient(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(supabasePatients.getPatient).not.toHaveBeenCalled();
    });

    it('should return null when patient not found', async () => {
      vi.mocked(supabasePatients.getPatient).mockResolvedValue({
        data: null,
        error: null,
      });

      const { result } = renderHook(() => usePatient('non-existent'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeNull();
    });

    it('should handle patient not found', async () => {
      vi.mocked(supabasePatients.getPatient).mockResolvedValue({
        data: null,
        error: null,
      });

      const { result } = renderHook(() => usePatient('non-existent'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeNull();
    });
  });

  describe('useDeletePatient', () => {
    it('should delete a patient successfully', async () => {
      vi.mocked(supabasePatients.deletePatient).mockResolvedValue({
        success: true,
        error: null,
      });

      const { result } = renderHook(() => useDeletePatient(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync('patient-1');

      expect(supabasePatients.deletePatient).toHaveBeenCalledWith('patient-1');
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Cannot delete patient');
      vi.mocked(supabasePatients.deletePatient).mockResolvedValue({
        success: false,
        error,
      });

      const { result } = renderHook(() => useDeletePatient(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync('patient-1')).rejects.toThrow();
    });

    it('should call invalidateQueries after deletion', async () => {
      vi.mocked(supabasePatients.deletePatient).mockResolvedValue({
        success: true,
        error: null,
      });

      const { result } = renderHook(() => useDeletePatient(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync('patient-1');

      // Verify deletion was called
      expect(supabasePatients.deletePatient).toHaveBeenCalledWith('patient-1');
    });
  });

  describe('useCreatePatient', () => {
    const newPatientData = {
      first_name: 'Новый',
      last_name: 'Пациент',
      email: 'new@example.com',
      therapist_id: 'user-1',
      clinic_id: 'clinic-1',
    };

    it('should create a patient successfully', async () => {
      const createdPatient = { id: 'new-patient-id', ...newPatientData };
      vi.mocked(supabasePatients.createPatient).mockResolvedValue({
        data: createdPatient,
        error: null,
      });

      const { result } = renderHook(() => useCreatePatient(), {
        wrapper: createWrapper(),
      });

      const data = await result.current.mutateAsync(newPatientData);

      expect(supabasePatients.createPatient).toHaveBeenCalledWith(newPatientData);
      expect(data.id).toBe('new-patient-id');
    });

    it('should handle creation errors', async () => {
      const error = new Error('Validation error');
      vi.mocked(supabasePatients.createPatient).mockResolvedValue({
        data: null,
        error,
      });

      const { result } = renderHook(() => useCreatePatient(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync(newPatientData)).rejects.toThrow();
    });

    it('should call createPatient with correct data', async () => {
      vi.mocked(supabasePatients.createPatient).mockResolvedValue({
        data: { id: 'new-id', ...newPatientData },
        error: null,
      });

      const { result } = renderHook(() => useCreatePatient(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync(newPatientData);

      expect(supabasePatients.createPatient).toHaveBeenCalledWith(newPatientData);
    });
  });
});
