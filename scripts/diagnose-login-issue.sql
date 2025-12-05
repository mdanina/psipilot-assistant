-- Диагностика проблемы с входом пользователя
-- Используйте в Supabase Dashboard → SQL Editor
-- Замените 'user-email@example.com' на email пользователя

-- 1. Проверяем, существует ли пользователь в auth.users
SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    raw_user_meta_data
FROM auth.users
WHERE email = 'user-email@example.com'; -- ЗАМЕНИТЕ НА EMAIL ПОЛЬЗОВАТЕЛЯ

-- 2. Проверяем, существует ли профиль
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.clinic_id,
    p.created_at,
    c.name as clinic_name
FROM profiles p
LEFT JOIN clinics c ON p.clinic_id = c.id
WHERE p.email = 'user-email@example.com'; -- ЗАМЕНИТЕ НА EMAIL ПОЛЬЗОВАТЕЛЯ

-- 3. Проверяем RLS политики для profiles
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
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 4. Проверяем, может ли пользователь получить свой профиль (симулируем запрос)
-- ВАЖНО: Замените 'USER_ID_HERE' на реальный UUID пользователя из шага 1
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.clinic_id,
    auth.uid() as current_auth_uid,
    (p.id = auth.uid()) as can_view_own_profile,
    (p.clinic_id = (
        SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )) as can_view_clinic_profile
FROM profiles p
WHERE p.id = 'USER_ID_HERE'; -- ЗАМЕНИТЕ НА UUID ПОЛЬЗОВАТЕЛЯ

-- 5. Проверяем, есть ли у пользователя clinic_id
SELECT 
    p.id,
    p.email,
    p.clinic_id,
    CASE 
        WHEN p.clinic_id IS NULL THEN '⚠️  У пользователя нет clinic_id'
        ELSE '✅ У пользователя есть clinic_id'
    END as clinic_status
FROM profiles p
WHERE p.email = 'user-email@example.com'; -- ЗАМЕНИТЕ НА EMAIL ПОЛЬЗОВАТЕЛЯ

-- 6. Проверяем функцию get_user_clinic_id для пользователя
-- ВАЖНО: Замените 'USER_ID_HERE' на реальный UUID пользователя
SELECT 
    get_user_clinic_id() as clinic_id_for_current_user;

-- 7. Проверяем, может ли пользователь получить данные через JOIN
-- ВАЖНО: Замените 'USER_ID_HERE' на реальный UUID пользователя
SELECT 
    p.*,
    c.*
FROM profiles p
LEFT JOIN clinics c ON p.clinic_id = c.id
WHERE p.id = 'USER_ID_HERE'; -- ЗАМЕНИТЕ НА UUID ПОЛЬЗОВАТЕЛЯ

