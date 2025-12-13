-- Диагностика проблемы создания пациента
-- Запустите этот скрипт в Supabase SQL Editor от имени пользователя, который пытается создать пациента

-- 1. Проверка текущего пользователя и его профиля
SELECT 
    auth.uid() as current_user_id,
    p.id as profile_id,
    p.email,
    p.clinic_id,
    p.role
FROM profiles p
WHERE p.id = auth.uid();

-- 2. Проверка работы функции get_user_clinic_id()
SELECT get_user_clinic_id() as user_clinic_id;

-- 3. Проверка RLS политик на patients
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
WHERE tablename = 'patients'
ORDER BY policyname;

-- 4. Проверка существования функции create_patient_secure
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
WHERE p.proname = 'create_patient_secure';

-- 5. Тестовая проверка: попробуем получить clinic_id пользователя
DO $$
DECLARE
    v_clinic_id UUID;
BEGIN
    v_clinic_id := get_user_clinic_id();
    RAISE NOTICE 'User clinic_id: %', v_clinic_id;
    
    IF v_clinic_id IS NULL THEN
        RAISE NOTICE 'WARNING: get_user_clinic_id() returned NULL - user may not have a clinic assigned';
    END IF;
END $$;

-- 6. Проверка политик на profiles (чтобы убедиться, что get_user_clinic_id() может получить доступ)
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;




