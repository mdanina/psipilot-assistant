# Fix: Patient Creation RLS Policy Violation

**Дата:** 2025-12-07
**Ветка:** `claude/fix-patient-creation-error-019qUvqfzUNACgJv3wnKpEd6`

## Проблема

При создании нового пациента появлялась ошибка:
```
new row violates row-level security policy for table "patients"
```

## Причина

RLS (Row Level Security) политика для INSERT в таблицу `patients` использовала условие:
```sql
clinic_id = get_user_clinic_id()
```

Проблемы:
1. Функция `get_user_clinic_id()` не была создана в базе данных
2. В PostgreSQL сравнение `NULL = NULL` возвращает `NULL` (не `TRUE`), что блокирует вставку
3. `ProtectedRoute` не дожидался загрузки профиля, позволяя доступ к странице до проверки `clinic_id`

## Решение

### 1. Создана SECURITY DEFINER функция в Supabase

```sql
CREATE OR REPLACE FUNCTION create_patient_secure(
    p_clinic_id UUID,
    p_name VARCHAR(255),
    p_created_by UUID DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL,
    p_phone VARCHAR(50) DEFAULT NULL,
    p_date_of_birth DATE DEFAULT NULL,
    p_gender VARCHAR(20) DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}'::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- ... проверяет auth.uid(), clinic_id и создаёт пациента
$$;

GRANT EXECUTE ON FUNCTION create_patient_secure TO authenticated;
```

Функция:
- Обходит RLS благодаря `SECURITY DEFINER`
- Проверяет аутентификацию пользователя
- Проверяет принадлежность к клинике
- Создаёт пациента атомарно

### 2. Изменён код создания пациента

**Файл:** `src/lib/supabase-patients.ts`

Вместо прямого INSERT теперь используется RPC вызов:
```typescript
const { data: patientId, error } = await supabase.rpc('create_patient_secure', {
  p_clinic_id: data.clinic_id,
  p_name: data.name,
  // ...остальные параметры
});
```

### 3. Улучшен ProtectedRoute

**Файл:** `src/components/auth/ProtectedRoute.tsx`

Добавлено ожидание загрузки профиля:
```typescript
if (!skipOnboardingCheck && profile === null) {
  return <Loader2 />; // Ждём загрузки профиля
}
```

### 4. Улучшена обработка ошибок

**Файл:** `src/pages/PatientCreatePage.tsx`

Добавлены понятные сообщения об ошибках RLS и логирование для отладки.

## Файлы изменены

| Файл | Изменение |
|------|-----------|
| `src/lib/supabase-patients.ts` | RPC вместо INSERT |
| `src/components/auth/ProtectedRoute.tsx` | Ожидание профиля |
| `src/pages/PatientCreatePage.tsx` | Обработка ошибок |
| `supabase/migrations/019_fix_patient_rls_null_check.sql` | Миграция (опционально) |

## SQL для применения в Supabase

Если функция ещё не создана, выполните в SQL Editor:

```sql
CREATE OR REPLACE FUNCTION create_patient_secure(
    p_clinic_id UUID,
    p_name VARCHAR(255),
    p_created_by UUID DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL,
    p_phone VARCHAR(50) DEFAULT NULL,
    p_date_of_birth DATE DEFAULT NULL,
    p_gender VARCHAR(20) DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}'::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_patient_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;

    SELECT clinic_id INTO v_user_clinic_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_user_clinic_id IS NULL THEN
        RAISE EXCEPTION 'User must belong to a clinic';
    END IF;

    IF p_clinic_id != v_user_clinic_id THEN
        RAISE EXCEPTION 'Cannot create patient for different clinic';
    END IF;

    INSERT INTO patients (
        clinic_id, created_by, name, email, phone,
        date_of_birth, gender, address, notes, tags
    )
    VALUES (
        p_clinic_id, COALESCE(p_created_by, v_user_id), p_name, p_email, p_phone,
        p_date_of_birth, p_gender, p_address, p_notes, p_tags
    )
    RETURNING id INTO v_patient_id;

    RETURN v_patient_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_patient_secure TO authenticated;
```

## Тестирование

1. Войти в приложение
2. Перейти на страницу пациентов
3. Нажать "Добавить пациента"
4. Заполнить форму и сохранить
5. Пациент должен создаться без ошибок
