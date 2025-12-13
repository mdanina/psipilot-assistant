# Создание пользователей для тестирования

Этот документ описывает, как создавать новых пользователей для тестирования приложения без открытой регистрации.

## Вариант 1: Использование скрипта (Рекомендуется)

### Подготовка

1. **Получите Service Role Key из Supabase Dashboard:**
   - Откройте Supabase Dashboard
   - Перейдите в Settings > API
   - Найдите "Project API keys"
   - Скопируйте `service_role` ключ (⚠️ **НИКОГДА не коммитьте его в репозиторий!**)

2. **Добавьте ключ в `.env.local`:**
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

   Или используйте переменную окружения:
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

### Использование скрипта

#### Базовое использование

```bash
node scripts/create-user.js user@example.com password123
```

#### С указанием имени и роли

```bash
node scripts/create-user.js user@example.com password123 --name "Иван Иванов" --role admin
```

#### С привязкой к клинике

```bash
node scripts/create-user.js user@example.com password123 \
  --name "Иван Иванов" \
  --role specialist \
  --clinic-id "uuid-клиники-здесь"
```

#### Все параметры

```bash
node scripts/create-user.js user@example.com password123 \
  --name "Иван Иванов" \
  --role specialist \
  --clinic-id "uuid-клиники" \
  --url "https://your-supabase-url.com" \
  --service-key "your-service-role-key"
```

### Параметры

- `email` (обязательно) - Email пользователя
- `password` (обязательно) - Пароль (минимум 6 символов)
- `--name, -n` - Полное имя пользователя
- `--role, -r` - Роль: `admin`, `specialist`, `assistant` (по умолчанию: `specialist`)
- `--clinic-id, -c` - UUID клиники для автоматической привязки
- `--url` - URL Supabase (по умолчанию из `.env.local`)
- `--service-key` - Service Role Key (по умолчанию из `.env.local`)

### Примеры ролей

- **admin** - Администратор клиники (полный доступ к админ-панели)
- **specialist** - Специалист (может работать с пациентами и сессиями)
- **assistant** - Ассистент (ограниченный доступ)

## Вариант 2: Через Supabase Dashboard

1. Откройте Supabase Dashboard
2. Перейдите в **Authentication** > **Users**
3. Нажмите **Add user** > **Create new user**
4. Заполните:
   - Email
   - Password
   - Auto Confirm User: ✅ (включите)
5. После создания пользователя:
   - Профиль создастся автоматически через триггер
   - Привяжите пользователя к клинике через SQL Editor или админ-панель

### Привязка к клинике через SQL

```sql
-- Обновить профиль пользователя
UPDATE profiles
SET 
  clinic_id = 'uuid-клиники-здесь',
  role = 'specialist',
  full_name = 'Иван Иванов'
WHERE email = 'user@example.com';
```

## Вариант 3: Через админ-панель приложения

Если у вас уже есть администратор:

1. Войдите как администратор
2. Перейдите в **Администрирование** (Administration)
3. Нажмите **Добавить пользователя**
4. Заполните форму приглашения
5. Пользователь получит приглашение и сможет зарегистрироваться

⚠️ **Примечание:** Этот вариант требует, чтобы пользователь сам зарегистрировался через форму регистрации.

## Получение UUID клиники

Если вам нужно узнать UUID клиники для привязки пользователя:

### Через SQL Editor в Supabase

```sql
-- Список всех клиник
SELECT id, name, email FROM clinics;

-- Или найти клинику по названию
SELECT id, name FROM clinics WHERE name ILIKE '%название%';
```

### Через админ-панель

1. Войдите как администратор
2. Перейдите в **Администрирование**
3. UUID клиники отображается в разделе "Информация о клинике"

## Безопасность

⚠️ **ВАЖНО:**

1. **Service Role Key** имеет полный доступ к базе данных
2. **НИКОГДА** не коммитьте Service Role Key в репозиторий
3. Используйте `.env.local` (который в `.gitignore`)
4. На production сервере используйте переменные окружения системы
5. Ограничьте доступ к скрипту только администраторам

## Устранение проблем

### Ошибка: "Не указан Service Role Key"

Убедитесь, что:
- Ключ добавлен в `.env.local` как `SUPABASE_SERVICE_ROLE_KEY`
- Или передайте через `--service-key` параметр

### Ошибка: "Пользователь уже существует"

Пользователь с таким email уже существует. Вы можете:
- Использовать другой email
- Сбросить пароль через Supabase Dashboard
- Удалить пользователя через Dashboard (⚠️ это удалит все данные)

### Профиль не создался автоматически

Проверьте:
1. Триггер `on_auth_user_created` существует:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```
2. Функция `handle_new_user` работает:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';
   ```

Если триггер отсутствует, выполните миграцию:
```sql
-- Из файла supabase/migrations/001_initial_schema.sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## Массовое создание пользователей

Для создания нескольких пользователей можно использовать bash скрипт:

```bash
#!/bin/bash

# Массовое создание пользователей
users=(
  "user1@example.com:password1:Иван Иванов:specialist"
  "user2@example.com:password2:Петр Петров:admin"
  "user3@example.com:password3:Мария Сидорова:assistant"
)

for user in "${users[@]}"; do
  IFS=':' read -r email password name role <<< "$user"
  node scripts/create-user.js "$email" "$password" --name "$name" --role "$role"
  echo ""
done
```

## Дополнительная информация

- [Supabase Admin API Documentation](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Database Schema](../supabase/migrations/001_initial_schema.sql)
- [User Invitations System](../supabase/migrations/012_user_invitations.sql)





