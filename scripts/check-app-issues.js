import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔍 Проверка возможных проблем с приложением...\n');

// 1. Проверка .env.local
console.log('1️⃣ Проверка .env.local...');
const envPath = join(rootDir, '.env.local');
if (!existsSync(envPath)) {
  console.error('❌ Файл .env.local не найден!');
  console.log('   Создайте файл .env.local с переменными:');
  console.log('   VITE_SUPABASE_URL=...');
  console.log('   VITE_SUPABASE_ANON_KEY=...');
  console.log('   VITE_ENCRYPTION_KEY=...\n');
} else {
  const envContent = readFileSync(envPath, 'utf-8');
  const hasUrl = envContent.includes('VITE_SUPABASE_URL');
  const hasKey = envContent.includes('VITE_SUPABASE_ANON_KEY');
  
  if (!hasUrl) {
    console.warn('⚠️  VITE_SUPABASE_URL не найден в .env.local');
  } else {
    console.log('✅ VITE_SUPABASE_URL найден');
  }
  
  if (!hasKey) {
    console.warn('⚠️  VITE_SUPABASE_ANON_KEY не найден в .env.local');
  } else {
    console.log('✅ VITE_SUPABASE_ANON_KEY найден');
  }
  
  if (!envContent.includes('VITE_ENCRYPTION_KEY')) {
    console.warn('⚠️  VITE_ENCRYPTION_KEY не найден (опционально, но рекомендуется)');
  } else {
    console.log('✅ VITE_ENCRYPTION_KEY найден');
  }
  console.log('');
}

// 2. Проверка ключевых файлов
console.log('2️⃣ Проверка ключевых файлов...');
const keyFiles = [
  'src/App.tsx',
  'src/main.tsx',
  'src/contexts/AuthContext.tsx',
  'src/components/auth/SessionTimeoutWarning.tsx',
  'src/lib/supabase.ts',
];

let allFilesExist = true;
for (const file of keyFiles) {
  const filePath = join(rootDir, file);
  if (existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.error(`❌ ${file} не найден!`);
    allFilesExist = false;
  }
}
console.log('');

// 3. Проверка импортов в App.tsx
console.log('3️⃣ Проверка импортов в App.tsx...');
try {
  const appPath = join(rootDir, 'src/App.tsx');
  const appContent = readFileSync(appPath, 'utf-8');
  
  const requiredImports = [
    'AuthProvider',
    'SessionTimeoutWarning',
    'QueryClientProvider',
  ];
  
  for (const imp of requiredImports) {
    if (appContent.includes(imp)) {
      console.log(`✅ Импорт ${imp} найден`);
    } else {
      console.error(`❌ Импорт ${imp} не найден!`);
    }
  }
  console.log('');
} catch (error) {
  console.error('❌ Ошибка при чтении App.tsx:', error.message);
  console.log('');
}

// 4. Проверка dev сервера
console.log('4️⃣ Проверка dev сервера...');
try {
  const http = await import('http');
  const checkServer = () => {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/',
        method: 'GET',
        timeout: 2000,
      }, (res) => {
        resolve({ running: true, status: res.statusCode });
      });
      
      req.on('error', () => {
        resolve({ running: false });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ running: false });
      });
      
      req.end();
    });
  };
  
  const serverStatus = await checkServer();
  if (serverStatus.running) {
    console.log('✅ Dev сервер запущен на порту 3000');
  } else {
    console.error('❌ Dev сервер НЕ запущен на порту 3000');
    console.log('   Запустите: npm run dev');
  }
  console.log('');
} catch (error) {
  console.warn('⚠️  Не удалось проверить dev сервер автоматически');
  console.log('');
}

// 5. Рекомендации
console.log('💡 Рекомендации:');
console.log('   1. Откройте консоль браузера (F12) и проверьте ошибки');
console.log('   2. Убедитесь, что dev сервер запущен: npm run dev');
console.log('   3. Проверьте, что порт 3000 свободен');
console.log('   4. Перезапустите dev сервер после изменений в .env.local');
console.log('   5. Очистите кэш браузера (Ctrl+Shift+R)');
console.log('   6. Если проблема сохраняется, проверьте Network вкладку в DevTools');
console.log('');

