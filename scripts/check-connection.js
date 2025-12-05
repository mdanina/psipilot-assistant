/**
 * Скрипт для проверки подключения к Supabase
 * Запуск: node scripts/check-connection.js
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения из .env.local
config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('🔍 Проверка подключения к Supabase...\n');

// Проверка переменных окружения
if (!supabaseUrl) {
  console.error('❌ Ошибка: VITE_SUPABASE_URL не установлен');
  console.log('💡 Создайте файл .env.local и добавьте VITE_SUPABASE_URL');
  process.exit(1);
}

if (!supabaseAnonKey || supabaseAnonKey === 'your-anon-key-here') {
  console.error('❌ Ошибка: VITE_SUPABASE_ANON_KEY не установлен или имеет значение по умолчанию');
  console.log('💡 Добавьте VITE_SUPABASE_ANON_KEY в .env.local');
  process.exit(1);
}

console.log('✅ Переменные окружения найдены:');
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Key: ${supabaseAnonKey.substring(0, 20)}...\n`);

// Создаем клиент
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Тестируем подключение
async function testConnection() {
  try {
    console.log('🔄 Тестирование подключения...');
    
    // Простой запрос к базе данных
    const { data, error } = await supabase
      .from('clinics')
      .select('count')
      .limit(1);
    
    if (error) {
      // Если таблица не существует, это нормально (миграции еще не применены)
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.log('⚠️  Таблица clinics не найдена');
        console.log('💡 Выполните миграции из папки supabase/migrations\n');
        return;
      }
      
      // Другие ошибки
      if (error.message.includes('Invalid API key')) {
        console.error('❌ Ошибка: Неверный API ключ');
        console.log('💡 Проверьте VITE_SUPABASE_ANON_KEY в .env.local');
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.error('❌ Ошибка: Не удалось подключиться к Supabase');
        console.log('💡 Проверьте:');
        console.log('   1. Доступен ли Supabase по адресу:', supabaseUrl);
        console.log('   2. Правильно ли настроен CORS');
        console.log('   3. Работает ли Supabase сервис');
      } else {
        console.error('❌ Ошибка подключения:', error.message);
        console.error('   Код:', error.code);
      }
      process.exit(1);
    }
    
    console.log('✅ Подключение успешно!');
    console.log('✅ База данных доступна');
    console.log('✅ Миграции применены\n');
    
    // Дополнительная проверка таблиц
    console.log('🔍 Проверка структуры базы данных...');
    const tables = ['clinics', 'profiles', 'patients', 'sessions', 'clinical_notes'];
    
    for (const table of tables) {
      const { error: tableError } = await supabase
        .from(table)
        .select('count')
        .limit(1);
      
      if (tableError && tableError.code !== 'PGRST116') {
        console.log(`   ⚠️  Таблица ${table}: ${tableError.message}`);
      } else {
        console.log(`   ✅ Таблица ${table} существует`);
      }
    }
    
    console.log('\n🎉 Все проверки пройдены!');
    console.log('💡 Теперь можно запустить: npm run dev\n');
    
  } catch (err) {
    console.error('❌ Критическая ошибка:', err.message);
    process.exit(1);
  }
}

testConnection();

