-- ============================================
-- ДИАГНОСТИКА ПРОБЛЕМЫ С ТАЙМАУТОМ ПРОФИЛЯ
-- ============================================
-- Запустите этот скрипт в Supabase Dashboard → SQL Editor
-- Замените 'mdanina@yandex.ru' на email пользователя

-- 1. Проверяем наличие индексов
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'clinics')
ORDER BY tablename, indexname;

-- ❓ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:
-- Должен быть idx_profiles_clinic_id
-- Если его НЕТ - это причина проблемы!

-- ============================================

-- 2. Проверяем профиль пользователя
SELECT
    id,
    email,
    clinic_id,
    CASE
        WHEN clinic_id IS NULL THEN '⚠️ NULL - JOIN к clinics будет пустым!'
        ELSE '✅ clinic_id установлен'
    END as clinic_status
FROM profiles
WHERE email = 'mdanina@yandex.ru';

-- ============================================

-- 3. Проверяем RLS политики для profiles
SELECT
    policyname,
    cmd,
    qual as policy_condition
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- ============================================

-- 4. Проверяем RLS политики для clinics
SELECT
    policyname,
    cmd,
    qual as policy_condition
FROM pg_policies
WHERE tablename = 'clinics'
ORDER BY policyname;

-- ============================================

-- 5. Тестируем скорость get_user_clinic_id()
-- (Выполните под аутентифицированным пользователем)
EXPLAIN ANALYZE
SELECT get_user_clinic_id();

-- ============================================

-- 6. Тестируем запрос профиля с JOIN (как делает приложение)
-- Замените UUID на id пользователя
EXPLAIN ANALYZE
SELECT
    p.*,
    c.*
FROM profiles p
LEFT JOIN clinics c ON p.clinic_id = c.id
WHERE p.id = 'dbf14385-6231-4091-a407-9dfad43d1e33';

-- ============================================

-- 7. Исправление - добавить недостающий индекс
-- РАСКОММЕНТИРУЙТЕ ЕСЛИ НУЖНО:
-- CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON profiles(clinic_id);
-- ANALYZE profiles;
