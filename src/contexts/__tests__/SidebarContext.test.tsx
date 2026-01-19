import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SidebarProvider, useSidebar } from '../SidebarContext';

describe('SidebarContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SidebarProvider>{children}</SidebarProvider>
  );

  describe('SidebarProvider', () => {
    it('should provide context to children', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      expect(result.current).toBeDefined();
      expect(typeof result.current.isOpen).toBe('boolean');
      expect(typeof result.current.open).toBe('function');
      expect(typeof result.current.close).toBe('function');
      expect(typeof result.current.toggle).toBe('function');
    });

    it('should have sidebar closed by default', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('useSidebar', () => {
    it('should throw error when used outside provider', () => {
      // We need to suppress the error output for this test
      const consoleError = console.error;
      console.error = () => {};

      expect(() => {
        renderHook(() => useSidebar());
      }).toThrow('useSidebar must be used within a SidebarProvider');

      console.error = consoleError;
    });
  });

  describe('open', () => {
    it('should open the sidebar', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should keep sidebar open when called multiple times', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      act(() => {
        result.current.open();
        result.current.open();
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });
  });

  describe('close', () => {
    it('should close the sidebar', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      // First open it
      act(() => {
        result.current.open();
      });
      expect(result.current.isOpen).toBe(true);

      // Then close it
      act(() => {
        result.current.close();
      });
      expect(result.current.isOpen).toBe(false);
    });

    it('should keep sidebar closed when called multiple times', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      act(() => {
        result.current.close();
        result.current.close();
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('toggle', () => {
    it('should toggle sidebar from closed to open', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should toggle sidebar from open to closed', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      act(() => {
        result.current.open();
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should toggle multiple times correctly', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.toggle(); // open
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggle(); // close
      });
      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.toggle(); // open
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggle(); // close
      });
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('combined operations', () => {
    it('should handle mixed operations correctly', () => {
      const { result } = renderHook(() => useSidebar(), { wrapper });

      act(() => {
        result.current.toggle(); // open
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close(); // close
      });
      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.open(); // open
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggle(); // close
      });
      expect(result.current.isOpen).toBe(false);
    });
  });
});
