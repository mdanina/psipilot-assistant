# Создание профилей для пользователей

Этот документ описывает, как создать профили для пользователей, которые были созданы в системе, но у которых еще нет записей в таблице `profiles`.

## Варианты выполнения

### Вариант 1: Через Supabase Dashboard (SQL Editor) - РЕКОМЕНДУЕТСЯ

1. Откройте ваш Supabase Dashboard
2. Перейдите в **SQL Editor**
3. Скопируйте и выполните один из SQL скриптов:

   - **Для быстрого создания**: `scripts/create-missing-profiles.sql`
   - **Для подробного с проверками**: `scripts/create-profiles-for-new-users.sql`

4. Проверьте результаты выполнения

### Вариант 2: Через SSH (psql) - Linux/Mac

1. Убедитесь, что у вас установлен `psql` (PostgreSQL client)

2. Установите переменные окружения:
   ```bash
   export DB_HOST="your-database-host"
   export DB_PORT="5432"
   export DB_NAME="postgres"
   export DB_USER="postgres"
   export DB_PASSWORD="your-password"
   ```

   ИЛИ используйте `DATABASE_URL`:
   ```bash
   export DATABASE_URL="postgresql://user:password@host:port/database"
   ```

3. Сделайте скрипт исполняемым:
   ```bash
   chmod +x scripts/create-profiles-via-ssh.sh
   ```

4. Запустите скрипт:
   ```bash
   ./scripts/create-profiles-via-ssh.sh
   ```

### Вариант 3: Через SSH (psql) - Windows PowerShell

1. Убедитесь, что у вас установлен `psql` (PostgreSQL client)

2. Установите переменные окружения:
   ```powershell
   $env:DB_HOST="your-database-host"
   $env:DB_PORT="5432"
   $env:DB_NAME="postgres"
   $env:DB_USER="postgres"
   $env:DB_PASSWORD="your-password"
   ```

   ИЛИ используйте `DATABASE_URL`:
   ```powershell
   $env:DATABASE_URL="postgresql://user:password@host:port/database"
   ```

3. Запустите скрипт:
   ```powershell
   .\scripts\create-profiles-via-ssh.ps1
   ```

## Что делает скрипт?

Скрипт выполняет следующие действия:

1. **Проверяет** количество пользователей без профилей
2. **Создает профили** для всех пользователей из `auth.users`, у которых еще нет записи в таблице `profiles`
3. **Использует данные** из `auth.users`:
   - `email` - берется из `auth.users.email`
   - `full_name` - берется из метаданных или генерируется из email
   - `role` - берется из метаданных или устанавливается 'specialist' по умолчанию
   - `specialization` - берется из метаданных (если есть)
   - `mfa_enabled` - из метаданных или `false` по умолчанию
   - `settings` - из метаданных или пустой JSON объект
4. **Выводит результаты** - показывает всех пользователей и статус их профилей

## Безопасность

- Скрипт использует `ON CONFLICT DO NOTHING`, поэтому безопасен для повторного запуска
- Не обновляет существующие профили, только создает новые
- Работает только с пользователями, у которых нет профилей

## Проверка результата

После выполнения скрипта вы увидите список всех пользователей с их статусами:
- ✅ Profile created - профиль успешно создан
- ❌ Profile still missing - профиль не создан (такого быть не должно при нормальном выполнении)

## Устранение проблем

### Ошибка: "permission denied"

Убедитесь, что у вашего пользователя БД есть права на:
- `SELECT` из `auth.users`
- `INSERT` в `profiles`

### Ошибка: "relation 'profiles' does not exist"

Убедитесь, что все миграции применены, особенно:
- `001_initial_schema.sql` - создает таблицу profiles
- Все последующие миграции, которые добавляют колонки

### Ошибка: "constraint violation" (role check)

Убедитесь, что роль пользователя соответствует допустимым значениям:
- `specialist`
- `admin`
- `assistant`
- `doctor` (устаревшая, но поддерживается)

## Альтернативный способ - через Supabase CLI

Если у вас настроен Supabase CLI:

```bash
# Подключитесь к проекту
supabase link --project-ref your-project-ref

# Выполните SQL скрипт
psql $(supabase db remote-url) -f scripts/create-profiles-for-new-users.sql
```
