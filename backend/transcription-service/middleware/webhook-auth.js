/**
 * Webhook верификация с поддержкой нескольких режимов
 *
 * Режимы:
 * - shadow: Только логирование (не блокирует) - для начального тестирования
 * - warn: Логирование + warning (не блокирует)
 * - soft: Отклоняет невалидные, но возвращает 200 (без retry от AssemblyAI)
 * - strict: Полное отклонение с 401
 *
 * Использование:
 * WEBHOOK_VERIFICATION_MODE=shadow (по умолчанию)
 * ASSEMBLYAI_WEBHOOK_SECRET=your_secret_here
 */

import crypto from 'crypto';

// Режим верификации из env
const VERIFICATION_MODE = process.env.WEBHOOK_VERIFICATION_MODE || 'shadow';
const WEBHOOK_SECRET = process.env.ASSEMBLYAI_WEBHOOK_SECRET;

// Метрики для мониторинга
const metrics = {
  total: 0,
  valid: 0,
  invalid: 0,
  noSignature: 0,
  noSecret: 0,
};

/**
 * Вычисление HMAC подписи
 */
function computeSignature(body, secret) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Безопасное сравнение подписей (timing-safe)
 */
function verifySignature(received, expected) {
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
    hasSignature: result.hasSignature,
    hasSecret: result.hasSecret,
    isValid: result.isValid,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent']?.substring(0, 100),
  };

  if (result.isValid) {
    console.log('[Webhook] Verification passed:', logData);
  } else if (!result.hasSecret) {
    console.warn('[Webhook] No secret configured:', logData);
  } else if (!result.hasSignature) {
    console.warn('[Webhook] No signature in request:', logData);
  } else {
    console.warn('[Webhook] Invalid signature:', logData);
  }
}

/**
 * Middleware для верификации webhook
 */
export function webhookAuth(req, res, next) {
  metrics.total++;

  const signature = req.headers['x-assemblyai-signature'];
  const hasSecret = !!WEBHOOK_SECRET;
  const hasSignature = !!signature;

  let isValid = false;

  if (hasSecret && hasSignature) {
    const expectedSignature = computeSignature(req.body, WEBHOOK_SECRET);
    isValid = verifySignature(signature, expectedSignature);
  } else if (!hasSecret) {
    // Если секрет не настроен, пропускаем (для обратной совместимости)
    isValid = true;
    metrics.noSecret++;
  }

  // Обновляем метрики
  if (!hasSignature) {
    metrics.noSignature++;
  } else if (isValid) {
    metrics.valid++;
  } else {
    metrics.invalid++;
  }

  const verificationResult = {
    hasSignature,
    hasSecret,
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
      // Пропускаем, но добавляем предупреждение в ответ
      if (!isValid && hasSecret) {
        console.warn('[Webhook] WARN MODE: Invalid signature detected, but allowing request');
      }
      return next();

    case 'soft':
      // Отклоняем невалидные, но возвращаем 200
      if (!isValid && hasSecret && hasSignature) {
        console.error('[Webhook] SOFT REJECT: Invalid signature');
        return res.status(200).json({
          success: false,
          status: 'rejected',
          reason: 'invalid_signature',
          message: 'Webhook rejected due to invalid signature',
        });
      }
      return next();

    case 'strict':
      // Полное отклонение
      if (!hasSignature && hasSecret) {
        console.error('[Webhook] STRICT: Missing signature');
        return res.status(401).json({
          error: 'Missing signature header',
          required: 'x-assemblyai-signature',
        });
      }

      if (!isValid && hasSecret) {
        console.error('[Webhook] STRICT: Invalid signature');
        return res.status(401).json({
          error: 'Invalid signature',
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
    secretConfigured: !!WEBHOOK_SECRET,
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
  metrics.noSignature = 0;
  metrics.noSecret = 0;
}

export default webhookAuth;
