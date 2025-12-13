-- Диагностика проблемы создания пользователя
-- Запустите этот скрипт в Supabase SQL Editor

-- 1. Проверка существования триггера
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    proname AS function_name,
    tgenabled AS enabled
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname = 'on_auth_user_created'
   OR proname = 'handle_new_user';

-- 2. Проверка функции handle_new_user
SELECT 
    proname AS function_name,
    prosrc AS function_body,
    prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'handle_new_user';

-- 3. Проверка структуры таблицы profiles
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 4. Проверка последних ошибок в логах (если доступны)
-- SELECT * FROM pg_stat_statements WHERE query LIKE '%handle_new_user%' ORDER BY calls DESC LIMIT 10;

-- 5. Тестовая проверка: попробуем выполнить функцию вручную (НЕ ЗАПУСКАТЬ на реальных данных!)
-- DO $$
-- DECLARE
--     test_user_id UUID := '00000000-0000-0000-0000-000000000000';
-- BEGIN
--     -- Симуляция создания профиля
--     INSERT INTO profiles (id, email, full_name)
--     VALUES (test_user_id, 'test@example.com', 'Test User');
--     RAISE NOTICE 'Test insert successful';
-- EXCEPTION WHEN OTHERS THEN
--     RAISE NOTICE 'Error: %', SQLERRM;
-- END $$;

-- 6. Проверка RLS политик на profiles
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- 7. Проверка прав доступа для функции
SELECT 
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    CASE p.prosecdef 
        WHEN true THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END AS security_type,
    r.rolname AS owner
FROM pg_proc p
JOIN pg_roles r ON p.proowner = r.oid
WHERE p.proname = 'handle_new_user';








