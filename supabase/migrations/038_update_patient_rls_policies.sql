-- PsiPilot Assistant - Update RLS Policies for Patient Assignments
-- Migration: 038_update_patient_rls_policies
-- Description: Update RLS policies to use patient assignments instead of clinic-wide access

-- ============================================
-- UPDATE PATIENTS RLS POLICIES
-- ============================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view clinic patients" ON patients;
DROP POLICY IF EXISTS "Users can view clinic patients with consent" ON patients;

-- New policy: admin sees all, specialist sees only assigned
CREATE POLICY "Users can view assigned patients or admin sees all"
    ON patients FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            -- Admin sees all patients in clinic
            (is_user_admin() AND clinic_id = get_user_clinic_id())
            OR
            -- Specialist sees only assigned patients
            (
                EXISTS (
                    SELECT 1 FROM patient_assignments
                    WHERE patient_id = patients.id
                      AND doctor_id = auth.uid()
                      AND clinic_id = get_user_clinic_id()
                )
            )
        )
        -- Consent check (if consent system is enabled)
        AND has_active_consent(id, 'data_processing')
    );

COMMENT ON POLICY "Users can view assigned patients or admin sees all" ON patients IS 
'Администратор видит всех пациентов клиники. Специалист видит только назначенных ему пациентов.';

-- ============================================
-- UPDATE SESSIONS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view clinic sessions with consent" ON sessions;

CREATE POLICY "Users can view assigned patient sessions or admin sees all"
    ON sessions FOR SELECT
    USING (
        (
            -- Admin sees all sessions in clinic
            (is_user_admin() AND clinic_id = get_user_clinic_id())
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
            OR
            -- Specialist sees own sessions without patient
            (
                patient_id IS NULL
                AND user_id = auth.uid()
                AND clinic_id = get_user_clinic_id()
            )
        )
        AND (
            patient_id IS NULL 
            OR has_active_consent(patient_id, 'data_processing')
        )
    );

COMMENT ON POLICY "Users can view assigned patient sessions or admin sees all" ON sessions IS 
'Администратор видит все сессии клиники. Специалист видит сессии назначенных пациентов и свои сессии без пациента.';

-- ============================================
-- UPDATE CLINICAL NOTES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view clinic notes with consent" ON clinical_notes;

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
                OR
                -- Specialist sees own notes for sessions without patient
                (
                    s.patient_id IS NULL
                    AND s.user_id = auth.uid()
                    AND s.clinic_id = get_user_clinic_id()
                )
            )
        )
        AND (
            NOT EXISTS (
                SELECT 1 FROM sessions s 
                WHERE s.id = clinical_notes.session_id 
                AND s.patient_id IS NOT NULL
            )
            OR
            EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = clinical_notes.session_id
                AND has_active_consent(s.patient_id, 'data_processing')
            )
        )
    );

COMMENT ON POLICY "Users can view assigned patient notes or admin sees all" ON clinical_notes IS 
'Администратор видит все заметки клиники. Специалист видит заметки для назначенных пациентов.';

-- ============================================
-- UPDATE DOCUMENTS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view clinic documents" ON documents;

CREATE POLICY "Users can view assigned patient documents or admin sees all"
    ON documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM patients p
            WHERE p.id = documents.patient_id
            AND (
                -- Admin sees all documents in clinic
                (is_user_admin() AND p.clinic_id = get_user_clinic_id())
                OR
                -- Specialist sees documents for assigned patients
                EXISTS (
                    SELECT 1 FROM patient_assignments pa
                    WHERE pa.patient_id = p.id
                      AND pa.doctor_id = auth.uid()
                      AND pa.clinic_id = p.clinic_id
                )
            )
        )
    );

COMMENT ON POLICY "Users can view assigned patient documents or admin sees all" ON documents IS 
'Администратор видит все документы клиники. Специалист видит документы назначенных пациентов.';

-- ============================================
-- UPDATE RECORDINGS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view clinic recordings with consent" ON recordings;

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
                OR
                -- Specialist sees own recordings for sessions without patient
                (
                    s.patient_id IS NULL
                    AND s.user_id = auth.uid()
                    AND s.clinic_id = get_user_clinic_id()
                )
            )
        )
        AND (
            NOT EXISTS (
                SELECT 1 FROM sessions s 
                WHERE s.id = recordings.session_id 
                AND s.patient_id IS NOT NULL
            )
            OR
            EXISTS (
                SELECT 1 FROM sessions s
                WHERE s.id = recordings.session_id
                AND has_active_consent(s.patient_id, 'recording')
            )
        )
    );

COMMENT ON POLICY "Users can view assigned patient recordings or admin sees all" ON recordings IS 
'Администратор видит все записи клиники. Специалист видит записи назначенных пациентов.';

-- ============================================
-- RLS POLICIES FOR PATIENT_ASSIGNMENTS
-- ============================================

-- Enable RLS on patient_assignments
ALTER TABLE patient_assignments ENABLE ROW LEVEL SECURITY;

-- Admin sees all assignments in clinic
CREATE POLICY "Admins can view all clinic assignments"
    ON patient_assignments FOR SELECT
    USING (
        is_user_admin() 
        AND clinic_id = get_user_clinic_id()
    );

-- Specialist sees only own assignments
CREATE POLICY "Specialists can view own assignments"
    ON patient_assignments FOR SELECT
    USING (
        doctor_id = auth.uid()
        AND clinic_id = get_user_clinic_id()
    );

-- Only admin can manage assignments
CREATE POLICY "Admins can manage assignments"
    ON patient_assignments FOR ALL
    USING (
        is_user_admin() 
        AND clinic_id = get_user_clinic_id()
    )
    WITH CHECK (
        is_user_admin() 
        AND clinic_id = get_user_clinic_id()
    );

COMMENT ON POLICY "Admins can manage assignments" ON patient_assignments IS 
'Только администратор может создавать, обновлять и удалять назначения.';

