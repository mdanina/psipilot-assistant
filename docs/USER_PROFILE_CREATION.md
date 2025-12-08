# Создание профилей пользователей

## Как это работает

Когда пользователь создается в Supabase (через Dashboard или через API), автоматически должен создаваться профиль в таблице `profiles`.

### Логика работы:

1. **Триггер** `on_auth_user_created` срабатывает при `INSERT` в `auth.users`
2. **Функция** `handle_new_user()` автоматически создает запись в `profiles`
3. Профиль создается с данными из `auth.users`:
   - `id` - тот же UUID, что и в `auth.users`
   - `email` - из `auth.users.email`
   - `full_name` - из `raw_user_meta_data->>'full_name'` или email
   - `role` - по умолчанию `'doctor'`
   - `mfa_enabled` - по умолчанию `false`
   - `backup_codes` - по умолчанию пустой массив

### Миграции:

- **001_initial_schema.sql** - создает базовую функцию и триггер
- **006_fix_user_creation_trigger.sql** - обновляет функцию для поддержки новых колонок (mfa_enabled, backup_codes)

## Проблема: Профиль не создался

Если вы создали пользователя в Supabase Dashboard, но профиль не появился в таблице `profiles`, возможные причины:

1. **Пользователь создан до применения миграции 006**
   - Решение: Примените миграцию 006 или создайте профиль вручную

2. **Триггер не сработал из-за ошибки**
   - Функция `handle_new_user()` ловит ошибки и не блокирует создание пользователя
   - Проверьте логи Supabase на наличие предупреждений (WARNING)

3. **Миграция 006 не применена**
   - Решение: Примените миграцию `006_fix_user_creation_trigger.sql`

## Решение: Создание недостающих профилей

### Шаг 1: Проверка

Откройте Supabase Dashboard → SQL Editor и выполните:

```sql
-- Проверяем пользователей без профилей
SELECT 
    au.id,
    au.email,
    au.created_at,
    CASE 
        WHEN p.id IS NULL THEN '❌ Profile missing'
        ELSE '✅ Profile exists'
    END as status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;
```

### Шаг 2: Создание профилей

Выполните скрипт `scripts/create-missing-profiles.sql` в SQL Editor:

```sql
-- Создаем профили для всех пользователей, у которых их нет
INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    mfa_enabled,
    backup_codes,
    created_at,
    updated_at
)
SELECT 
    au.id,
    au.email,
    COALESCE(
        au.raw_user_meta_data->>'full_name',
        SPLIT_PART(au.email, '@', 1),
        au.email
    ) as full_name,
    'doctor' as role,
    false as mfa_enabled,
    ARRAY[]::TEXT[] as backup_codes,
    au.created_at,
    NOW() as updated_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
```

### Шаг 3: Проверка результата

```sql
-- Проверяем, что все профили созданы
SELECT 
    COUNT(*) as total_users,
    COUNT(p.id) as users_with_profiles,
    COUNT(*) - COUNT(p.id) as users_without_profiles
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id;
```

## Проверка триггера

Чтобы убедиться, что триггер настроен правильно:

```sql
-- Проверяем существование триггера
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users'
  AND event_object_schema = 'auth'
  AND trigger_name = 'on_auth_user_created';
```

Должен вернуться результат с `trigger_name = 'on_auth_user_created'`.

## Проверка функции

```sql
-- Проверяем функцию handle_new_user
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'handle_new_user';
```

## Для новых пользователей

После применения миграции 006, все новые пользователи, созданные через:
- Supabase Dashboard → Authentication → Users → Add user
- API: `supabase.auth.signUp()`
- Любой другой способ создания в `auth.users`

будут автоматически получать профиль в таблице `profiles`.

## Ручное создание профиля для конкретного пользователя

Если нужно создать профиль для конкретного пользователя:

```sql
-- Замените 'user-email@example.com' на email пользователя
INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    mfa_enabled,
    backup_codes
)
SELECT 
    au.id,
    au.email,
    COALESCE(
        au.raw_user_meta_data->>'full_name',
        SPLIT_PART(au.email, '@', 1),
        au.email
    ),
    'doctor',
    false,
    ARRAY[]::TEXT[]
FROM auth.users au
WHERE au.email = 'user-email@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = au.id
  )
ON CONFLICT (id) DO NOTHING;
```

## Troubleshooting

### Ошибка: "duplicate key value violates unique constraint"

Это означает, что профиль уже существует. Используйте `ON CONFLICT DO NOTHING` или `ON CONFLICT DO UPDATE`.

### Ошибка: "permission denied for table profiles"

Убедитесь, что вы выполняете скрипт с правами администратора или через Supabase Dashboard (который использует service_role ключ).

### Триггер не срабатывает

1. Проверьте, что миграция 006 применена
2. Проверьте логи Supabase на наличие ошибок
3. Попробуйте пересоздать триггер:
   ```sql
   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
   CREATE TRIGGER on_auth_user_created
       AFTER INSERT ON auth.users
       FOR EACH ROW EXECUTE FUNCTION handle_new_user();
   ```

---

**См. также:**
- [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md) - Руководство по миграциям
- [supabase/migrations/006_fix_user_creation_trigger.sql](../supabase/migrations/006_fix_user_creation_trigger.sql) - Миграция с триггером



