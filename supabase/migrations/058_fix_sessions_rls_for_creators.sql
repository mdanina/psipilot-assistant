-- PsiPilot Assistant - Fix Sessions RLS for Session Creators
-- Migration: 058_fix_sessions_rls_for_creators
-- Description: Fix RLS policies to allow session creators to always see their own sessions
--
-- PROBLEM:
-- When a specialist creates a session with a patient (via calendar/scriber), they cannot
-- create recordings for that session because the FK check fails. The FK check requires
-- SELECT on sessions table, and the current RLS policy doesn't allow the session creator
-- to see their own session if:
-- 1. They are not admin, AND
-- 2. They don't have a patient_assignment record, AND
-- 3. The session has a patient_id (not NULL)
--
-- Additionally, if the patient doesn't have 'data_processing' consent active,
-- the SELECT fails completely.
--
-- SOLUTION:
-- Add condition: session creator (user_id = auth.uid()) can always see their own sessions
-- This is a reasonable security model - you should always be able to access sessions you created

-- ============================================
-- FIX SESSIONS SELECT POLICY
-- ============================================

DROP POLICY IF EXISTS "Users can view assigned patient sessions or admin sees all" ON sessions;

CREATE POLICY "Users can view assigned patient sessions or admin sees all"
    ON sessions FOR SELECT
    USING (
        (
            -- Admin sees all sessions in clinic
            (is_user_admin() AND clinic_id = get_user_clinic_id())
            OR
            -- Session creator can ALWAYS see their own sessions (NEW: critical for recordings FK check)
            (
                user_id = auth.uid()
                AND clinic_id = get_user_clinic_id()
            )
            OR
            -- Specialist sees sessions of assigned patients
            (
                patient_id IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM patient_assignments
                    WHERE patient_id = sessions.patient_id
                      AND doctor_id = auth.uid()
                      AND clinic_id = get_user_clinic_id()
                )
            )
        )
        -- Consent check: only required for sessions WITH patient that user didn't create
        AND (
            -- No consent needed for sessions without patient
            patient_id IS NULL
            -- Session creators don't need consent check for their own sessions
            OR user_id = auth.uid()
            -- Others need consent
            OR has_active_consent(patient_id, 'data_processing')
        )
    );

COMMENT ON POLICY "Users can view assigned patient sessions or admin sees all" ON sessions IS
'Пользователь может видеть сессии если: 1) он админ клиники, 2) он создатель сессии, 3) пациент ему назначен. Для чужих сессий с пациентом требуется согласие.';

-- ============================================
-- FIX RECORDINGS SELECT POLICY
-- ============================================

DROP POLICY IF EXISTS "Users can view assigned patient recordings or admin sees all" ON recordings;

CREATE POLICY "Users can view assigned patient recordings or admin sees all"
    ON recordings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.id = recordings.session_id
            AND (
                -- Admin sees all recordings in clinic
                (is_user_admin() AND s.clinic_id = get_user_clinic_id())
                OR
                -- Session creator can see recordings for their sessions (critical for transcription flow)
                (
                    s.user_id = auth.uid()
                    AND s.clinic_id = get_user_clinic_id()
                )
                OR
                -- Specialist sees recordings for assigned patients
                (
                    s.patient_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM patient_assignments
                        WHERE patient_id = s.patient_id
                          AND doctor_id = auth.uid()
                          AND clinic_id = s.clinic_id
                    )
                )
            )
        )
        -- Consent check: only for sessions with patient that user didn't create
        AND (
            -- No consent needed for sessions without patient
            NOT EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = recordings.session_id
                AND s.patient_id IS NOT NULL
            )
            -- Session creator doesn't need consent for their own recordings
            OR EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = recordings.session_id
                AND s.user_id = auth.uid()
            )
            -- Others need consent
            OR EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = recordings.session_id
                AND has_active_consent(s.patient_id, 'recording')
            )
        )
    );

COMMENT ON POLICY "Users can view assigned patient recordings or admin sees all" ON recordings IS
'Пользователь может видеть записи если: 1) он админ клиники, 2) он создатель сессии, 3) пациент ему назначен. Для чужих записей с пациентом требуется согласие на запись.';

-- ============================================
-- FIX CLINICAL NOTES SELECT POLICY
-- ============================================

DROP POLICY IF EXISTS "Users can view assigned patient notes or admin sees all" ON clinical_notes;

CREATE POLICY "Users can view assigned patient notes or admin sees all"
    ON clinical_notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.id = clinical_notes.session_id
            AND (
                -- Admin sees all notes in clinic
                (is_user_admin() AND s.clinic_id = get_user_clinic_id())
                OR
                -- Session creator can see notes for their sessions
                (
                    s.user_id = auth.uid()
                    AND s.clinic_id = get_user_clinic_id()
                )
                OR
                -- Specialist sees notes for assigned patients
                (
                    s.patient_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM patient_assignments
                        WHERE patient_id = s.patient_id
                          AND doctor_id = auth.uid()
                          AND clinic_id = s.clinic_id
                    )
                )
            )
        )
        -- Consent check: only for sessions with patient that user didn't create
        AND (
            -- No consent needed for sessions without patient
            NOT EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = clinical_notes.session_id
                AND s.patient_id IS NOT NULL
            )
            -- Session creator doesn't need consent
            OR EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = clinical_notes.session_id
                AND s.user_id = auth.uid()
            )
            -- Others need consent
            OR EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = clinical_notes.session_id
                AND has_active_consent(s.patient_id, 'data_processing')
            )
        )
    );

COMMENT ON POLICY "Users can view assigned patient notes or admin sees all" ON clinical_notes IS
'Пользователь может видеть заметки если: 1) он админ клиники, 2) он создатель сессии, 3) пациент ему назначен. Для чужих заметок с пациентом требуется согласие.';
