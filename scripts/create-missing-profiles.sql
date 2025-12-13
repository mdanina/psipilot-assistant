-- Скрипт для создания профилей для пользователей, у которых их нет
-- Используйте в Supabase Dashboard → SQL Editor
-- 
-- ВАЖНО: Этот скрипт создаст профили для всех пользователей из auth.users,
-- у которых еще нет записи в таблице profiles

-- Сначала проверим, сколько пользователей без профилей
SELECT 
    COUNT(*) as users_without_profiles
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;

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
        SPLIT_PART(au.email, '@', 1), -- Используем часть email до @ как имя
        au.email
    ) as full_name,
    'doctor' as role, -- По умолчанию роль 'doctor'
    false as mfa_enabled,
    ARRAY[]::TEXT[] as backup_codes,
    au.created_at,
    NOW() as updated_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING; -- Если профиль уже существует, не обновляем

-- Проверяем результат
SELECT 
    au.id,
    au.email,
    p.full_name,
    p.role,
    CASE 
        WHEN p.id IS NULL THEN '❌ Profile still missing'
        ELSE '✅ Profile created'
    END as status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
ORDER BY au.created_at DESC;






