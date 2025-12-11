#!/usr/bin/env node

/**
 * Скрипт для создания пользователей через Supabase Admin API
 * 
 * Использование:
 *   node scripts/create-user.js <email> <password> [options]
 * 
 * Опции:
 *   --name, -n        Полное имя пользователя
 *   --role, -r        Роль (admin, specialist, assistant) - по умолчанию: specialist
 *   --clinic-id, -c   UUID клиники для привязки пользователя
 *   --url             URL Supabase (по умолчанию из .env.local)
 *   --service-key     Service Role Key (по умолчанию из .env.local)
 * 
 * Примеры:
 *   node scripts/create-user.js user@example.com password123
 *   node scripts/create-user.js user@example.com password123 --name "Иван Иванов" --role admin
 *   node scripts/create-user.js user@example.com password123 --clinic-id "uuid-here"
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
    console.log('  node scripts/create-user.js <email> <password> [options]');
    console.log('\nОпции:');
    console.log('  --name, -n        Полное имя пользователя');
    console.log('  --role, -r        Роль (admin, specialist, assistant)');
    console.log('  --clinic-id, -c   UUID клиники для привязки');
    console.log('  --url             URL Supabase');
    console.log('  --service-key     Service Role Key');
    console.log('\nПримеры:');
    console.log('  node scripts/create-user.js user@example.com password123');
    console.log('  node scripts/create-user.js user@example.com password123 --name "Иван Иванов" --role admin');
    console.log('  node scripts/create-user.js user@example.com password123 --clinic-id "uuid-here"');
    process.exit(1);
  }

  const email = args[0];
  const password = args[1];
  const options = {
    name: null,
    role: 'specialist',
    clinicId: null,
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === '--name' || arg === '-n') && nextArg) {
      options.name = nextArg;
      i++;
    } else if ((arg === '--role' || arg === '-r') && nextArg) {
      options.role = nextArg;
      i++;
    } else if ((arg === '--clinic-id' || arg === '-c') && nextArg) {
      options.clinicId = nextArg;
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

  if (!['admin', 'specialist', 'assistant', 'doctor'].includes(options.role)) {
    console.error('❌ Ошибка: Некорректная роль. Допустимые значения: admin, specialist, assistant');
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

async function createUser() {
  try {
    const { email, password, name, role, clinicId, url, serviceKey } = parseArgs();

    console.log('🔐 Создание пользователя через Supabase Admin API...\n');
    console.log(`📧 Email: ${email}`);
    console.log(`👤 Имя: ${name || 'не указано'}`);
    console.log(`🎭 Роль: ${role}`);
    if (clinicId) {
      console.log(`🏥 Клиника: ${clinicId}`);
    }
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

    // Обновляем профиль (роль и клиника)
    const updates = {};
    if (role) {
      updates.role = role;
    }
    if (clinicId) {
      updates.clinic_id = clinicId;
    }
    if (name) {
      updates.full_name = name;
    }

    if (Object.keys(updates).length > 0) {
      console.log('⏳ Обновление профиля...');
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (profileError) {
        console.warn('⚠️  Предупреждение: Не удалось обновить профиль:', profileError.message);
        console.warn('   Профиль создан, но роль и клиника не установлены.');
        console.warn('   Вы можете обновить их вручную через админ-панель.');
      } else {
        console.log('✅ Профиль обновлен');
      }
    }

    // Проверяем, что профиль создан
    const { data: profile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileCheckError || !profile) {
      console.warn('⚠️  Предупреждение: Не удалось проверить профиль');
    } else {
      console.log('\n📋 Информация о профиле:');
      console.log(`   ID: ${profile.id}`);
      console.log(`   Email: ${profile.email}`);
      console.log(`   Имя: ${profile.full_name || 'не указано'}`);
      console.log(`   Роль: ${profile.role || 'не установлена'}`);
      console.log(`   Клиника: ${profile.clinic_id || 'не привязана'}`);
    }

    console.log('\n✅ Пользователь успешно создан!');
    console.log(`\n📝 Данные для входа:`);
    console.log(`   Email: ${email}`);
    console.log(`   Пароль: ${password}`);
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

createUser();

