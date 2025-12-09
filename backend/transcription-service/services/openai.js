import OpenAI from 'openai';

/**
 * Сервис для работы с OpenAI API
 * Генерирует контент для блоков клинических заметок и сводок
 *
 * Включает retry с exponential backoff для обработки rate limits
 */

// Конфигурация retry
const RETRY_CONFIG = {
  maxRetries: 4,
  baseDelayMs: 2000, // 2 секунды
  maxDelayMs: 16000, // 16 секунд
};

// Инициализация OpenAI клиента
let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required. Please set it in .env file.');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Ожидание с exponential backoff
 *
 * @param {number} attempt - Номер попытки (0-based)
 * @returns {Promise<void>}
 */
async function sleep(attempt) {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelayMs
  );
  console.log(`[OpenAI] Waiting ${delay}ms before retry (attempt ${attempt + 1})`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Определяет, стоит ли повторять запрос при данной ошибке
 *
 * @param {Error} error - Ошибка от OpenAI API
 * @returns {boolean}
 */
function isRetryableError(error) {
  // Rate limit (429)
  if (error.status === 429) {
    return true;
  }

  // Server errors (5xx)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // OpenAI specific retryable errors
  if (error.code === 'insufficient_quota' || error.code === 'server_error') {
    return true;
  }

  return false;
}

/**
 * Выполняет запрос к OpenAI с retry логикой
 *
 * @param {Function} requestFn - Функция, выполняющая запрос
 * @param {string} operationName - Название операции для логирования
 * @returns {Promise<any>}
 */
async function executeWithRetry(requestFn, operationName) {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[OpenAI] Retry attempt ${attempt} for ${operationName}`);
      }

      return await requestFn();
    } catch (error) {
      lastError = error;

      console.error(`[OpenAI] ${operationName} failed (attempt ${attempt + 1}):`, {
        status: error.status,
        code: error.code,
        message: error.message,
      });

      // Проверяем, стоит ли повторять
      if (!isRetryableError(error)) {
        console.log(`[OpenAI] Error is not retryable, throwing immediately`);
        throw error;
      }

      // Если это последняя попытка - выбрасываем ошибку
      if (attempt === RETRY_CONFIG.maxRetries) {
        console.error(`[OpenAI] All ${RETRY_CONFIG.maxRetries + 1} attempts failed for ${operationName}`);
        throw error;
      }

      // Ждём перед следующей попыткой
      await sleep(attempt);
    }
  }

  throw lastError;
}

/**
 * Генерация контента для одного блока клинической заметки
 *
 * @param {string} systemPrompt - Системный промпт для блока
 * @param {string} transcript - Анонимизированный транскрипт сессии
 * @param {Object} [options] - Дополнительные опции
 * @param {string} [options.model] - Модель OpenAI (по умолчанию 'gpt-5-chat-latest')
 * @param {number} [options.temperature] - Температура (по умолчанию 0.3)
 * @param {number} [options.maxTokens] - Максимальное количество токенов (по умолчанию 1000)
 * @returns {Promise<string>} Сгенерированный контент
 */
export async function generateBlockContent(systemPrompt, transcript, options = {}) {
  const {
    model = 'gpt-5-chat-latest',
    temperature = 0.3,
    maxTokens = 1000,
  } = options;

  const makeRequest = async () => {
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Вот транскрипт терапевтической сессии:\n\n${transcript}`,
        },
      ],
      temperature,
      max_tokens: maxTokens,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI API returned empty content');
    }

    return content;
  };

  try {
    return await executeWithRetry(makeRequest, 'generateBlockContent');
  } catch (error) {
    // Fallback на другую модель при model_not_found
    if (error.code === 'model_not_found' && model === 'gpt-5-chat-latest') {
      console.warn('[OpenAI] gpt-5-chat-latest not available, falling back to gpt-4o');
      return generateBlockContent(systemPrompt, transcript, { ...options, model: 'gpt-4o' });
    }

    // Форматируем ошибку для пользователя
    if (error.status === 429) {
      throw new Error('Превышен лимит запросов к OpenAI API. Попробуйте позже.');
    }

    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Генерация сводки по случаю пациента на основе всех клинических заметок
 *
 * @param {string} clinicalNotesText - Анонимизированный текст всех клинических заметок
 * @param {Object} [options] - Дополнительные опции
 * @param {string} [options.model] - Модель OpenAI (по умолчанию 'gpt-5-chat-latest')
 * @param {number} [options.temperature] - Температура (по умолчанию 0.3)
 * @param {number} [options.maxTokens] - Максимальное количество токенов (по умолчанию 1500)
 * @returns {Promise<string>} Сгенерированная сводка
 */
export async function generateCaseSummaryContent(clinicalNotesText, options = {}) {
  const {
    model = 'gpt-5-chat-latest',
    temperature = 0.3,
    maxTokens = 1500,
  } = options;

  const systemPrompt = `Ты — опытный психиатр. На основе предоставленных клинических заметок
создай краткую сводку по случаю пациента.

Включи:
1. Основной диагноз / диагностическое впечатление
2. Ключевые симптомы и их динамика
3. Текущее лечение и его эффективность
4. Основные риски
5. Прогноз и рекомендации

Пиши кратко (3-5 абзацев), профессионально, от третьего лица.`;

  const makeRequest = async () => {
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Клинические заметки пациента:\n\n${clinicalNotesText}`,
        },
      ],
      temperature,
      max_tokens: maxTokens,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI API returned empty content');
    }

    return content;
  };

  try {
    return await executeWithRetry(makeRequest, 'generateCaseSummaryContent');
  } catch (error) {
    // Fallback на другую модель при model_not_found
    if (error.code === 'model_not_found' && model === 'gpt-5-chat-latest') {
      console.warn('[OpenAI] gpt-5-chat-latest not available, falling back to gpt-4o');
      return generateCaseSummaryContent(clinicalNotesText, { ...options, model: 'gpt-4o' });
    }

    // Форматируем ошибку для пользователя
    if (error.status === 429) {
      throw new Error('Превышен лимит запросов к OpenAI API. Попробуйте позже.');
    }

    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Генерация структурированной HTML сводки по случаю пациента
 * На основе всех клинических заметок и транскриптов всех сессий
 *
 * @param {string} clinicalNotesText - Анонимизированный текст всех клинических заметок
 * @param {string} transcriptsText - Анонимизированный текст всех транскриптов
 * @param {number} sessionsCount - Количество сессий
 * @param {string} firstSessionDate - Дата первой сессии
 * @param {string} lastSessionDate - Дата последней сессии
 * @param {Object} [options] - Дополнительные опции
 * @param {string} [options.model] - Модель OpenAI (по умолчанию 'gpt-5-chat-latest')
 * @param {number} [options.temperature] - Температура (по умолчанию 0.3)
 * @param {number} [options.maxTokens] - Максимальное количество токенов (по умолчанию 3000)
 * @returns {Promise<string>} Сгенерированная HTML сводка
 */
export async function generatePatientCaseSummaryContent(
  clinicalNotesText,
  transcriptsText,
  sessionsCount,
  firstSessionDate,
  lastSessionDate,
  options = {}
) {
  const {
    model = 'gpt-5-chat-latest',
    temperature = 0.3,
    maxTokens = 3000,
  } = options;

  const systemPrompt = `Ты — опытный психиатр. На основе предоставленных клинических заметок и транскриптов сессий
создай структурированную HTML сводку по случаю пациента.

ВАЖНО: Выводи ТОЛЬКО чистый HTML код, БЕЗ markdown разметки (без тройных обратных кавычек, без markdown блоков кода).
Начинай сразу с HTML тегов, без дополнительных символов или разметки.

Создай HTML документ со следующими разделами (используй теги <h2> для заголовков разделов):

1. <h2>Цели</h2> - терапевтические цели работы с пациентом, что планируется достичь
2. <h2>Альянс</h2> - качество терапевтического альянса, отношения между терапевтом и пациентом
3. <h2>История</h2> - краткая история случая, ключевые события и факты
4. <h2>Количество сессий</h2> - статистика: всего сессий (${sessionsCount}), первая сессия (${firstSessionDate || 'не указана'}), последняя сессия (${lastSessionDate || 'не указана'})
5. <h2>Прогресс</h2> - динамика и изменения, что изменилось за время работы, какие улучшения

Используй следующие HTML теги:
- <h2> для заголовков разделов
- <p> для параграфов
- <ul> и <li> для списков
- <strong> для важных моментов
- <em> для акцентов
- <br> для переносов строк (если нужно)

Пиши профессионально, от третьего лица. Каждый раздел должен быть информативным и содержательным.
HTML должен быть валидным и готовым для отображения в браузере.
НЕ используй markdown синтаксис - только чистый HTML, начинай сразу с тегов.`;

  const combinedText = transcriptsText
    ? `Клинические заметки пациента:\n\n${clinicalNotesText}\n\n\nТранскрипты сессий:\n\n${transcriptsText}`
    : `Клинические заметки пациента:\n\n${clinicalNotesText}`;

  const makeRequest = async () => {
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: combinedText,
        },
      ],
      temperature,
      max_tokens: maxTokens,
    });

    let content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI API returned empty content');
    }

    // Удаляем markdown разметку, если модель её добавила
    // Убираем ```html в начале и ``` в конце
    content = content.trim();
    if (content.startsWith('```html')) {
      content = content.replace(/^```html\s*/i, '');
    }
    if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '');
    }
    if (content.endsWith('```')) {
      content = content.replace(/\s*```$/, '');
    }
    content = content.trim();

    return content;
  };

  try {
    return await executeWithRetry(makeRequest, 'generatePatientCaseSummaryContent');
  } catch (error) {
    // Fallback на другую модель при model_not_found
    if (error.code === 'model_not_found' && model === 'gpt-5-chat-latest') {
      console.warn('[OpenAI] gpt-5-chat-latest not available, falling back to gpt-4o');
      return generatePatientCaseSummaryContent(
        clinicalNotesText,
        transcriptsText,
        sessionsCount,
        firstSessionDate,
        lastSessionDate,
        { ...options, model: 'gpt-4o' }
      );
    }

    // Форматируем ошибку для пользователя
    if (error.status === 429) {
      throw new Error('Превышен лимит запросов к OpenAI API. Попробуйте позже.');
    }

    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Проверяет, настроен ли OpenAI API ключ
 *
 * @returns {boolean}
 */
export function isOpenAIConfigured() {
  try {
    return !!process.env.OPENAI_API_KEY;
  } catch (error) {
    return false;
  }
}

