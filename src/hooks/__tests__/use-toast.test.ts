import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast, toast, reducer } from '../use-toast';

describe('use-toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('reducer', () => {
    const initialState = { toasts: [] };

    it('should add a toast', () => {
      const newToast = {
        id: '1',
        title: 'Test Toast',
        description: 'Test description',
        open: true,
      };

      const result = reducer(initialState, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0]).toEqual(newToast);
    });

    it('should limit toasts to TOAST_LIMIT (1)', () => {
      const state = {
        toasts: [{ id: '1', title: 'First', open: true }],
      };

      const result = reducer(state, {
        type: 'ADD_TOAST',
        toast: { id: '2', title: 'Second', open: true },
      });

      // Should only have 1 toast (the newest one)
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('2');
    });

    it('should update a toast', () => {
      const state = {
        toasts: [{ id: '1', title: 'Original', open: true }],
      };

      const result = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('Updated');
      expect(result.toasts[0].open).toBe(true); // Should preserve other properties
    });

    it('should dismiss a specific toast', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true },
        ],
      };

      const result = reducer(state, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      });

      expect(result.toasts[0].open).toBe(false);
      expect(result.toasts[1].open).toBe(true);
    });

    it('should dismiss all toasts when no ID provided', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true },
        ],
      };

      const result = reducer(state, {
        type: 'DISMISS_TOAST',
      });

      expect(result.toasts.every((t) => t.open === false)).toBe(true);
    });

    it('should remove a specific toast', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true },
        ],
      };

      const result = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      });

      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('2');
    });

    it('should remove all toasts when no ID provided', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true },
        ],
      };

      const result = reducer(state, {
        type: 'REMOVE_TOAST',
      });

      expect(result.toasts).toHaveLength(0);
    });
  });

  describe('toast function', () => {
    it('should create a toast with an ID', () => {
      const result = toast({ title: 'Test' });

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('should return dismiss function', () => {
      const result = toast({ title: 'Test' });

      expect(typeof result.dismiss).toBe('function');
    });

    it('should return update function', () => {
      const result = toast({ title: 'Test' });

      expect(typeof result.update).toBe('function');
    });

    it('should generate unique IDs for each toast', () => {
      const toast1 = toast({ title: 'Toast 1' });
      const toast2 = toast({ title: 'Toast 2' });

      expect(toast1.id).not.toBe(toast2.id);
    });
  });

  describe('useToast hook', () => {
    it('should return toasts array', () => {
      const { result } = renderHook(() => useToast());

      expect(Array.isArray(result.current.toasts)).toBe(true);
    });

    it('should return toast function', () => {
      const { result } = renderHook(() => useToast());

      expect(typeof result.current.toast).toBe('function');
    });

    it('should return dismiss function', () => {
      const { result } = renderHook(() => useToast());

      expect(typeof result.current.dismiss).toBe('function');
    });

    it('should add toast to state when toast is called', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'New Toast' });
      });

      expect(result.current.toasts.length).toBeGreaterThan(0);
    });

    it('should dismiss toast when dismiss is called with ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        const { id } = result.current.toast({ title: 'Toast to dismiss' });
        toastId = id;
      });

      act(() => {
        result.current.dismiss(toastId!);
      });

      // After dismiss, the toast should be closed
      const dismissedToast = result.current.toasts.find((t) => t.id === toastId);
      expect(dismissedToast?.open).toBe(false);
    });

    it('should dismiss all toasts when dismiss is called without ID', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' });
      });

      act(() => {
        result.current.dismiss();
      });

      // All toasts should be closed
      expect(result.current.toasts.every((t) => t.open === false)).toBe(true);
    });

    it('should update toast via update function', () => {
      const { result } = renderHook(() => useToast());

      let updateFn: (props: any) => void;
      act(() => {
        const toastResult = result.current.toast({ title: 'Original Title' });
        updateFn = toastResult.update;
      });

      act(() => {
        updateFn({ title: 'Updated Title' });
      });

      expect(result.current.toasts[0].title).toBe('Updated Title');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rapid toasts', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' });
        result.current.toast({ title: 'Toast 2' });
        result.current.toast({ title: 'Toast 3' });
      });

      // Due to TOAST_LIMIT of 1, only the last toast should be visible
      expect(result.current.toasts.length).toBe(1);
    });

    it('should handle empty toast properties', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({});
      });

      expect(result.current.toasts.length).toBeGreaterThan(0);
    });

    it('should handle toast with all properties', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Full Toast',
          description: 'Description here',
          variant: 'destructive',
          duration: 5000,
        });
      });

      const createdToast = result.current.toasts[0];
      expect(createdToast.title).toBe('Full Toast');
      expect(createdToast.description).toBe('Description here');
    });
  });
});
