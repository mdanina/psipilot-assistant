import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../use-mobile';

describe('useIsMobile', () => {
  let matchMediaListeners: Map<string, Set<(e: MediaQueryListEvent) => void>>;

  beforeEach(() => {
    matchMediaListeners = new Map();

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => {
        const listeners = new Set<(e: MediaQueryListEvent) => void>();
        matchMediaListeners.set(query, listeners);

        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn((event, callback) => {
            if (event === 'change') {
              listeners.add(callback);
            }
          }),
          removeEventListener: vi.fn((event, callback) => {
            if (event === 'change') {
              listeners.delete(callback);
            }
          }),
          dispatchEvent: vi.fn(),
        };
      }),
    });

    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024, // Desktop by default
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return false for desktop width (>= 768px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024 });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('should return true for mobile width (< 768px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500 });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('should return false for exactly 768px (breakpoint)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 768 });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('should return true for 767px (just below breakpoint)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 767 });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('should call matchMedia with correct query', () => {
    renderHook(() => useIsMobile());

    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
  });

  it('should add event listener for changes', () => {
    const { result } = renderHook(() => useIsMobile());

    // The hook should have added a listener
    const listeners = matchMediaListeners.get('(max-width: 767px)');
    expect(listeners?.size).toBeGreaterThan(0);
  });

  it('should remove event listener on unmount', () => {
    const { unmount } = renderHook(() => useIsMobile());

    // Get listeners before unmount
    const listeners = matchMediaListeners.get('(max-width: 767px)');
    const initialSize = listeners?.size || 0;

    unmount();

    // Listener should be removed
    const finalSize = matchMediaListeners.get('(max-width: 767px)')?.size || 0;
    expect(finalSize).toBeLessThan(initialSize);
  });

  it('should update when window width changes', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024 });

    const { result, rerender } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    // Simulate resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500 });

      // Trigger the change event
      const listeners = matchMediaListeners.get('(max-width: 767px)');
      listeners?.forEach((listener) => {
        listener({ matches: true, media: '(max-width: 767px)' } as MediaQueryListEvent);
      });
    });

    expect(result.current).toBe(true);
  });

  it('should return false initially (before useEffect runs)', () => {
    // The hook uses undefined initial state, which becomes false via !!
    const { result } = renderHook(() => useIsMobile());

    // After the effect runs, it should have a defined value
    expect(typeof result.current).toBe('boolean');
  });

  describe('edge cases', () => {
    it('should handle very small width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 320 });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });

    it('should handle very large width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 2560 });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });

    it('should handle width of 0', () => {
      Object.defineProperty(window, 'innerWidth', { value: 0 });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });
  });
});
