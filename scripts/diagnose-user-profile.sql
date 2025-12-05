-- Диагностика проблемы с созданием профилей пользователей
-- Запустите этот скрипт в Supabase SQL Editor

-- 1. Проверяем, существует ли триггер
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created'
    AND event_object_table = 'users'
    AND event_object_schema = 'auth';

-- 2. Проверяем, существует ли функция handle_new_user
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'handle_new_user';

-- 3. Сравниваем пользователей в auth.users и profiles
SELECT 
    au.id,
    au.email,
    au.created_at as auth_created_at,
    CASE 
        WHEN p.id IS NOT NULL THEN '✅ Profile exists'
        ELSE '❌ Profile missing'
    END as profile_status,
    p.created_at as profile_created_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
ORDER BY au.created_at DESC;

-- 4. Показываем пользователей без профилей
SELECT 
    au.id,
    au.email,
    au.created_at,
    au.raw_user_meta_data
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;

