-- Скрипт для проверки создания профилей пользователей
-- Используйте в Supabase Dashboard → SQL Editor

-- 1. Проверяем, существует ли триггер
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users'
  AND event_object_schema = 'auth'
  AND trigger_name = 'on_auth_user_created';

-- 2. Проверяем функцию handle_new_user
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
    p.id as profile_id,
    p.full_name,
    p.role,
    p.created_at as profile_created_at,
    CASE 
        WHEN p.id IS NULL THEN '❌ Profile missing'
        ELSE '✅ Profile exists'
    END as status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
ORDER BY au.created_at DESC
LIMIT 20;

-- 4. Пользователи без профилей
SELECT 
    au.id,
    au.email,
    au.created_at,
    au.raw_user_meta_data
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;







