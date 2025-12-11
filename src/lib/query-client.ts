import { QueryClient } from '@tanstack/react-query';

/**
 * Configured QueryClient for React Query
 * 
 * This configuration provides:
 * - Automatic caching (5 minutes stale time)
 * - Reduced refetching (no refetch on window focus)
 * - Automatic retry on errors (3 attempts)
 * 
 * SAFE: This doesn't break existing code - it just adds caching
 * to components that use React Query hooks.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 5 minutes
      // This means React Query won't refetch automatically for 5 minutes
      staleTime: 5 * 60 * 1000, // 5 minutes
      
      // Keep unused data in cache for 10 minutes
      // After 10 minutes of being unused, it's garbage collected
      // Note: In React Query v5, this is called gcTime instead of cacheTime
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      
      // Don't refetch when window regains focus
      // This prevents annoying refetches when user switches tabs
      refetchOnWindowFocus: false,
      
      // Don't refetch when network reconnects
      // This prevents refetches when user's internet briefly disconnects
      refetchOnReconnect: false,
      
      // Retry failed requests up to 3 times
      retry: 3,
      
      // Exponential backoff for retries
      // First retry: 1s, second: 2s, third: 4s (max 30s)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      
      // Retry delay for mutations
      retryDelay: 1000,
    },
  },
});

