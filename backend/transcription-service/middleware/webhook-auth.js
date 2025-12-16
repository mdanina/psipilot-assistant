/**
 * Webhook верификация для AssemblyAI
 *
 * AssemblyAI использует custom header authentication:
 * - При создании транскрипции указываем webhook_auth_header_name и webhook_auth_header_value
 * - AssemblyAI отправляет этот заголовок при вызове webhook
 * - Мы проверяем, что заголовок совпадает
 *
 * Режимы:
 * - shadow: Только логирование (не блокирует) - для начального тестирования
 * - warn: Логирование + warning (не блокирует)
 * - soft: Отклоняет невалидные, но возвращает 200 (без retry от AssemblyAI)
 * - strict: Полное отклонение с 401
 *
 * Настройка:
 * WEBHOOK_VERIFICATION_MODE=shadow (по умолчанию)
 * WEBHOOK_AUTH_HEADER_NAME=X-Webhook-Secret (имя заголовка)
 * WEBHOOK_AUTH_HEADER_VALUE=your_secret_here (значение для проверки)
 */

import crypto from 'crypto';

// Режим верификации из env
const VERIFICATION_MODE = process.env.WEBHOOK_VERIFICATION_MODE || 'shadow';
const AUTH_HEADER_NAME = process.env.WEBHOOK_AUTH_HEADER_NAME;
const AUTH_HEADER_VALUE = process.env.WEBHOOK_AUTH_HEADER_VALUE;

// Метрики для мониторинга
const metrics = {
  total: 0,
  valid: 0,
  invalid: 0,
  noHeader: 0,
  notConfigured: 0,
};

/**
 * Безопасное сравнение значений (timing-safe)
 */
function safeCompare(received, expected) {
  if (!received || !expected) return false;

  try {
    const receivedBuf = Buffer.from(received);
    const expectedBuf = Buffer.from(expected);

    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Логирование результата верификации
 */
function logVerification(req, result, mode) {
  const logData = {
    mode,
    timestamp: new Date().toISOString(),
    transcriptId: req.body?.transcript_id,
    status: req.body?.status,
    hasAuthHeader: result.hasAuthHeader,
    isConfigured: result.isConfigured,
    isValid: result.isValid,
    headerName: AUTH_HEADER_NAME || 'not configured',
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  };

  if (result.isValid) {
    console.log('[Webhook] Verification passed:', logData);
  } else if (!result.isConfigured) {
    console.log('[Webhook] Auth not configured (allowing all):', logData);
  } else if (!result.hasAuthHeader) {
    console.warn('[Webhook] Missing auth header:', logData);
  } else {
    console.warn('[Webhook] Invalid auth header value:', logData);
  }
}

/**
 * Middleware для верификации webhook
 */
export function webhookAuth(req, res, next) {
  metrics.total++;

  // Проверяем, настроена ли аутентификация
  const isConfigured = !!(AUTH_HEADER_NAME && AUTH_HEADER_VALUE);

  // Если не настроено - пропускаем (обратная совместимость)
  if (!isConfigured) {
    metrics.notConfigured++;

    const verificationResult = {
      hasAuthHeader: false,
      isConfigured: false,
      isValid: true, // Считаем валидным если не настроено
    };

    req.webhookVerification = verificationResult;
    logVerification(req, verificationResult, VERIFICATION_MODE);
    return next();
  }

  // Получаем значение заголовка (нормализуем имя в lowercase)
  const headerNameLower = AUTH_HEADER_NAME.toLowerCase();
  const receivedValue = req.headers[headerNameLower];
  const hasAuthHeader = !!receivedValue;

  // Проверяем значение
  const isValid = hasAuthHeader && safeCompare(receivedValue, AUTH_HEADER_VALUE);

  // Обновляем метрики
  if (!hasAuthHeader) {
    metrics.noHeader++;
  } else if (isValid) {
    metrics.valid++;
  } else {
    metrics.invalid++;
  }

  const verificationResult = {
    hasAuthHeader,
    isConfigured,
    isValid,
  };

  // Добавляем результат в request для логирования
  req.webhookVerification = verificationResult;

  // Логируем
  logVerification(req, verificationResult, VERIFICATION_MODE);

  // Поведение зависит от режима
  switch (VERIFICATION_MODE) {
    case 'shadow':
      // Пропускаем всё, только логируем
      return next();

    case 'warn':
      // Пропускаем, но добавляем предупреждение в консоль
      if (!isValid) {
        console.warn('[Webhook] WARN MODE: Invalid auth header, but allowing request');
      }
      return next();

    case 'soft':
      // Отклоняем невалидные, но возвращаем 200 (AssemblyAI не будет повторять)
      if (!isValid) {
        console.error('[Webhook] SOFT REJECT: Invalid auth header');
        return res.status(200).json({
          success: false,
          status: 'rejected',
          reason: 'invalid_auth',
          message: 'Webhook rejected due to invalid authentication',
        });
      }
      return next();

    case 'strict':
      // Полное отклонение
      if (!hasAuthHeader) {
        console.error('[Webhook] STRICT: Missing auth header');
        return res.status(401).json({
          error: 'Missing authentication header',
          required: AUTH_HEADER_NAME,
        });
      }

      if (!isValid) {
        console.error('[Webhook] STRICT: Invalid auth header value');
        return res.status(401).json({
          error: 'Invalid authentication',
        });
      }
      return next();

    default:
      // По умолчанию - shadow mode
      return next();
  }
}

/**
 * Получение метрик для мониторинга
 */
export function getWebhookMetrics() {
  return {
    mode: VERIFICATION_MODE,
    authConfigured: !!(AUTH_HEADER_NAME && AUTH_HEADER_VALUE),
    headerName: AUTH_HEADER_NAME || 'not configured',
    metrics: { ...metrics },
    successRate: metrics.total > 0
      ? Math.round((metrics.valid / metrics.total) * 100)
      : 0,
  };
}

/**
 * Сброс метрик (для тестирования)
 */
export function resetWebhookMetrics() {
  metrics.total = 0;
  metrics.valid = 0;
  metrics.invalid = 0;
  metrics.noHeader = 0;
  metrics.notConfigured = 0;
}

export default webhookAuth;
