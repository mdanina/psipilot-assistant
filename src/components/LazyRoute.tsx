import { Suspense, Component, ReactNode, lazy, ComponentType } from 'react';
import { Loader2, RefreshCw, AlertTriangle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * LazyRoute - компонент для безопасной ленивой загрузки страниц
 *
 * Особенности:
 * - ErrorBoundary для перехвата ошибок загрузки чанков
 * - Автоматический retry при ошибках сети
 * - Красивый fallback UI при загрузке
 * - Логирование ошибок для аналитики
 */

// ============ Error Boundary ============


interface WindowWithAnalytics extends Window {
  analytics?: {
    track: (eventName: string, payload: Record<string, unknown>) => void;
  };
}

interface ErrorState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

class LazyErrorBoundary extends Component<ErrorBoundaryProps, ErrorState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Логируем ошибку
    console.error('[LazyRoute] Component load error:', {
      error: error.message,
      stack: error.stack?.substring(0, 500),
      componentStack: errorInfo.componentStack?.substring(0, 500),
    });

    // Callback для внешней аналитики
    this.props.onError?.(error, errorInfo);

    // Отправляем в аналитику если доступна
    const trackedWindow = window as WindowWithAnalytics;
    if (typeof window !== 'undefined' && trackedWindow.analytics) {
      trackedWindow.analytics.track('lazy_load_error', {
        error: error.message,
        retryCount: this.state.retryCount,
      });
    }
  }

  handleRetry = () => {
    this.setState(prev => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;

      // Определяем тип ошибки
      const isChunkError =
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('Importing a module script failed') ||
        error?.message?.includes('error loading dynamically imported module');

      const isNetworkError =
        error?.message?.includes('NetworkError') ||
        error?.message?.includes('net::ERR');

      // Custom fallback если предоставлен
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Ошибка загрузки чанка (проблема сети или деплоя)
      if (isChunkError || isNetworkError) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
            <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />

            <h2 className="text-lg font-semibold mb-2">
              Ошибка загрузки страницы
            </h2>

            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {isNetworkError
                ? 'Проверьте подключение к интернету и попробуйте снова.'
                : 'Возможно, приложение было обновлено. Попробуйте обновить страницу.'}
            </p>

            <div className="flex gap-3">
              {retryCount < 3 ? (
                <Button onClick={this.handleRetry} variant="default">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Попробовать снова ({3 - retryCount})
                </Button>
              ) : (
                <Button onClick={this.handleReload} variant="default">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Обновить страницу
                </Button>
              )}
            </div>

            {retryCount >= 2 && (
              <p className="text-xs text-muted-foreground mt-4">
                Если проблема повторяется, обратитесь в поддержку
              </p>
            )}
          </div>
        );
      }

      // Другие ошибки (баги в коде)
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />

          <h2 className="text-lg font-semibold mb-2">
            Произошла ошибка
          </h2>

          <p className="text-muted-foreground text-center mb-4">
            Пожалуйста, обновите страницу или обратитесь в поддержку.
          </p>

          <Button onClick={this.handleReload} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить страницу
          </Button>

          {import.meta.env.DEV && error && (
            <pre className="mt-4 p-4 bg-muted rounded text-xs max-w-lg overflow-auto">
              {error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// ============ Loading Fallback ============

interface LoadingFallbackProps {
  message?: string;
}

function LoadingFallback({ message = 'Загрузка...' }: LoadingFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ============ Lazy with Retry ============

/**
 * Создаёт lazy компонент с автоматическим retry при ошибках
 */
function lazyWithRetry<T extends ComponentType<object>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  retryDelay = 1000
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Очищаем кэш модуля при повторных попытках (для Vite)
        if (attempt > 0) {
          console.log(`[LazyRoute] Retry attempt ${attempt + 1}/${retries}`);
        }

        return await importFn();
      } catch (error) {
        lastError = error as Error;
        console.warn(`[LazyRoute] Load attempt ${attempt + 1} failed:`, error);

        // Ждём перед следующей попыткой (с увеличивающейся задержкой)
        if (attempt < retries - 1) {
          await new Promise(resolve =>
            setTimeout(resolve, retryDelay * (attempt + 1))
          );
        }
      }
    }

    throw lastError;
  });
}

// ============ LazyRoute Component ============

interface LazyRouteProps {
  /** Функция импорта компонента */
  component: () => Promise<{ default: ComponentType<object> }>;
  componentProps?: Record<string, unknown>;
  /** Сообщение при загрузке */
  loadingMessage?: string;
  /** Callback при ошибке */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  }

/**
 * LazyRoute - обёртка для ленивой загрузки страниц с обработкой ошибок
 *
 * @example
 * <LazyRoute
 *   component={() => import('./pages/SessionsPage')}
 *   loadingMessage="Загрузка сессий..."
 * />
 */
export function LazyRoute({
  component,
  loadingMessage,
  onError,
  componentProps
}: LazyRouteProps) {
  const LazyComponent = lazyWithRetry(component);

  return (
    <LazyErrorBoundary onError={onError}>
      <Suspense fallback={<LoadingFallback message={loadingMessage} />}>
        <LazyComponent {...(componentProps ?? {})} />
      </Suspense>
    </LazyErrorBoundary>
  );
}

// ============ Exports ============

export { LazyErrorBoundary, LoadingFallback, lazyWithRetry };
export default LazyRoute;
