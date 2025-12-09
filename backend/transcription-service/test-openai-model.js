/**
 * Тестовый скрипт для проверки работоспособности модели gpt-5-chat-latest
 * 
 * Использование:
 * node test-openai-model.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateBlockContent } from './services/openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '.env') });

async function testModel() {
  console.log('🧪 Тестирование модели gpt-5-chat-latest...\n');

  try {
    // Проверяем наличие API ключа
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Ошибка: OPENAI_API_KEY не установлен в .env файле');
      process.exit(1);
    }

    console.log('✅ API ключ найден');
    console.log('📝 Отправка тестового запроса...\n');

    // Тестовый промпт
    const testSystemPrompt = 'Ты — помощник. Ответь кратко на русском языке.';
    const testTranscript = 'Это тестовый транскрипт для проверки работы API.';

    // Тестируем с новой моделью
    const result = await generateBlockContent(testSystemPrompt, testTranscript, {
      model: 'gpt-5-chat-latest',
      temperature: 0.3,
      maxTokens: 100,
    });

    console.log('✅ Запрос успешно выполнен!');
    console.log('\n📄 Ответ модели:');
    console.log('─'.repeat(50));
    console.log(result);
    console.log('─'.repeat(50));
    console.log('\n✅ Модель gpt-5-chat-latest работает корректно!');

  } catch (error) {
    console.error('\n❌ Ошибка при тестировании:');
    console.error('─'.repeat(50));
    
    if (error.code === 'model_not_found') {
      console.error('⚠️  Модель gpt-5-chat-latest не найдена');
      console.error('💡 Проверьте, что модель доступна в вашем аккаунте OpenAI');
      console.error('💡 Система автоматически использует fallback на gpt-4o');
    } else if (error.status === 401) {
      console.error('⚠️  Неверный API ключ');
      console.error('💡 Проверьте правильность OPENAI_API_KEY в .env файле');
    } else if (error.status === 429) {
      console.error('⚠️  Превышен лимит запросов');
      console.error('💡 Попробуйте позже');
    } else {
      console.error(`Код ошибки: ${error.code || error.status}`);
      console.error(`Сообщение: ${error.message}`);
    }
    
    console.error('─'.repeat(50));
    process.exit(1);
  }
}

// Запускаем тест
testModel();

