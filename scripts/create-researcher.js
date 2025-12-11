#!/usr/bin/env node

/**
 * Скрипт для создания исследователей через Supabase Admin API
 * 
 * Исследователи имеют роль 'researcher' и НЕ привязаны к клинике (clinic_id = NULL)
 * 
 * Использование:
 *   node scripts/create-researcher.js <email> <password> [options]
 * 
 * Опции:
 *   --name, -n        Полное имя исследователя
 *   --organization   Название организации/института
 *   --url             URL Supabase (по умолчанию из .env.local)
 *   --service-key     Service Role Key (по умолчанию из .env.local)
 * 
 * Примеры:
 *   node scripts/create-researcher.js researcher@university.edu password123
 *   node scripts/create-researcher.js researcher@university.edu password123 --name "Доктор Иванов" --organization "МГУ"
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
const envPath = join(__dirname, '..', '.env.local');
try {
  config({ path: envPath });
} catch (err) {
  console.warn('⚠️  Не удалось загрузить .env.local, используем переменные окружения системы');
}

// Парсинг аргументов командной строки
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('❌ Ошибка: Недостаточно аргументов');
    console.log('\nИспользование:');
    console.log('  node scripts/create-researcher.js <email> <password> [options]');
    console.log('\nОпции:');
    console.log('  --name, -n        Полное имя исследователя');
    console.log('  --organization    Название организации/института');
    console.log('  --url             URL Supabase');
    console.log('  --service-key     Service Role Key');
    console.log('\nПримеры:');
    console.log('  node scripts/create-researcher.js researcher@university.edu password123');
    console.log('  node scripts/create-researcher.js researcher@university.edu password123 --name "Доктор Иванов" --organization "МГУ"');
    process.exit(1);
  }

  const email = args[0];
  const password = args[1];
  const options = {
    name: null,
    organization: null,
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === '--name' || arg === '-n') && nextArg) {
      options.name = nextArg;
      i++;
    } else if (arg === '--organization' && nextArg) {
      options.organization = nextArg;
      i++;
    } else if (arg === '--url' && nextArg) {
      options.url = nextArg;
      i++;
    } else if (arg === '--service-key' && nextArg) {
      options.serviceKey = nextArg;
      i++;
    }
  }

  // Валидация
  if (!email || !email.includes('@')) {
    console.error('❌ Ошибка: Некорректный email');
    process.exit(1);
  }

  if (!password || password.length < 6) {
    console.error('❌ Ошибка: Пароль должен содержать минимум 6 символов');
    process.exit(1);
  }

  if (!options.url) {
    console.error('❌ Ошибка: Не указан URL Supabase');
    console.error('   Укажите через --url или установите VITE_SUPABASE_URL в .env.local');
    process.exit(1);
  }

  if (!options.serviceKey) {
    console.error('❌ Ошибка: Не указан Service Role Key');
    console.error('   Укажите через --service-key или установите SUPABASE_SERVICE_ROLE_KEY в .env.local');
    console.error('   ⚠️  ВАЖНО: Service Role Key имеет полный доступ к базе данных!');
    console.error('   Никогда не коммитьте его в репозиторий!');
    process.exit(1);
  }

  return { email, password, ...options };
}

async function createResearcher() {
  try {
    const { email, password, name, organization, url, serviceKey } = parseArgs();

    console.log('🔬 Создание исследователя через Supabase Admin API...\n');
    console.log(`📧 Email: ${email}`);
    console.log(`👤 Имя: ${name || 'не указано'}`);
    if (organization) {
      console.log(`🏛️  Организация: ${organization}`);
    }
    console.log(`🎭 Роль: researcher`);
    console.log(`🏥 Клиника: не привязана (NULL)`);
    console.log(`🔗 URL: ${url}\n`);

    // Создаем клиент с service_role ключом
    const supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Создаем пользователя
    console.log('⏳ Создание пользователя в auth.users...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Автоматически подтверждаем email
      user_metadata: {
        full_name: name || email,
        organization: organization || null,
      },
    });

    if (authError) {
      console.error('❌ Ошибка при создании пользователя:', authError.message);
      process.exit(1);
    }

    if (!authData.user) {
      console.error('❌ Ошибка: Пользователь не был создан');
      process.exit(1);
    }

    const userId = authData.user.id;
    console.log(`✅ Пользователь создан в auth.users: ${userId}`);

    // Ждем немного, чтобы триггер создал профиль
    console.log('⏳ Ожидание создания профиля (триггер)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Обновляем профиль: устанавливаем роль 'researcher' и clinic_id = NULL
    console.log('⏳ Обновление профиля (роль: researcher, clinic_id: NULL)...');
    const updates = {
      role: 'researcher',
      clinic_id: null, // Исследователи не привязаны к клинике
    };
    
    if (name) {
      updates.full_name = name;
    }

    // Сохраняем информацию об организации в settings
    if (organization) {
      updates.settings = { organization };
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (profileError) {
      console.error('❌ Ошибка при обновлении профиля:', profileError.message);
      console.error('   Попробуйте обновить профиль вручную через админ-панель:');
      console.error(`   UPDATE profiles SET role = 'researcher', clinic_id = NULL WHERE id = '${userId}';`);
      process.exit(1);
    }

    console.log('✅ Профиль обновлен');

    // Проверяем, что профиль создан правильно
    const { data: profile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileCheckError || !profile) {
      console.error('❌ Ошибка: Не удалось проверить профиль');
      process.exit(1);
    }

    // Проверяем, что роль установлена правильно
    if (profile.role !== 'researcher') {
      console.error(`❌ Ошибка: Роль не установлена правильно. Текущая роль: ${profile.role}`);
      console.error('   Ожидалось: researcher');
      process.exit(1);
    }

    if (profile.clinic_id !== null) {
      console.warn('⚠️  Предупреждение: clinic_id не NULL. Исследователи должны быть без клиники.');
      console.warn('   Обновляю clinic_id на NULL...');
      await supabaseAdmin
        .from('profiles')
        .update({ clinic_id: null })
        .eq('id', userId);
    }

    console.log('\n📋 Информация о профиле исследователя:');
    console.log(`   ID: ${profile.id}`);
    console.log(`   Email: ${profile.email}`);
    console.log(`   Имя: ${profile.full_name || 'не указано'}`);
    console.log(`   Роль: ${profile.role}`);
    console.log(`   Клиника: ${profile.clinic_id || 'не привязана (NULL)'}`);
    if (organization) {
      console.log(`   Организация: ${organization}`);
    }

    console.log('\n✅ Исследователь успешно создан!');
    console.log(`\n📝 Данные для входа:`);
    console.log(`   Email: ${email}`);
    console.log(`   Пароль: ${password}`);
    console.log(`\n🔗 API Endpoints:`);
    console.log(`   Health: GET ${url.replace('/rest/v1', '')}/api/research/health`);
    console.log(`   Stats: GET ${url.replace('/rest/v1', '')}/api/research/stats`);
    console.log(`   Transcripts: GET ${url.replace('/rest/v1', '')}/api/research/anonymized-transcripts`);
    console.log(`\n📖 Использование API:`);
    console.log(`   1. Получите JWT токен через Supabase Auth:`);
    console.log(`      POST ${url.replace('/rest/v1', '')}/auth/v1/token?grant_type=password`);
    console.log(`   2. Используйте токен в заголовке:`);
    console.log(`      Authorization: Bearer <jwt-token>`);
    console.log(`\n⚠️  Сохраните эти данные в безопасном месте!`);

  } catch (error) {
    console.error('❌ Неожиданная ошибка:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

createResearcher();

