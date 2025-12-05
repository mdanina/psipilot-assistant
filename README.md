# PsiPilot Assistant

AI-powered clinical documentation assistant for mental health professionals.

## Features

- Audio recording and transcription of therapy sessions
- AI-generated clinical notes with customizable templates
- Patient management
- Secure multi-tenant architecture

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **UI**: shadcn/ui, Tailwind CSS
- **Backend**: Supabase (self-hosted)
- **State**: TanStack Query, React Hook Form

## Getting Started

### Prerequisites

- **Node.js 18+** и npm (или yarn/pnpm)
- **Self-hosted Supabase instance** с доступом к базе данных
- Доступ к Supabase Dashboard для получения API ключей

### Шаг 1: Установка зависимостей

```bash
# Клонируйте репозиторий (если еще не сделано)
git clone <YOUR_GIT_URL>
cd psipilot-assistant

# Установите зависимости
npm install
```

### Шаг 2: Настройка переменных окружения

Файл `.env.local` уже создан автоматически! 

Если нужно создать вручную:

**Windows PowerShell:**
```powershell
New-Item -Path .env.local -ItemType File
```

**Windows CMD:**
```cmd
type nul > .env.local
```

**Linux/Mac:**
```bash
touch .env.local
```

Добавьте в файл `.env.local` следующие переменные:

```env
# URL вашего self-hosted Supabase
# Примеры:
# - Локальный: http://localhost:8000
# - Удаленный: https://your-domain.com
VITE_SUPABASE_URL=http://localhost:8000

# Anon/Public ключ из Supabase Dashboard
# Найти можно в: Settings > API > Project API keys > anon public
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Где найти ключи в Supabase:**
1. Откройте Supabase Dashboard
2. Перейдите в **Settings** → **API**
3. Скопируйте:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** ключ → `VITE_SUPABASE_ANON_KEY`

### Шаг 3: Настройка базы данных

Выполните миграции базы данных в вашем Supabase:

**Вариант A: Через Supabase Dashboard (рекомендуется)**
1. Откройте Supabase Dashboard
2. Перейдите в **SQL Editor**
3. Выполните миграции по порядку:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_row_level_security.sql`
   - `supabase/migrations/003_seed_section_templates.sql`

**Вариант B: Через psql**
```bash
# Подключитесь к вашей базе данных
psql "postgresql://postgres:your-password@your-host:5432/postgres"

# Выполните миграции
\i supabase/migrations/001_initial_schema.sql
\i supabase/migrations/002_row_level_security.sql
\i supabase/migrations/003_seed_section_templates.sql
```

**Вариант C: Через Supabase CLI**
```bash
# Установите Supabase CLI (если еще не установлен)
npm install -g supabase

# Подключитесь к проекту
supabase link --project-ref your-project-ref

# Примените миграции
supabase db push
```

**Создание Storage Buckets:**
После выполнения миграций создайте buckets для файлов в SQL Editor:
```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
```

Подробнее см. [supabase/README.md](./supabase/README.md)

### Шаг 4: Проверка подключения (опционально)

Перед запуском можно проверить подключение к Supabase:

```bash
# Установите dotenv (если еще не установлен)
npm install

# Проверьте подключение
npm run check:connection
```

Скрипт проверит:
- ✅ Наличие переменных окружения
- ✅ Подключение к Supabase
- ✅ Наличие необходимых таблиц в базе данных

### Шаг 5: Запуск проекта

```bash
# Запустите dev сервер
npm run dev
```

Приложение будет доступно по адресу: **http://localhost:3000** (порт настроен в `vite.config.ts`)

### Проверка в браузере

После запуска откройте консоль браузера (F12) и проверьте:
- Нет ли ошибок о missing environment variables
- Успешно ли подключение к Supabase

Если видите ошибки:
1. Убедитесь, что файл `.env.local` создан и содержит правильные значения
2. Перезапустите dev сервер после изменения `.env.local`
3. Проверьте, что ваш Supabase доступен по указанному URL
4. Запустите `npm run check:connection` для диагностики

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Project Structure

```
src/
├── components/     # React components
│   ├── ui/         # shadcn/ui components
│   ├── layout/     # Layout components
│   └── scribe/     # Recording components
├── pages/          # Page components
├── hooks/          # Custom React hooks
├── lib/            # Utilities and Supabase client
└── types/          # TypeScript types
supabase/
└── migrations/     # SQL migrations
```

## License

Private - All rights reserved.
