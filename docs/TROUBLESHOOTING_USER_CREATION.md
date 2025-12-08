# Решение проблемы создания пользователя

## Симптомы
При создании пользователя через Supabase Dashboard появляется ошибка:
```
Failed to create user: API error happened while trying to communicate with the server.
```

## Причина
Проблема на стороне сервера Supabase, скорее всего в триггере `handle_new_user()`, который автоматически создает профиль при создании пользователя в `auth.users`.

## Диагностика

### Шаг 1: Проверьте логи Supabase
В вашем self-hosted Supabase Dashboard:
1. Откройте раздел **Logs** или **Database Logs**
2. Найдите ошибки, связанные с `handle_new_user` или `profiles`
3. Скопируйте текст ошибки

### Шаг 2: Запустите диагностический SQL
Откройте **SQL Editor** в Supabase Dashboard и выполните скрипт:
```sql
-- Проверка триггера
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname = 'on_auth_user_created';

-- Проверка структуры profiles
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
```

## Решения

### Решение 1: Обновить функцию handle_new_user()

Если проблема в том, что функция не учитывает новые колонки из миграции 005, обновите функцию:

```sql
-- Обновленная функция handle_new_user с поддержкой новых колонок
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (
        id, 
        email, 
        full_name,
        mfa_enabled,
        backup_codes
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        false,  -- mfa_enabled по умолчанию
        ARRAY[]::TEXT[]  -- backup_codes по умолчанию
    )
    ON CONFLICT (id) DO NOTHING;  -- Защита от дубликатов
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Логируем ошибку, но не блокируем создание пользователя
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;
```

### Решение 2: Временно отключить триггер (для теста)

Если нужно быстро проверить, что проблема именно в триггере:

```sql
-- Отключить триггер
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

-- Попробуйте создать пользователя снова

-- Если работает, включите обратно и исправьте функцию
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
```

### Решение 3: Проверить RLS политики

Если проблема в правах доступа:

```sql
-- Проверить RLS на profiles
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'profiles';

-- Временно отключить RLS для теста (НЕ для production!)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
```

### Решение 4: Создать профиль вручную

Если триггер не работает, можно создать профиль вручную после создания пользователя:

```sql
-- После создания пользователя в auth.users, выполните:
INSERT INTO profiles (id, email, full_name, mfa_enabled, backup_codes)
VALUES (
    'USER_ID_FROM_AUTH_USERS',
    'user@example.com',
    'User Name',
    false,
    ARRAY[]::TEXT[]
)
ON CONFLICT (id) DO NOTHING;
```

## Проверка после исправления

1. Создайте тестового пользователя через Dashboard
2. Проверьте, что профиль создался:
   ```sql
   SELECT * FROM profiles WHERE email = 'test@example.com';
   ```
3. Проверьте логи на наличие ошибок

## Если ничего не помогает

1. **Проверьте версию Supabase** - возможно, нужна обновление
2. **Проверьте конфигурацию** - возможно, проблема в настройках self-hosted Supabase
3. **Создайте миграцию для исправления** - используйте файл ниже

## Миграция для исправления

Создайте файл `supabase/migrations/006_fix_user_creation.sql`:

```sql
-- Fix user creation trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (
        id, 
        email, 
        full_name,
        mfa_enabled,
        backup_codes
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        false,
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;
```

Примените миграцию через Supabase Dashboard или CLI.




