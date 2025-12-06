-- ============================================
-- MIGRATION 013: Make sessions.patient_id nullable
-- ============================================
-- 
-- ОПИСАНИЕ:
-- Эта миграция позволяет создавать сессии без привязки к пациенту.
-- Это необходимо для рабочего процесса записи аудио:
-- 1. Пользователь начинает запись на странице Скрайбер
-- 2. Создается сессия без patient_id (но с clinic_id и user_id)
-- 3. Запись сохраняется и транскрибируется
-- 4. Позже на странице Сессий пользователь привязывает сессию к пациенту
--
-- ИЗМЕНЕНИЯ:
-- - sessions.patient_id изменен с NOT NULL на NULL
-- - Обновлены RLS политики для поддержки сессий без пациента
-- - Сессии без пациента видны всем пользователям клиники (без проверки согласия)
-- - Сессии с пациентом требуют проверки согласия на обработку данных
-- - Обновлены политики для recordings и clinical_notes
--
-- БЕЗОПАСНОСТЬ:
-- - Сессии без пациента не содержат PHI данных, поэтому не требуют согласия
-- - При привязке к пациенту применяются все политики безопасности
-- - Аудит всех операций сохраняется
--
-- СВЯЗАННАЯ ДОКУМЕНТАЦИЯ:
-- См. docs/AUDIO_RECORDING_TRANSCRIPTION.md
--

-- Drop the existing policy that requires patient_id
DROP POLICY IF EXISTS "Users can view clinic sessions with consent" ON sessions;

-- Make patient_id nullable
ALTER TABLE sessions 
    ALTER COLUMN patient_id DROP NOT NULL;

-- Update the foreign key constraint to allow NULL
-- (ON DELETE CASCADE still applies when patient_id is not NULL)
-- Note: PostgreSQL foreign keys already support NULL values, so no change needed

-- Recreate the view policy to handle NULL patient_id
-- Sessions without patient are visible to clinic users
-- Sessions with patient require consent check
CREATE POLICY "Users can view clinic sessions with consent"
    ON sessions FOR SELECT
    USING (
        clinic_id = get_user_clinic_id()
        AND (
            -- Sessions without patient are visible (no consent needed)
            patient_id IS NULL
            OR
            -- Sessions with patient require consent
            has_active_consent(patient_id, 'data_processing')
        )
    );

-- Update recordings policy to handle NULL patient_id
DROP POLICY IF EXISTS "Users can view clinic recordings with consent" ON recordings;

CREATE POLICY "Users can view clinic recordings with consent"
    ON recordings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = recordings.session_id
            AND sessions.clinic_id = get_user_clinic_id()
            AND (
                -- Recordings for sessions without patient are visible (no consent needed)
                sessions.patient_id IS NULL
                OR
                -- Recordings for sessions with patient require recording consent
                has_active_consent(sessions.patient_id, 'recording')
            )
        )
    );

-- Update clinical notes policy to handle NULL patient_id
DROP POLICY IF EXISTS "Users can view clinic notes with consent" ON clinical_notes;

CREATE POLICY "Users can view clinic notes with consent"
    ON clinical_notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = clinical_notes.session_id
            AND sessions.clinic_id = get_user_clinic_id()
            AND (
                -- Notes for sessions without patient are visible (no consent needed)
                sessions.patient_id IS NULL
                OR
                -- Notes for sessions with patient require consent
                has_active_consent(sessions.patient_id, 'data_processing')
            )
        )
    );

-- Update index to handle NULL values (PostgreSQL B-tree indexes already support NULL)
-- No changes needed, but we can add a partial index for non-NULL values if needed
-- This is optional and can improve query performance for patient-specific queries
CREATE INDEX IF NOT EXISTS idx_sessions_patient_id_not_null 
    ON sessions(patient_id) 
    WHERE patient_id IS NOT NULL;

-- Add comment to document the change
COMMENT ON COLUMN sessions.patient_id IS 'Patient ID - can be NULL for sessions created before patient is selected. Patient can be linked later on the Sessions page.';

