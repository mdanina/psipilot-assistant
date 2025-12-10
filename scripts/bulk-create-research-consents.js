#!/usr/bin/env node

/**
 * Скрипт для массового создания согласий на исследования
 * 
 * ⚠️  ВНИМАНИЕ: Используйте с осторожностью!
 * Этот скрипт создает согласия для всех пациентов клиники.
 * Убедитесь, что у вас есть юридическое право на это.
 * 
 * Использование:
 *   node scripts/bulk-create-research-consents.js [options]
 * 
 * Опции:
 *   --clinic-id, -c      UUID клиники (если не указан, создаст для всех клиник)
 *   --dry-run            Только показать, что будет создано, без реального создания
 *   --expires, -e         Дата истечения (ISO format)
 *   --url                URL Supabase
 *   --service-key        Service Role Key
 * 
 * Примеры:
 *   node scripts/bulk-create-research-consents.js --dry-run
 *   node scripts/bulk-create-research-consents.js --clinic-id "clinic-uuid" --expires "2025-12-31T23:59:59Z"
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

// Парсинг аргументов
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    clinicId: null,
    dryRun: false,
    expires: null,
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === '--clinic-id' || arg === '-c') && nextArg) {
      options.clinicId = nextArg;
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if ((arg === '--expires' || arg === '-e') && nextArg) {
      options.expires = nextArg;
      i++;
    } else if (arg === '--url' && nextArg) {
      options.url = nextArg;
      i++;
    } else if (arg === '--service-key' && nextArg) {
      options.serviceKey = nextArg;
      i++;
    }
  }

  if (!options.url) {
    console.error('❌ Ошибка: Не указан URL Supabase');
    process.exit(1);
  }

  if (!options.serviceKey) {
    console.error('❌ Ошибка: Не указан Service Role Key');
    process.exit(1);
  }

  return options;
}

async function bulkCreateConsents() {
  try {
    const { clinicId, dryRun, expires, url, serviceKey } = parseArgs();

    console.log('🔬 Массовое создание согласий на исследования...\n');
    if (dryRun) {
      console.log('⚠️  РЕЖИМ ПРОВЕРКИ (dry-run): изменения не будут сохранены\n');
    }
    if (clinicId) {
      console.log(`🏥 Клиника: ${clinicId}`);
    } else {
      console.log(`🏥 Клиника: все клиники`);
    }
    console.log(`📅 Истекает: ${expires || 'не ограничено'}\n`);

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Получаем список пациентов
    console.log('⏳ Получение списка пациентов...');
    let query = supabaseAdmin
      .from('patients')
      .select('id, name, clinic_id')
      .is('deleted_at', null);

    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    const { data: patients, error: patientsError } = await query;

    if (patientsError) {
      console.error('❌ Ошибка при получении пациентов:', patientsError.message);
      process.exit(1);
    }

    if (!patients || patients.length === 0) {
      console.log('ℹ️  Пациенты не найдены');
      process.exit(0);
    }

    console.log(`✅ Найдено пациентов: ${patients.length}\n`);

    // Проверяем существующие согласия
    console.log('⏳ Проверка существующих согласий...');
    const patientIds = patients.map(p => p.id);
    const { data: existingConsents, error: consentsError } = await supabaseAdmin
      .from('consent_records')
      .select('patient_id')
      .in('patient_id', patientIds)
      .eq('consent_type', 'research')
      .eq('status', 'active');

    if (consentsError) {
      console.error('❌ Ошибка при проверке согласий:', consentsError.message);
      process.exit(1);
    }

    const patientsWithConsent = new Set(existingConsents?.map(c => c.patient_id) || []);
    const patientsNeedingConsent = patients.filter(p => !patientsWithConsent.has(p.id));

    console.log(`✅ У ${patientsWithConsent.size} пациентов уже есть согласие`);
    console.log(`📝 Нужно создать согласие для ${patientsNeedingConsent.length} пациентов\n`);

    if (patientsNeedingConsent.length === 0) {
      console.log('✅ Все пациенты уже имеют согласие на исследования');
      process.exit(0);
    }

    if (dryRun) {
      console.log('📋 Пациенты, для которых будет создано согласие:');
      patientsNeedingConsent.forEach((patient, index) => {
        console.log(`   ${index + 1}. ${patient.name || 'Без имени'} (${patient.id})`);
      });
      console.log('\n⚠️  Это был режим проверки. Для реального создания запустите без --dry-run');
      process.exit(0);
    }

    // Создаем согласия
    console.log('⏳ Создание согласий...');
    const consentsToCreate = patientsNeedingConsent.map(patient => ({
      patient_id: patient.id,
      consent_type: 'research',
      consent_purpose: 'Использование полностью деидентифицированных медицинских данных для научных исследований и разработки методов лечения. Данные будут использованы только в анонимном виде, без возможности идентификации пациента.',
      legal_basis: 'consent',
      status: 'active',
      given_at: new Date().toISOString(),
      expires_at: expires || null,
      consent_method: 'electronic',
      collected_by: null,
      data_categories: ['personal', 'health'],
      third_party_sharing: true,
      third_parties: ['Исследователи (анонимные данные)'],
      notes: 'Массово создано через скрипт bulk-create-research-consents.js. Данные будут полностью деидентифицированы перед предоставлением исследователям.',
    }));

    const { data: createdConsents, error: createError } = await supabaseAdmin
      .from('consent_records')
      .insert(consentsToCreate)
      .select();

    if (createError) {
      console.error('❌ Ошибка при создании согласий:', createError.message);
      process.exit(1);
    }

    console.log(`✅ Успешно создано ${createdConsents?.length || 0} согласий на исследования`);
    console.log('\n✅ Готово! Теперь исследователи могут получить доступ к деидентифицированным данным этих пациентов.');

  } catch (error) {
    console.error('❌ Неожиданная ошибка:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

bulkCreateConsents();

