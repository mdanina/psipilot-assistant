import OpenAI from 'openai';

/**
 * Сервис для работы с OpenAI API
 * Генерирует контент для блоков клинических заметок и сводок
 */

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
 * Генерация контента для одного блока клинической заметки
 * 
 * @param {string} systemPrompt - Системный промпт для блока
 * @param {string} transcript - Анонимизированный транскрипт сессии
 * @param {Object} [options] - Дополнительные опции
 * @param {string} [options.model] - Модель OpenAI (по умолчанию 'gpt-4o')
 * @param {number} [options.temperature] - Температура (по умолчанию 0.3)
 * @param {number} [options.maxTokens] - Максимальное количество токенов (по умолчанию 1000)
 * @returns {Promise<string>} Сгенерированный контент
 */
export async function generateBlockContent(systemPrompt, transcript, options = {}) {
  try {
    const openai = getOpenAIClient();
    
    const {
      model = 'gpt-4o', // Используем gpt-4o как fallback, если gpt-5 недоступна
      temperature = 0.3,
      maxTokens = 1000,
    } = options;

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
  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Обработка ошибок rate limit
    if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    }
    
    // Обработка ошибок модели
    if (error.code === 'model_not_found' && options.model === 'gpt-5') {
      console.warn('GPT-5 not available, falling back to gpt-4o');
      // Рекурсивный вызов с fallback моделью
      return generateBlockContent(systemPrompt, transcript, { ...options, model: 'gpt-4o' });
    }
    
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Генерация сводки по случаю пациента на основе всех клинических заметок
 * 
 * @param {string} clinicalNotesText - Анонимизированный текст всех клинических заметок
 * @param {Object} [options] - Дополнительные опции
 * @param {string} [options.model] - Модель OpenAI (по умолчанию 'gpt-4o')
 * @param {number} [options.temperature] - Температура (по умолчанию 0.3)
 * @param {number} [options.maxTokens] - Максимальное количество токенов (по умолчанию 1500)
 * @returns {Promise<string>} Сгенерированная сводка
 */
export async function generateCaseSummaryContent(clinicalNotesText, options = {}) {
  try {
    const openai = getOpenAIClient();
    
    const {
      model = 'gpt-4o',
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
  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Обработка ошибок rate limit
    if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    }
    
    // Обработка ошибок модели
    if (error.code === 'model_not_found' && options.model === 'gpt-5') {
      console.warn('GPT-5 not available, falling back to gpt-4o');
      return generateCaseSummaryContent(clinicalNotesText, { ...options, model: 'gpt-4o' });
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
