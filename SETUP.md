# Руководство по развертыванию PsiPilot Assistant

Подробное руководство по локальному развертыванию проекта с self-hosted Supabase.

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.env.local` в корне проекта:

**Windows (PowerShell):**
```powershell
New-Item -Path .env.local -ItemType File
```

**Linux/Mac:**
```bash
touch .env.local
```

**Содержимое `.env.local`:**
```env
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Получение ключей Supabase

#### Для self-hosted Supabase:

1. **URL (VITE_SUPABASE_URL):**
   - Локальный: `http://localhost:8000`
   - Удаленный: `https://your-domain.com`
   - Обычно это URL вашего Supabase API Gateway

2. **Anon Key (VITE_SUPABASE_ANON_KEY):**
   - Откройте Supabase Dashboard
   - Settings → API
   - Скопируйте ключ из секции "Project API keys" → "anon public"

#### Альтернативный способ (через конфиг):

Если у вас есть доступ к конфигурационным файлам Supabase, ключи можно найти в:
- `supabase/.env` (для локальной разработки)
- `config.toml` (в настройках проекта)

### 4. Настройка базы данных

#### Вариант 1: Через Supabase Dashboard (рекомендуется)

1. Откройте Supabase Dashboard
2. Перейдите в **SQL Editor**
3. Выполните каждый файл миграции по порядку:

```sql
-- 1. Создание схемы
-- Скопируйте и выполните содержимое: supabase/migrations/001_initial_schema.sql

-- 2. Настройка безопасности
-- Скопируйте и выполните содержимое: supabase/migrations/002_row_level_security.sql

-- 3. Заполнение шаблонов
-- Скопируйте и выполните содержимое: supabase/migrations/003_seed_section_templates.sql
```

#### Вариант 2: Через psql

```bash
# Подключение к базе данных
psql "postgresql://postgres:your-password@your-host:5432/postgres"

# Выполнение миграций
\i supabase/migrations/001_initial_schema.sql
\i supabase/migrations/002_row_level_security.sql
\i supabase/migrations/003_seed_section_templates.sql
```

#### Вариант 3: Через Supabase CLI

```bash
# Установка CLI (если нужно)
npm install -g supabase

# Подключение к проекту
supabase link --project-ref your-project-ref

# Применение миграций
supabase db push
```

### 5. Создание Storage Buckets

После выполнения миграций создайте buckets для хранения файлов:

В SQL Editor выполните:

```sql
-- Bucket для аудиозаписей
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket для документов
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
```

### 6. Запуск проекта

```bash
npm run dev
```

Приложение будет доступно по адресу: **http://localhost:3000**

## Проверка подключения

### В браузере

1. Откройте приложение: http://localhost:3000
2. Откройте консоль разработчика (F12)
3. Проверьте наличие ошибок:
   - ❌ `Missing VITE_SUPABASE_URL` - не настроен URL
   - ❌ `Missing VITE_SUPABASE_ANON_KEY` - не настроен ключ
   - ❌ CORS ошибки - проблема с настройками Supabase

### Тестирование подключения

Создайте тестовый файл `test-connection.ts` (временно):

```typescript
import { supabase } from './src/lib/supabase';

async function testConnection() {
  try {
    const { data, error } = await supabase.from('clinics').select('count');
    if (error) {
      console.error('❌ Ошибка подключения:', error.message);
    } else {
      console.log('✅ Подключение успешно!');
    }
  } catch (err) {
    console.error('❌ Критическая ошибка:', err);
  }
}

testConnection();
```

## Решение проблем

### Проблема: "Missing VITE_SUPABASE_URL"

**Решение:**
1. Убедитесь, что файл `.env.local` существует в корне проекта
2. Проверьте, что переменная `VITE_SUPABASE_URL` указана правильно
3. Перезапустите dev сервер после изменения `.env.local`

### Проблема: CORS ошибки

**Решение:**
В вашем Supabase нужно настроить CORS для вашего домена. Для локальной разработки добавьте в настройки Supabase:

```toml
# В config.toml или через Dashboard
[api]
cors_allowed_origins = ["http://localhost:3000"]
```

### Проблема: "Invalid API key"

**Решение:**
1. Проверьте, что вы используете правильный **anon** ключ (не service_role)
2. Убедитесь, что ключ скопирован полностью без пробелов
3. Проверьте, что ключ соответствует вашему Supabase инстансу

### Проблема: Миграции не применяются

**Решение:**
1. Проверьте права доступа к базе данных
2. Убедитесь, что выполняете миграции в правильном порядке
3. Проверьте логи ошибок в Supabase Dashboard → Logs

### Проблема: Порт 3000 занят

**Решение:**
Измените порт в `vite.config.ts`:

```typescript
server: {
  host: "::",
  port: 5173, // или другой свободный порт (например, 3001, 4000)
}
```

## Следующие шаги

После успешного развертывания:

1. ✅ Проверьте подключение к базе данных
2. ✅ Создайте тестового пользователя через Supabase Auth
3. ✅ Создайте тестовую клинику в таблице `clinics`
4. ✅ Начните разработку функциональности

## Полезные команды

```bash
# Запуск dev сервера
npm run dev

# Сборка для production
npm run build

# Просмотр production сборки
npm run preview

# Линтинг кода
npm run lint
```

## Дополнительные ресурсы

- [Документация Supabase](https://supabase.com/docs)
- [Self-hosted Supabase Guide](https://supabase.com/docs/guides/self-hosting)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

