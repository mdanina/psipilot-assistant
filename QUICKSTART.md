# Быстрый старт - PsiPilot Assistant

Минимальные шаги для запуска проекта локально.

## 1. Установка зависимостей

```bash
npm install
```

## 2. Создание файла конфигурации

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

## 3. Настройка переменных окружения

Откройте `.env.local` и добавьте:

```env
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_ANON_KEY=ваш-anon-ключ
```

**Где взять ключи:**
- Откройте Supabase Dashboard
- Settings → API
- Скопируйте **Project URL** и **anon public** ключ

## 4. Настройка базы данных

Выполните миграции в Supabase Dashboard → SQL Editor:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_row_level_security.sql`
3. `supabase/migrations/003_seed_section_templates.sql`

## 5. Проверка подключения

```bash
npm run check:connection
```

## 6. Запуск

```bash
npm run dev
```

Откройте: http://localhost:3000

---

**Подробная инструкция:** [SETUP.md](./SETUP.md)

