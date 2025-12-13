-- Исправление профиля пользователя
-- Замените 'mdanina@yandex.ru' на email пользователя

-- 1. Найдем пользователя в auth.users
SELECT 
    id,
    email,
    created_at
FROM auth.users
WHERE email = 'mdanina@yandex.ru';

-- 2. Обновим профиль с правильными данными
-- ВАЖНО: Замените 'USER_ID_FROM_STEP_1' на UUID из шага 1
UPDATE profiles
SET 
    id = 'USER_ID_FROM_STEP_1',  -- ЗАМЕНИТЕ НА UUID ИЗ ШАГА 1
    email = 'mdanina@yandex.ru',
    full_name = COALESCE(full_name, 'mdanina'),
    role = COALESCE(role, 'doctor'),
    clinic_id = NULL,  -- Можно оставить NULL или назначить клинику
    mfa_enabled = COALESCE(mfa_enabled, false),
    backup_codes = COALESCE(backup_codes, ARRAY[]::TEXT[]),
    created_at = COALESCE(created_at, NOW()),
    updated_at = NOW()
WHERE email = 'mdanina@yandex.ru'
   OR full_name = 'mdanina';

-- 3. Если профиль с таким ID уже существует, удалим старый (без ID)
DELETE FROM profiles
WHERE id IS NULL
  AND (email = 'mdanina@yandex.ru' OR full_name = 'mdanina');

-- 4. Создадим профиль заново, если его нет
INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    clinic_id,
    mfa_enabled,
    backup_codes,
    created_at,
    updated_at
)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'full_name', 'mdanina'),
    'doctor',
    NULL,
    false,
    ARRAY[]::TEXT[],
    au.created_at,
    NOW()
FROM auth.users au
WHERE au.email = 'mdanina@yandex.ru'
  AND NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = au.id
  )
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = NOW();

-- 5. Проверим результат
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.clinic_id,
    p.mfa_enabled,
    au.id as auth_user_id,
    au.email as auth_email,
    CASE 
        WHEN p.id = au.id THEN '✅ ID совпадает'
        ELSE '❌ ID не совпадает'
    END as id_match
FROM profiles p
JOIN auth.users au ON p.email = au.email
WHERE au.email = 'mdanina@yandex.ru';







