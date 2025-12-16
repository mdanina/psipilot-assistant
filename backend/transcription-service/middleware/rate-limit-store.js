/**
 * Rate Limit Store с автоматической очисткой устаревших записей
 *
 * ИСПРАВЛЕНО: Ранее Map рос бесконечно без очистки,
 * что приводило к утечке памяти при большом количестве пользователей.
 */

class RateLimitStore {
  constructor(options = {}) {
    this.store = new Map();
    this.cleanupIntervalMs = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 минут
    this.maxSize = options.maxSize || 50000; // Максимальный размер store
    this.cleanupBufferMs = options.cleanupBufferMs || 60 * 1000; // 1 минута буфера после истечения
    this.cleanupInterval = null;
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      cleanedRecords: 0,
    };
  }

  /**
   * Запуск периодической очистки
   */
  start() {
    if (this.cleanupInterval) {
      console.warn('[RateLimitStore] Already started');
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Не блокируем shutdown процесса
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    console.log('[RateLimitStore] Started with cleanup interval:', this.cleanupIntervalMs, 'ms');
  }

  /**
   * Остановка периодической очистки
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[RateLimitStore] Stopped');
    }
  }

  /**
   * Очистка устаревших записей
   */
  cleanup() {
    const now = Date.now();
    const sizeBefore = this.store.size;
    let cleaned = 0;

    for (const [key, record] of this.store.entries()) {
      // Удаляем записи, чей window истёк + буфер
      if (now > record.resetAt + this.cleanupBufferMs) {
        this.store.delete(key);
        cleaned++;
      }
    }

    this.stats.cleanedRecords += cleaned;

    if (cleaned > 0 || sizeBefore > 100) {
      console.log('[RateLimitStore] Cleanup:', {
        before: sizeBefore,
        after: this.store.size,
        cleaned,
        totalCleaned: this.stats.cleanedRecords,
      });
    }

    // Предупреждение если store слишком большой
    if (this.store.size > this.maxSize * 0.8) {
      console.warn('[RateLimitStore] WARNING: Size approaching limit:', {
        current: this.store.size,
        max: this.maxSize,
        percentage: Math.round((this.store.size / this.maxSize) * 100) + '%',
      });
    }
  }

  /**
   * Принудительная очистка при превышении лимита
   */
  forceCleanup() {
    console.warn('[RateLimitStore] Force cleanup triggered');
    this.cleanup();

    // Если всё ещё превышает, удаляем самые старые записи
    if (this.store.size >= this.maxSize) {
      const entries = Array.from(this.store.entries())
        .sort((a, b) => a[1].resetAt - b[1].resetAt);

      const toRemove = Math.floor(this.maxSize * 0.2); // Удаляем 20%
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.store.delete(entries[i][0]);
      }

      console.warn('[RateLimitStore] Removed oldest entries:', toRemove);
    }
  }

  /**
   * Проверка rate limit
   * @param {string} key - Уникальный ключ (например, `researcher:${userId}`)
   * @param {number} maxRequests - Максимум запросов в окне
   * @param {number} windowMs - Размер окна в миллисекундах
   * @returns {{ allowed: boolean, remaining: number, resetAt: number, retryAfter?: number }}
   */
  check(key, maxRequests, windowMs) {
    this.stats.totalRequests++;
    const now = Date.now();

    // Защита от переполнения
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.forceCleanup();
    }

    const record = this.store.get(key);

    // Новый ключ или истёкшее окно
    if (!record || now > record.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowMs, firstRequest: now });
      this.stats.allowedRequests++;
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    // Лимит превышен
    if (record.count >= maxRequests) {
      this.stats.blockedRequests++;
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      };
    }

    // Увеличиваем счётчик
    record.count++;
    this.stats.allowedRequests++;

    return {
      allowed: true,
      remaining: maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  /**
   * Сброс лимита для конкретного ключа (например, после успешной верификации)
   */
  reset(key) {
    this.store.delete(key);
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      utilizationPercent: Math.round((this.store.size / this.maxSize) * 100),
      ...this.stats,
    };
  }

  /**
   * Получение информации о конкретном ключе
   */
  getInfo(key) {
    const record = this.store.get(key);
    if (!record) return null;

    const now = Date.now();
    return {
      count: record.count,
      resetAt: record.resetAt,
      resetIn: Math.max(0, Math.ceil((record.resetAt - now) / 1000)),
      isExpired: now > record.resetAt,
    };
  }
}

// Создаём singleton instance
const rateLimitStore = new RateLimitStore({
  cleanupIntervalMs: 5 * 60 * 1000, // Очистка каждые 5 минут
  maxSize: 50000, // Максимум 50K записей
  cleanupBufferMs: 60 * 1000, // Буфер 1 минута после истечения
});

// Автоматический запуск
rateLimitStore.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[RateLimitStore] SIGTERM received, stopping...');
  rateLimitStore.stop();
});

process.on('SIGINT', () => {
  console.log('[RateLimitStore] SIGINT received, stopping...');
  rateLimitStore.stop();
});

export { rateLimitStore, RateLimitStore };
export default rateLimitStore;
