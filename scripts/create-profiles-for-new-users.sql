-- Скрипт для создания профилей для всех новых пользователей
-- Используйте в Supabase Dashboard → SQL Editor
-- 
-- ВАЖНО: Этот скрипт создаст профили для всех пользователей из auth.users,
-- у которых еще нет записи в таблице profiles

-- ============================================
-- ШАГ 1: ПРОВЕРКА - Сколько пользователей без профилей
-- ============================================
SELECT 
    COUNT(*) as users_without_profiles
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;

-- ============================================
-- ШАГ 2: СОЗДАНИЕ ПРОФИЛЕЙ для всех пользователей без профилей
-- ============================================
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
        SPLIT_PART(au.email, '@', 1), -- Используем часть email до @ как имя
        au.email
    ) as full_name,
    COALESCE(
        (au.raw_user_meta_data->>'role')::VARCHAR(50),
        'specialist' -- По умолчанию роль 'specialist' (актуальная роль)
    ) as role,
    NULLIF(au.raw_user_meta_data->>'specialization', '')::VARCHAR(100) as specialization,
    COALESCE(
        (au.raw_user_meta_data->>'mfa_enabled')::BOOLEAN,
        false
    ) as mfa_enabled,
    ARRAY[]::TEXT[] as backup_codes, -- Пустой массив по умолчанию
    COALESCE(
        au.raw_user_meta_data->'settings',
        '{}'::JSONB
    ) as settings,
    au.created_at,
    NOW() as updated_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING; -- Если профиль уже существует, не обновляем

-- ============================================
-- ШАГ 3: ПРОВЕРКА РЕЗУЛЬТАТА
-- ============================================
-- Показываем всех пользователей и статус их профилей
SELECT 
    au.id,
    au.email,
    p.full_name,
    p.role,
    p.specialization,
    CASE 
        WHEN p.id IS NULL THEN '❌ Profile still missing'
        ELSE '✅ Profile created'
    END as status,
    au.created_at as user_created_at,
    p.created_at as profile_created_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
ORDER BY au.created_at DESC;

-- ============================================
-- ШАГ 4: СТАТИСТИКА (опционально)
-- ============================================
-- Показываем статистику по ролям
SELECT 
    COALESCE(role, 'NULL') as role,
    COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY count DESC;


