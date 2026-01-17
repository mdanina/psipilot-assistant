# Миграция 013: Поддержка сессий без пациента

## Цель миграции

Разрешить создание сессий без привязки к пациенту для поддержки рабочего процесса записи аудио и транскрипции.

## Проблема

Изначально поле `sessions.patient_id` было `NOT NULL`, что требовало выбора пациента перед началом записи. Это создавало неудобства в рабочем процессе:

1. Пользователь должен был сначала выбрать пациента
2. Только потом мог начать запись
3. Нельзя было начать запись "на лету" и привязать позже

## Решение

Разрешить `NULL` значения в `sessions.patient_id` и обновить RLS политики для поддержки обоих сценариев:

- Сессии без пациента (patient_id = NULL) - для быстрого начала записи
- Сессии с пациентом (patient_id != NULL) - для привязанных записей

## Изменения в схеме

### 1. Изменение типа поля

```sql
ALTER TABLE sessions 
    ALTER COLUMN patient_id DROP NOT NULL;
```

### 2. Обновление RLS политик

#### Sessions

```sql
CREATE POLICY "Users can view clinic sessions with consent"
    ON sessions FOR SELECT
    USING (
        clinic_id = get_user_clinic_id()
        AND (
            -- Сессии без пациента видны (согласие не требуется)
            patient_id IS NULL
            OR
            -- Сессии с пациентом требуют согласия
            has_active_consent(patient_id, 'data_processing')
        )
    );
```

#### Recordings

```sql
CREATE POLICY "Users can view clinic recordings with consent"
    ON recordings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = recordings.session_id
            AND sessions.clinic_id = get_user_clinic_id()
            AND (
                -- Записи для сессий без пациента видны
                sessions.patient_id IS NULL
                OR
                -- Записи для сессий с пациентом требуют согласия на запись
                has_active_consent(sessions.patient_id, 'recording')
            )
        )
    );
```

#### Clinical Notes

```sql
CREATE POLICY "Users can view clinic notes with consent"
    ON clinical_notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = clinical_notes.session_id
            AND sessions.clinic_id = get_user_clinic_id()
            AND (
                -- Заметки для сессий без пациента видны
                sessions.patient_id IS NULL
                OR
                -- Заметки для сессий с пациентом требуют согласия
                has_active_consent(sessions.patient_id, 'data_processing')
            )
        )
    );
```

### 3. Оптимизация индексов

```sql
-- Частичный индекс для не-NULL значений (улучшает производительность запросов по patient_id)
CREATE INDEX IF NOT EXISTS idx_sessions_patient_id_not_null 
    ON sessions(patient_id) 
    WHERE patient_id IS NOT NULL;
```

## Безопасность

### Сессии без пациента

- Не содержат PHI (Protected Health Information) данных
- Не требуют согласия пациента на обработку данных
- Видны всем пользователям клиники
- Могут быть привязаны к пациенту позже

### Сессии с пациентом

- Содержат PHI данные
- Требуют активного согласия на обработку данных
- Применяются все политики безопасности
- Аудит всех операций

## Рабочий процесс

### До миграции

1. Пользователь выбирает пациента
2. Создается сессия с patient_id
3. Начинается запись
4. Запись сохраняется

### После миграции

1. Пользователь начинает запись (без выбора пациента)
2. Создается сессия без patient_id
3. Запись сохраняется и транскрибируется
4. Пользователь переходит на страницу Сессий
5. Привязывает сессию к пациенту
6. Сессия появляется в истории пациента

## Обратная совместимость

- Все существующие сессии с patient_id продолжают работать
- RLS политики обновлены для поддержки обоих случаев
- Нет необходимости в миграции данных

## Тестирование

После применения миграции проверьте:

1. ✅ Создание сессии без patient_id
2. ✅ Просмотр сессий без пациента
3. ✅ Привязка сессии к пациенту
4. ✅ RLS политики работают корректно
5. ✅ Записи доступны для сессий без пациента
6. ✅ После привязки применяются проверки согласия

## Откат миграции

Если необходимо откатить миграцию:

```sql
-- ВНИМАНИЕ: Это удалит все сессии без пациента!
-- Сначала привяжите все сессии к пациентам или удалите их

-- Удалить сессии без пациента
DELETE FROM sessions WHERE patient_id IS NULL;

-- Вернуть NOT NULL
ALTER TABLE sessions 
    ALTER COLUMN patient_id SET NOT NULL;

-- Восстановить старые политики (из миграции 005)
-- ...
```

## Связанные изменения

- Фронтенд: `src/pages/ScribePage.tsx` - создание сессий без пациента
- Фронтенд: `src/pages/SessionsPage.tsx` - привязка сессий к пациентам
- Фронтенд: `src/lib/supabase-sessions.ts` - функции для работы с сессиями
- Типы: `src/types/database.types.ts` - обновлены типы для nullable patient_id

## Документация

- Полная документация: `docs/AUDIO_RECORDING_TRANSCRIPTION.md`
- Backend сервис: `backend/transcription-service/README.md`









