-- PsiPilot Assistant - Performance Indexes for RLS Policies
-- Migration: 041_add_performance_indexes
-- Description: Add composite indexes to optimize RLS policy queries for sessions, recordings, and patient_assignments

-- ============================================
-- PATIENT ASSIGNMENTS INDEXES
-- ============================================

-- Composite index for RLS policy queries (doctor_id, patient_id, clinic_id)
-- Used in sessions and recordings RLS policies
CREATE INDEX IF NOT EXISTS idx_patient_assignments_doctor_patient_clinic 
ON patient_assignments(doctor_id, patient_id, clinic_id);

COMMENT ON INDEX idx_patient_assignments_doctor_patient_clinic IS 
'Composite index for fast RLS policy lookups. Used when checking if doctor has access to patient in clinic.';

-- ============================================
-- SESSIONS INDEXES
-- ============================================

-- Composite index for sessions RLS policy (patient_id, clinic_id, deleted_at)
-- Used when checking session access via patient assignments
CREATE INDEX IF NOT EXISTS idx_sessions_patient_clinic_deleted 
ON sessions(patient_id, clinic_id, deleted_at) 
WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_sessions_patient_clinic_deleted IS 
'Composite index for sessions RLS policy. Optimizes queries checking patient_id and clinic_id for non-deleted sessions.';

-- Index for sessions without patient (user_id, clinic_id, deleted_at)
-- Used in RLS policy for sessions without patient_id
CREATE INDEX IF NOT EXISTS idx_sessions_user_clinic_deleted 
ON sessions(user_id, clinic_id, deleted_at) 
WHERE patient_id IS NULL AND deleted_at IS NULL;

COMMENT ON INDEX idx_sessions_user_clinic_deleted IS 
'Index for sessions without patient. Optimizes RLS policy checks for user-owned sessions.';

-- ============================================
-- RECORDINGS INDEXES
-- ============================================

-- Composite index for recordings RLS policy (session_id, deleted_at)
-- Used when joining recordings with sessions
CREATE INDEX IF NOT EXISTS idx_recordings_session_deleted 
ON recordings(session_id, deleted_at) 
WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_recordings_session_deleted IS 
'Composite index for recordings RLS policy. Optimizes queries joining recordings with sessions.';

-- ============================================
-- CLINICAL NOTES INDEXES
-- ============================================

-- Composite index for clinical_notes RLS policy (session_id)
-- Used when joining clinical_notes with sessions
CREATE INDEX IF NOT EXISTS idx_clinical_notes_session_id 
ON clinical_notes(session_id);

COMMENT ON INDEX idx_clinical_notes_session_id IS 
'Index for clinical_notes RLS policy. Optimizes queries joining clinical_notes with sessions.';

-- ============================================
-- CONSENT RECORDS INDEXES (if not exists)
-- ============================================

-- Ensure the composite index exists (may have been created in migration 010)
-- This index is critical for has_active_consent() function performance
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_consent_records_lookup'
    ) THEN
        CREATE INDEX idx_consent_records_lookup 
        ON consent_records(patient_id, consent_type, status, expires_at)
        WHERE status = 'active';
        
        COMMENT ON INDEX idx_consent_records_lookup IS 
        'Composite index for fast consent lookups in RLS policies. Covers the typical query pattern in has_active_consent().';
    END IF;
END $$;

