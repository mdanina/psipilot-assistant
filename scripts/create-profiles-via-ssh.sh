#!/bin/bash
# Скрипт для создания профилей через SSH/psql
# 
# Использование:
#   ./create-profiles-via-ssh.sh
#   или
#   bash create-profiles-via-ssh.sh
#
# Требует переменных окружения:
#   DB_HOST - хост базы данных
#   DB_PORT - порт (обычно 5432)
#   DB_NAME - имя базы данных (обычно postgres)
#   DB_USER - пользователь БД (обычно postgres)
#   DB_PASSWORD - пароль БД (или используйте .pgpass)
#
# Альтернативно можно использовать строку подключения:
#   DATABASE_URL="postgresql://user:password@host:port/database"

set -e  # Остановка при ошибке

echo "🔍 Проверка подключения к базе данных..."

# Проверка переменных окружения или DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
        echo "❌ Ошибка: Установите переменные окружения:"
        echo "   export DB_HOST=your-host"
        echo "   export DB_USER=postgres"
        echo "   export DB_NAME=postgres"
        echo "   export DB_PASSWORD=your-password"
        echo ""
        echo "   ИЛИ используйте DATABASE_URL:"
        echo "   export DATABASE_URL='postgresql://user:password@host:port/database'"
        exit 1
    fi
    
    # Формируем строку подключения
    if [ -n "$DB_PASSWORD" ]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
    
    DB_CONNECTION="host=$DB_HOST port=${DB_PORT:-5432} dbname=$DB_NAME user=$DB_USER"
else
    DB_CONNECTION="$DATABASE_URL"
fi

echo "📊 Проверка количества пользователей без профилей..."

# Проверка количества пользователей без профилей
USERS_WITHOUT_PROFILES=$(psql $DB_CONNECTION -t -c "
SELECT COUNT(*) 
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;
" | xargs)

echo "   Найдено пользователей без профилей: $USERS_WITHOUT_PROFILES"

if [ "$USERS_WITHOUT_PROFILES" -eq 0 ]; then
    echo "✅ Все пользователи уже имеют профили!"
    exit 0
fi

echo ""
echo "🚀 Создание профилей для $USERS_WITHOUT_PROFILES пользователей..."

# Создание профилей
psql $DB_CONNECTION <<EOF
-- Создаем профили для всех пользователей, у которых их нет
INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    specialization,
    mfa_enabled,
    backup_codes,
    settings,
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
    COALESCE(
        (au.raw_user_meta_data->>'role')::VARCHAR(50),
        'specialist'
    ) as role,
    NULLIF(au.raw_user_meta_data->>'specialization', '')::VARCHAR(100) as specialization,
    COALESCE(
        (au.raw_user_meta_data->>'mfa_enabled')::BOOLEAN,
        false
    ) as mfa_enabled,
    ARRAY[]::TEXT[] as backup_codes,
    COALESCE(
        au.raw_user_meta_data->'settings',
        '{}'::JSONB
    ) as settings,
    au.created_at,
    NOW() as updated_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
EOF

if [ $? -eq 0 ]; then
    echo "✅ Профили успешно созданы!"
else
    echo "❌ Ошибка при создании профилей"
    exit 1
fi

echo ""
echo "📋 Результаты:"
psql $DB_CONNECTION -c "
SELECT 
    au.email,
    p.full_name,
    p.role,
    CASE 
        WHEN p.id IS NULL THEN '❌ Profile still missing'
        ELSE '✅ Profile created'
    END as status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
ORDER BY au.created_at DESC
LIMIT 20;
"

echo ""
echo "✨ Готово!"
