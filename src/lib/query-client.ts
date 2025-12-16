import { QueryClient } from '@tanstack/react-query';

/**
 * Настраиваемый staleTime через env variable
 * Позволяет постепенно снижать значение для тестирования
 *
 * План развёртывания:
 * - Неделя 1: 60 минут (начальное значение)
 * - Неделя 2: 30 минут
 * - Неделя 3: 15 минут
 * - Неделя 4: 5 минут (целевое)
 *
 * Установите VITE_QUERY_STALE_TIME_MINUTES в .env
 */
const STALE_TIME_MINUTES = parseInt(
  import.meta.env.VITE_QUERY_STALE_TIME_MINUTES || '5',
  10
);

// Валидация значения
const validStaleTime = isNaN(STALE_TIME_MINUTES) || STALE_TIME_MINUTES < 1
  ? 5
  : STALE_TIME_MINUTES;

/**
 * Метрики для мониторинга React Query
 */
interface QueryMetrics {
  fetches: number;
  cacheHits: number;
  errors: number;
  staleTimeMinutes: number;
  startedAt: number;
}

const queryMetrics: QueryMetrics = {
  fetches: 0,
  cacheHits: 0,
  errors: 0,
  staleTimeMinutes: validStaleTime,
  startedAt: Date.now(),
};

/**
 * Configured QueryClient for React Query
 *
 * This configuration provides:
 * - Configurable stale time via VITE_QUERY_STALE_TIME_MINUTES
 * - Reduced refetching (no refetch on window focus)
 * - Automatic retry on errors (3 attempts with exponential backoff)
 * - Metrics tracking for monitoring
 *
 * SAFE: This doesn't break existing code - it just adds caching
 * to components that use React Query hooks.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Настраиваемый staleTime для постепенного снижения
      staleTime: validStaleTime * 60 * 1000,

      // Keep unused data in cache for 2x staleTime (minimum 10 minutes)
      gcTime: Math.max(validStaleTime * 2, 10) * 60 * 1000,

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

// Подписка на события для метрик (только в development)
if (import.meta.env.DEV) {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated') {
      switch (event.action.type) {
        case 'fetch':
          queryMetrics.fetches++;
          break;
        case 'error':
          queryMetrics.errors++;
          break;
        case 'success':
          // Если данные пришли из кэша (не было fetch)
          if (!event.action.manual) {
            queryMetrics.cacheHits++;
          }
          break;
      }
    }
  });

  // Логируем конфигурацию при старте
  console.log('[QueryClient] Initialized with staleTime:', validStaleTime, 'minutes');
}

/**
 * Получение метрик React Query для мониторинга
 */
export function getQueryMetrics() {
  const cacheSize = queryClient.getQueryCache().getAll().length;
  const uptimeMinutes = Math.round((Date.now() - queryMetrics.startedAt) / 60000);

  return {
    ...queryMetrics,
    cacheSize,
    uptimeMinutes,
    fetchesPerMinute: uptimeMinutes > 0
      ? Math.round(queryMetrics.fetches / uptimeMinutes * 10) / 10
      : 0,
  };
}

/**
 * Сброс метрик (для тестирования)
 */
export function resetQueryMetrics() {
  queryMetrics.fetches = 0;
  queryMetrics.cacheHits = 0;
  queryMetrics.errors = 0;
  queryMetrics.startedAt = Date.now();
}

/**
 * Инвалидация запросов с логированием
 * Используйте вместо прямого queryClient.invalidateQueries для отслеживания
 */
export function invalidateQueries(queryKey: readonly unknown[]) {
  if (import.meta.env.DEV) {
    console.log('[QueryClient] Invalidating:', queryKey);
  }
  return queryClient.invalidateQueries({ queryKey });
}
