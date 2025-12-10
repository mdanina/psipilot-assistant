#!/usr/bin/env node

/**
 * Скрипт для создания согласия на передачу данных третьим лицам (data_sharing)
 * 
 * Использование:
 *   node scripts/create-data-sharing-consent.js <patient-id> [options]
 * 
 * Опции:
 *   --purpose, -p        Цель использования данных (по умолчанию: стандартный текст)
 *   --expires, -e        Дата истечения (ISO format, например: 2025-12-31T23:59:59Z)
 *   --method, -m         Способ получения согласия (written, electronic, verbal_recorded) - по умолчанию: electronic
 *   --third-parties      Список третьих сторон через запятую (по умолчанию: AssemblyAI, OpenAI)
 *   --url                URL Supabase (по умолчанию из .env.local)
 *   --service-key        Service Role Key (по умолчанию из .env.local)
 * 
 * Примеры:
 *   node scripts/create-data-sharing-consent.js "patient-uuid-here"
 *   node scripts/create-data-sharing-consent.js "patient-uuid-here" --expires "2025-12-31T23:59:59Z"
 *   node scripts/create-data-sharing-consent.js "patient-uuid-here" --third-parties "AssemblyAI,OpenAI,Whisper API"
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
  
  if (args.length < 1) {
    console.error('❌ Ошибка: Недостаточно аргументов');
    console.log('\nИспользование:');
    console.log('  node scripts/create-data-sharing-consent.js <patient-id> [options]');
    console.log('\nОпции:');
    console.log('  --purpose, -p        Цель использования данных');
    console.log('  --expires, -e        Дата истечения (ISO format)');
    console.log('  --method, -m         Способ получения согласия (written, electronic, verbal_recorded)');
    console.log('  --third-parties      Список третьих сторон через запятую');
    console.log('  --url                URL Supabase');
    console.log('  --service-key        Service Role Key');
    console.log('\nПримеры:');
    console.log('  node scripts/create-data-sharing-consent.js "patient-uuid-here"');
    console.log('  node scripts/create-data-sharing-consent.js "patient-uuid-here" --expires "2025-12-31T23:59:59Z"');
    console.log('  node scripts/create-data-sharing-consent.js "patient-uuid-here" --third-parties "AssemblyAI,OpenAI"');
    process.exit(1);
  }

  const patientId = args[0];
  const options = {
    purpose: 'Передача персональных данных третьим лицам для оказания медицинских услуг: транскрипция аудиозаписей (AssemblyAI) и генерация клинических заметок (OpenAI). Данные передаются в анонимизированном виде, где это возможно.',
    expires: null,
    method: 'electronic',
    thirdParties: ['AssemblyAI (США)', 'OpenAI (США)'],
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === '--purpose' || arg === '-p') && nextArg) {
      options.purpose = nextArg;
      i++;
    } else if ((arg === '--expires' || arg === '-e') && nextArg) {
      options.expires = nextArg;
      i++;
    } else if ((arg === '--method' || arg === '-m') && nextArg) {
      if (!['written', 'electronic', 'verbal_recorded'].includes(nextArg)) {
        console.error('❌ Ошибка: Некорректный способ получения согласия. Допустимые значения: written, electronic, verbal_recorded');
        process.exit(1);
      }
      options.method = nextArg;
      i++;
    } else if (arg === '--third-parties' && nextArg) {
      options.thirdParties = nextArg.split(',').map(s => s.trim());
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
  if (!patientId || patientId.length < 36) {
    console.error('❌ Ошибка: Некорректный UUID пациента');
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

  return { patientId, ...options };
}

async function createDataSharingConsent() {
  try {
    const { patientId, purpose, expires, method, thirdParties, url, serviceKey } = parseArgs();

    console.log('📤 Создание согласия на передачу данных третьим лицам...\n');
    console.log(`👤 Пациент: ${patientId}`);
    console.log(`📝 Цель: ${purpose}`);
    console.log(`📅 Истекает: ${expires || 'не ограничено'}`);
    console.log(`📋 Способ: ${method}`);
    console.log(`🌐 Третьи стороны: ${thirdParties.join(', ')}`);
    console.log(`🔗 URL: ${url}\n`);

    // Создаем клиент с service_role ключом
    const supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Проверяем, существует ли пациент
    console.log('⏳ Проверка существования пациента...');
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, name, clinic_id')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      console.error('❌ Ошибка: Пациент не найден');
      console.error('   Проверьте правильность UUID пациента');
      process.exit(1);
    }

    console.log(`✅ Пациент найден: ${patient.name || 'Без имени'}`);

    // Проверяем, есть ли уже активное согласие на data_sharing
    console.log('⏳ Проверка существующих согласий...');
    const { data: existingConsents, error: checkError } = await supabaseAdmin
      .from('consent_records')
      .select('*')
      .eq('patient_id', patientId)
      .eq('consent_type', 'data_sharing')
      .eq('status', 'active');

    if (checkError) {
      console.error('❌ Ошибка при проверке согласий:', checkError.message);
      process.exit(1);
    }

    // Фильтруем по expires_at
    const activeConsents = existingConsents?.filter(consent => {
      if (consent.expires_at) {
        return new Date(consent.expires_at) > new Date();
      }
      return true;
    }) || [];

    if (activeConsents.length > 0) {
      console.log('⚠️  Предупреждение: У пациента уже есть активное согласие на передачу данных');
      console.log(`   ID согласия: ${activeConsents[0].id}`);
      console.log(`   Создано: ${new Date(activeConsents[0].created_at).toLocaleString()}`);
      console.log(`   Третьи стороны: ${activeConsents[0].third_parties?.join(', ') || 'не указаны'}`);
      console.log('\n   Хотите создать новое согласие? (y/n)');
      // В простом скрипте просто продолжаем, но можно добавить интерактивность
      console.log('   Продолжаем создание нового согласия...\n');
    }

    // Создаем согласие
    console.log('⏳ Создание согласия на передачу данных...');
    const consentData = {
      patient_id: patientId,
      consent_type: 'data_sharing',
      consent_purpose: purpose,
      legal_basis: 'consent', // Для передачи данных третьим лицам требуется явное согласие
      status: 'active',
      given_at: new Date().toISOString(),
      expires_at: expires || null,
      consent_method: method,
      collected_by: null, // Можно указать ID пользователя, если нужно
      data_categories: ['personal', 'health'],
      third_party_sharing: true,
      third_parties: thirdParties,
      notes: 'Создано через скрипт create-data-sharing-consent.js. Необходимо для работы сервисов транскрипции и AI-анализа.',
    };

    const { data: consent, error: consentError } = await supabaseAdmin
      .from('consent_records')
      .insert(consentData)
      .select()
      .single();

    if (consentError) {
      console.error('❌ Ошибка при создании согласия:', consentError.message);
      process.exit(1);
    }

    console.log('✅ Согласие успешно создано!');
    console.log('\n📋 Информация о согласии:');
    console.log(`   ID: ${consent.id}`);
    console.log(`   Тип: ${consent.consent_type}`);
    console.log(`   Статус: ${consent.status}`);
    console.log(`   Создано: ${new Date(consent.created_at).toLocaleString()}`);
    if (consent.expires_at) {
      console.log(`   Истекает: ${new Date(consent.expires_at).toLocaleString()}`);
    } else {
      console.log(`   Истекает: не ограничено`);
    }
    console.log(`   Способ: ${consent.consent_method}`);
    console.log(`   Третьи стороны: ${consent.third_parties?.join(', ') || 'не указаны'}`);

    console.log('\n✅ Готово! Теперь данные пациента могут быть переданы указанным третьим сторонам для обработки.');

  } catch (error) {
    console.error('❌ Неожиданная ошибка:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

createDataSharingConsent();

