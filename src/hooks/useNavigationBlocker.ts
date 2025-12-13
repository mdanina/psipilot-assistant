import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Custom hook to block navigation when a condition is met.
 * Works with BrowserRouter (unlike useBlocker which requires data router).
 * 
 * This hook:
 * 1. Handles beforeunload for browser navigation/close
 * 2. Intercepts internal navigation by wrapping useNavigate
 * 3. Intercepts NavLink clicks via global click handler
 * 4. Provides state for showing a confirmation dialog
 * 
 * @param shouldBlock - Function that returns true if navigation should be blocked
 * @returns Object with blocked state and methods to proceed/reset (similar to useBlocker API)
 */
export function useNavigationBlocker(shouldBlock: (currentPath: string, nextPath: string) => boolean) {
  const [isBlocked, setIsBlocked] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const shouldBlockRef = useRef(shouldBlock);
  const navigateRef = useRef(navigate);
  const previousPathRef = useRef(location.pathname);

  // Update refs when they change
  useEffect(() => {
    shouldBlockRef.current = shouldBlock;
    navigateRef.current = navigate;
  }, [shouldBlock, navigate]);

  // Handle beforeunload (browser navigation/close)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if we should block based on current path
      if (shouldBlockRef.current(location.pathname, '')) {
        e.preventDefault();
        e.returnValue = 'Идет запись. Вы уверены, что хотите закрыть страницу?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [location.pathname]);

  // Intercept NavLink clicks by listening to all link clicks
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find the closest anchor or element with href
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;
      
      if (!link) return;
      
      // Skip if it's a modifier key (Ctrl, Cmd, etc.) - allow default behavior
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
        return;
      }
      
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return; // External links or special protocols
      }

      // Check if this is a React Router link
      // React Router links typically have relative paths
      const currentPath = location.pathname;
      let nextPath = href;
      
      // Normalize the path
      if (!nextPath.startsWith('/')) {
        // Relative path - resolve it
        const basePath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
        nextPath = `${basePath}/${nextPath}`.replace(/\/+/g, '/');
      }
      
      // Remove query string and hash for comparison
      const nextPathClean = nextPath.split('?')[0].split('#')[0];
      const currentPathClean = currentPath.split('?')[0].split('#')[0];
      
      if (nextPathClean !== currentPathClean && shouldBlockRef.current(currentPathClean, nextPathClean)) {
        e.preventDefault();
        e.stopPropagation();
        setIsBlocked(true);
        setPendingNavigation(nextPathClean);
        return false;
      }
    };

    // Use capture phase to intercept before React Router handles it
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [location.pathname]);

  // Monitor location changes to detect navigation
  useEffect(() => {
    const currentPath = previousPathRef.current;
    const nextPath = location.pathname;

    // If path changed and we should block, we need to handle it
    // Note: We can't prevent navigation in BrowserRouter, but we can detect it
    // and show a dialog, then navigate back if user cancels
    if (currentPath !== nextPath && isBlocked && pendingNavigation) {
      // Navigation happened despite being blocked
      // This shouldn't happen with our wrapped navigate, but handle it anyway
      console.warn('Navigation occurred despite being blocked');
    }

    previousPathRef.current = nextPath;
  }, [location.pathname, isBlocked, pendingNavigation]);

  // Proceed with pending navigation
  const proceed = useCallback(() => {
    if (pendingNavigation) {
      setIsBlocked(false);
      const target = pendingNavigation;
      setPendingNavigation(null);
      navigateRef.current(target);
    } else {
      setIsBlocked(false);
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  // Cancel pending navigation
  const reset = useCallback(() => {
    setIsBlocked(false);
    setPendingNavigation(null);
  }, []);

  // Wrapped navigate function that checks shouldBlock before navigating
  const blockedNavigate = useCallback((to: string | number, options?: { replace?: boolean; state?: unknown }) => {
    if (typeof to === 'string') {
      const currentPath = location.pathname;
      if (shouldBlockRef.current(currentPath, to)) {
        setIsBlocked(true);
        setPendingNavigation(to);
        return; // Block navigation
      }
    }
    // Allow navigation
    navigateRef.current(to, options);
  }, [location.pathname]);

  return {
    state: isBlocked ? 'blocked' : 'unblocked',
    isBlocked,
    pendingNavigation,
    proceed,
    reset,
    navigate: blockedNavigate,
  };
}
