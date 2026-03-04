/**
 * Диагностика переменных окружения
 * Помогает определить, какие VITE_ переменные доступны в runtime
 */

// Список всех переменных окружения, которые должны быть настроены
const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

const OPTIONAL_ENV_VARS = [
  'VITE_AI_API_URL',
  'VITE_TRANSCRIPTION_API_URL',
  'VITE_ENCRYPTION_KEY',
] as const;

interface EnvDiagnostics {
  mode: 'development' | 'production';
  allViteVars: Record<string, string | undefined>;
  required: Record<string, { value: string | undefined; isSet: boolean; preview?: string }>;
  optional: Record<string, { value: string | undefined; isSet: boolean; preview?: string }>;
  summary: {
    missingRequired: string[];
    allRequiredSet: boolean;
    warnings: string[];
  };
}

/**
 * Получить диагностическую информацию о переменных окружения
 */
export function getEnvDiagnostics(): EnvDiagnostics {
  const mode = import.meta.env.MODE as 'development' | 'production';
  const dev = import.meta.env.DEV;
  
  // Получаем все VITE_ переменные из import.meta.env
  const allViteVars: Record<string, string | undefined> = {};
  const envObj = import.meta.env as Record<string, unknown>;
  
  // Собираем все переменные, начинающиеся с VITE_
  Object.keys(envObj).forEach(key => {
    if (key.startsWith('VITE_')) {
      allViteVars[key] = typeof envObj[key] === 'string' ? envObj[key] : undefined;
    }
  });
  
  // Проверяем обязательные переменные
  const required: Record<string, { value: string | undefined; isSet: boolean; preview?: string }> = {};
  const missingRequired: string[] = [];
  
  REQUIRED_ENV_VARS.forEach(varName => {
    const value = envObj[varName] as string | undefined;
    const isSet = !!(value && value.trim() && value !== 'your-anon-key-here' && value !== 'your-supabase-url-here');
    required[varName] = {
      value,
      isSet,
      preview: value ? (value.length > 50 ? `${value.substring(0, 50)}...` : value) : undefined,
    };
    if (!isSet) {
      missingRequired.push(varName);
    }
  });
  
  // Проверяем опциональные переменные
  const optional: Record<string, { value: string | undefined; isSet: boolean; preview?: string }> = {};
  const warnings: string[] = [];
  
  OPTIONAL_ENV_VARS.forEach(varName => {
    const value = envObj[varName] as string | undefined;
    // Улучшенная проверка: исключаем undefined, пустые строки, только пробелы, и placeholder значения
    const trimmedValue = value?.trim();
    const isPlaceholder = trimmedValue === '' ||
                         trimmedValue === `your-${varName.toLowerCase().replace('vite_', '').replace(/_/g, '-')}-here`;
    const isSet = !!(trimmedValue && !isPlaceholder);
    
    optional[varName] = {
      value,
      isSet,
      preview: value ? (value.length > 50 ? `${value.substring(0, 50)}...` : value) : undefined,
    };
    
  });
  
  return {
    mode,
    allViteVars,
    required,
    optional,
    summary: {
      missingRequired,
      allRequiredSet: missingRequired.length === 0,
      warnings,
    },
  };
}

/**
 * Вывести диагностическую информацию в консоль
 */
export function logEnvDiagnostics(): void {
  const diagnostics = getEnvDiagnostics();
  
  console.group('🔍 Диагностика переменных окружения');
  console.log(`Режим: ${diagnostics.mode} (${diagnostics.mode === 'production' ? 'PROD' : 'DEV'})`);
  console.log('');
  
  // Обязательные переменные
  console.group('📋 Обязательные переменные:');
  Object.entries(diagnostics.required).forEach(([name, info]) => {
    if (info.isSet) {
      console.log(`✅ ${name}: установлен`, info.preview ? `(${info.preview})` : '');
    } else {
      console.error(`❌ ${name}: НЕ УСТАНОВЛЕН`, info.value ? `(значение: ${info.value})` : '(undefined)');
    }
  });
  console.groupEnd();
  
  // Опциональные переменные
  console.group('📋 Опциональные переменные:');
  Object.entries(diagnostics.optional).forEach(([name, info]) => {
    if (info.isSet) {
      console.log(`✓ ${name}: установлен`, info.preview ? `(${info.preview})` : '');
    } else {
      console.warn(`⚠ ${name}: не установлен`);
    }
  });
  console.groupEnd();
  
  // Сводка
  console.group('📊 Сводка:');
  if (diagnostics.summary.allRequiredSet) {
    console.log('✅ Все обязательные переменные установлены');
  } else {
    console.error('❌ Отсутствуют обязательные переменные:', diagnostics.summary.missingRequired.join(', '));
    console.error('');
    console.error('⚠️ ВАЖНО: Переменные окружения встраиваются в код во время сборки (build time)!');
    console.error('   Если вы видите это в production, значит переменные не были доступны при сборке.');
    console.error('   Решение:');
    console.error('   1. Проверьте наличие переменных в .env или .env.production на сервере');
    console.error('   2. Пересоберите приложение с установленными переменными:');
    console.error('      export VITE_SUPABASE_URL=... && export VITE_SUPABASE_ANON_KEY=... && npm run build');
  }
  
  if (diagnostics.summary.warnings.length > 0) {
    console.warn('');
    console.warn('Предупреждения:');
    diagnostics.summary.warnings.forEach(warning => console.warn(`  ⚠ ${warning}`));
  }
  console.groupEnd();
  
  // Все доступные VITE_ переменные
  const viteVarNames = Object.keys(diagnostics.allViteVars);
  if (viteVarNames.length > 0) {
    console.group('🔧 Все доступные VITE_ переменные в runtime:');
    viteVarNames.forEach(name => {
      const value = diagnostics.allViteVars[name];
      const preview = value && value.length > 40 ? `${value.substring(0, 40)}...` : value;
      console.log(`  ${name}: ${preview || '(undefined)'}`);
    });
    console.groupEnd();
  } else {
    console.warn('⚠️ НЕ НАЙДЕНО НИ ОДНОЙ VITE_ ПЕРЕМЕННОЙ!');
    console.warn('   Это означает, что переменные не были встроены во время сборки.');
  }
  
  console.groupEnd();
}

/**
 * Проверить критичные переменные и выбросить ошибку, если они отсутствуют
 */
export function validateRequiredEnvVars(): void {
  const diagnostics = getEnvDiagnostics();
  
  if (!diagnostics.summary.allRequiredSet) {
    const errorMessage = `Отсутствуют обязательные переменные окружения: ${diagnostics.summary.missingRequired.join(', ')}. ` +
      `Переменные должны быть установлены во время сборки приложения.`;
    
    if (import.meta.env.DEV) {
      console.error('❌', errorMessage);
      console.error('   Установите переменные в .env.local и перезапустите dev-сервер.');
    } else {
      console.error('❌', errorMessage);
      console.error('   Для production: пересоберите приложение с установленными переменными окружения.');
    }
    
    // В production не выбрасываем ошибку, чтобы не сломать приложение полностью
    // Просто логируем и продолжаем
  }
}
