-- PsiPilot Assistant - Deep Performance and Stability Fixes
-- Migration: 011_deep_performance_fixes
-- Description: Adds missing indexes, optimizes functions, improves error handling

-- ============================================
-- 1. ADD MISSING INDEXES FOR FK CONSTRAINTS
-- ============================================

-- Index for profiles.clinic_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON profiles(clinic_id) WHERE clinic_id IS NOT NULL;

-- Index for sections.clinical_note_id (if not exists - may already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_sections_clinical_note_id'
    ) THEN
        CREATE INDEX idx_sections_clinical_note_id ON sections(clinical_note_id);
    END IF;
END $$;

-- Index for recordings.session_id (if not exists - may already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_recordings_session_id'
    ) THEN
        CREATE INDEX idx_recordings_session_id ON recordings(session_id);
    END IF;
END $$;

-- Index for recordings.user_id (if not exists - may already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_recordings_user_id'
    ) THEN
        CREATE INDEX idx_recordings_user_id ON recordings(user_id);
    END IF;
END $$;

-- Index for documents.session_id (if not exists - may already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_documents_session_id'
    ) THEN
        CREATE INDEX idx_documents_session_id ON documents(session_id) WHERE session_id IS NOT NULL;
    END IF;
END $$;

-- Index for section_templates.clinic_id (if not exists - may already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_section_templates_clinic_id'
    ) THEN
        CREATE INDEX idx_section_templates_clinic_id ON section_templates(clinic_id) WHERE clinic_id IS NOT NULL;
    END IF;
END $$;

-- Index for clinical_notes.session_id (if not exists - may already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_clinical_notes_session_id'
    ) THEN
        CREATE INDEX idx_clinical_notes_session_id ON clinical_notes(session_id);
    END IF;
END $$;

-- Index for consent_records.patient_id (for RLS and lookups)
CREATE INDEX IF NOT EXISTS idx_consent_records_patient_id ON consent_records(patient_id);

COMMENT ON INDEX idx_profiles_clinic_id IS 'Index for FK constraint on profiles.clinic_id. Used in RLS policies.';
COMMENT ON INDEX idx_consent_records_patient_id IS 'Index for FK constraint on consent_records.patient_id. Used in RLS consent checks.';

-- ============================================
-- 2. FIX permanently_delete_patient_data TO USE CASCADE
-- ============================================

-- Drop all existing versions of the function to avoid ambiguity
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop all versions of permanently_delete_patient_data
    FOR r IN 
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'permanently_delete_patient_data'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors if function doesn't exist
        NULL;
END $$;

CREATE OR REPLACE FUNCTION permanently_delete_patient_data(patient_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can permanently delete data';
    END IF;

    -- Check if user has access to this patient
    IF NOT EXISTS (
        SELECT 1 FROM patients
        WHERE id = patient_uuid
        AND clinic_id = get_user_clinic_id()
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Log the deletion BEFORE deleting
    PERFORM log_audit_event(
        'permanent_delete',
        'patient_data',
        'patient',
        patient_uuid,
        (SELECT name FROM patients WHERE id = patient_uuid),
        (SELECT to_jsonb(p.*) FROM patients p WHERE p.id = patient_uuid),
        NULL,
        true,
        ARRAY['all']
    );

    -- Delete patient - CASCADE will handle all related data automatically
    -- This is more efficient and safer than manual deletion
    DELETE FROM patients WHERE id = patient_uuid;

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error and re-raise
        RAISE EXCEPTION 'Error deleting patient data: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION permanently_delete_patient_data IS
'Permanently deletes patient data and all related records.
Uses CASCADE deletion for efficiency and safety.
Only administrators can use this function.';

-- ============================================
-- 3. OPTIMIZE export_patient_data WITH LIMITS AND WARNINGS
-- ============================================

-- Drop all existing versions of the function to avoid ambiguity
-- Using CASCADE to remove all overloads and dependencies
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop all versions of export_patient_data
    FOR r IN 
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'export_patient_data'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors if function doesn't exist
        NULL;
END $$;

CREATE OR REPLACE FUNCTION export_patient_data(patient_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    session_count INTEGER;
    note_count INTEGER;
    document_count INTEGER;
    max_sessions INTEGER := 1000;
    max_notes INTEGER := 5000;
    max_documents INTEGER := 1000;
BEGIN
    -- Check if user has access to this patient
    IF NOT EXISTS (
        SELECT 1 FROM patients
        WHERE id = patient_uuid
        AND clinic_id = get_user_clinic_id()
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Check data volume before export
    SELECT COUNT(*) INTO session_count FROM sessions WHERE patient_id = patient_uuid;
    SELECT COUNT(*) INTO note_count FROM clinical_notes WHERE patient_id = patient_uuid;
    SELECT COUNT(*) INTO document_count FROM documents WHERE patient_id = patient_uuid;

    -- Warn if data volume is large
    IF session_count > max_sessions OR note_count > max_notes OR document_count > max_documents THEN
        RAISE WARNING 'Large data volume detected: % sessions, % notes, % documents. Export may be slow.', 
            session_count, note_count, document_count;
    END IF;

    -- Log the export
    PERFORM log_audit_event(
        'export',
        'patient_data',
        'patient',
        patient_uuid,
        NULL,
        jsonb_build_object(
            'session_count', session_count,
            'note_count', note_count,
            'document_count', document_count
        ),
        NULL,
        true,
        ARRAY['all']
    );

    -- Compile all patient data with limits to prevent memory issues
    SELECT jsonb_build_object(
        'patient', (SELECT to_jsonb(p.*) FROM patients p WHERE p.id = patient_uuid),
        'sessions', (
            SELECT jsonb_agg(to_jsonb(s.*)) 
            FROM (
                SELECT * FROM sessions 
                WHERE patient_id = patient_uuid 
                ORDER BY created_at DESC 
                LIMIT max_sessions
            ) s
        ),
        'clinical_notes', (
            SELECT jsonb_agg(to_jsonb(cn.*)) 
            FROM (
                SELECT * FROM clinical_notes 
                WHERE patient_id = patient_uuid 
                ORDER BY created_at DESC 
                LIMIT max_notes
            ) cn
        ),
        'documents', (
            SELECT jsonb_agg(to_jsonb(d.*)) 
            FROM (
                SELECT * FROM documents 
                WHERE patient_id = patient_uuid 
                ORDER BY created_at DESC 
                LIMIT max_documents
            ) d
        ),
        'consent_records', (SELECT jsonb_agg(to_jsonb(cr.*)) FROM consent_records cr WHERE cr.patient_id = patient_uuid),
        'exported_at', NOW(),
        'exported_by', auth.uid(),
        'data_volume_warning', CASE 
            WHEN session_count > max_sessions OR note_count > max_notes OR document_count > max_documents 
            THEN true 
            ELSE false 
        END
    ) INTO result;

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error exporting patient data: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION export_patient_data IS
'Exports all patient data in JSONB format for GDPR compliance.
Includes limits to prevent memory issues with large datasets.
Logs data volume warnings for monitoring.';

-- ============================================
-- 4. IMPROVE create_default_consent ERROR HANDLING
-- ============================================

-- Note: We use CREATE OR REPLACE directly for trigger functions
-- This preserves the trigger relationship
-- DROP is not needed as CREATE OR REPLACE works for trigger functions

CREATE OR REPLACE FUNCTION create_default_consent()
RETURNS TRIGGER AS $$
DECLARE
    v_collected_by UUID;
BEGIN
    -- Get the user who created the patient
    v_collected_by := COALESCE(NEW.created_by, auth.uid());

    -- Validate that we have a user ID
    IF v_collected_by IS NULL THEN
        RAISE WARNING 'Cannot create default consent: no user ID available for patient %', NEW.id;
        RETURN NEW; -- Don't fail the patient creation
    END IF;

    -- Create default 'data_processing' consent (required for basic functionality)
    BEGIN
        INSERT INTO consent_records (
            patient_id,
            consent_type,
            consent_purpose,
            legal_basis,
            status,
            given_at,
            consent_method,
            collected_by,
            data_categories,
            notes
        ) VALUES (
            NEW.id,
            'data_processing',
            'Обработка персональных данных для оказания медицинских услуг в соответствии с договором',
            'contract', -- GDPR Article 6(1)(b) - performance of a contract
            'active',
            NOW(),
            'electronic',
            v_collected_by,
            ARRAY['personal', 'health'],
            'Автоматически создано при регистрации пациента. Требует подтверждения.'
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log error but don't fail patient creation
            RAISE WARNING 'Error creating default consent for patient %: %', NEW.id, SQLERRM;
            -- Optionally log to trigger_errors table if it exists
            BEGIN
                INSERT INTO trigger_errors (
                    trigger_name,
                    table_name,
                    record_id,
                    error_message,
                    error_detail
                ) VALUES (
                    'create_patient_default_consent',
                    'consent_records',
                    NEW.id,
                    SQLERRM,
                    SQLSTATE || ': ' || SQLERRM
                );
            EXCEPTION
                WHEN OTHERS THEN
                    -- Ignore if trigger_errors table doesn't exist
                    NULL;
            END;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_default_consent() IS
'Automatically creates a default data_processing consent when a new patient is added.
Improved error handling prevents patient creation failures.
Errors are logged but do not block patient creation.';

-- ============================================
-- 5. OPTIMIZE cleanup_expired_data WITH BATCH PROCESSING
-- ============================================

-- Drop all existing versions of the function to avoid ambiguity
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop all versions of cleanup_expired_data
    FOR r IN 
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'cleanup_expired_data'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors if function doesn't exist
        NULL;
END $$;

CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE (
    table_name TEXT,
    deleted_count INTEGER
) AS $$
DECLARE
    v_audit_log_retention INTERVAL := INTERVAL '7 years'; -- HIPAA requirement
    v_failed_login_retention INTERVAL := INTERVAL '90 days';
    v_expired_sessions_count INTEGER;
    v_old_audit_logs_count INTEGER;
    v_old_failed_logins_count INTEGER;
    v_soft_deleted_patients_count INTEGER;
    v_soft_delete_retention INTERVAL := INTERVAL '30 days'; -- Keep soft-deleted for 30 days
    v_batch_size INTEGER := 1000; -- Process in batches to avoid long locks
    v_deleted_batch INTEGER;
    v_total_deleted INTEGER;
BEGIN
    -- 1. Cleanup expired user sessions (batch processing)
    v_total_deleted := 0;
    LOOP
        DELETE FROM user_sessions
        WHERE id IN (
            SELECT id FROM user_sessions
            WHERE (expires_at < NOW() - INTERVAL '1 day'
                OR (is_active = false AND terminated_at < NOW() - INTERVAL '7 days'))
            LIMIT v_batch_size
        );
        GET DIAGNOSTICS v_deleted_batch = ROW_COUNT;
        v_total_deleted := v_total_deleted + v_deleted_batch;
        EXIT WHEN v_deleted_batch = 0;
    END LOOP;
    v_expired_sessions_count := v_total_deleted;

    table_name := 'user_sessions';
    deleted_count := v_expired_sessions_count;
    RETURN NEXT;

    -- 2. Cleanup old failed login attempts (batch processing)
    v_total_deleted := 0;
    LOOP
        DELETE FROM failed_login_attempts
        WHERE id IN (
            SELECT id FROM failed_login_attempts
            WHERE created_at < NOW() - v_failed_login_retention
            LIMIT v_batch_size
        );
        GET DIAGNOSTICS v_deleted_batch = ROW_COUNT;
        v_total_deleted := v_total_deleted + v_deleted_batch;
        EXIT WHEN v_deleted_batch = 0;
    END LOOP;
    v_old_failed_logins_count := v_total_deleted;

    table_name := 'failed_login_attempts';
    deleted_count := v_old_failed_logins_count;
    RETURN NEXT;

    -- 3. Permanently delete soft-deleted patients after retention period (batch processing)
    -- Process in batches to avoid long locks
    v_total_deleted := 0;
    LOOP
        -- Delete related data first (CASCADE will handle this, but we do it explicitly for better control)
        WITH patients_to_delete AS (
            SELECT id FROM patients
            WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - v_soft_delete_retention
            LIMIT v_batch_size
        )
        DELETE FROM sections WHERE clinical_note_id IN (
            SELECT cn.id FROM clinical_notes cn
            JOIN patients_to_delete ptd ON cn.patient_id = ptd.id
        );

        WITH patients_to_delete AS (
            SELECT id FROM patients
            WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - v_soft_delete_retention
            LIMIT v_batch_size
        )
        DELETE FROM clinical_notes WHERE patient_id IN (
            SELECT id FROM patients_to_delete
        );

        WITH patients_to_delete AS (
            SELECT id FROM patients
            WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - v_soft_delete_retention
            LIMIT v_batch_size
        )
        DELETE FROM recordings WHERE session_id IN (
            SELECT s.id FROM sessions s
            JOIN patients_to_delete ptd ON s.patient_id = ptd.id
        );

        WITH patients_to_delete AS (
            SELECT id FROM patients
            WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - v_soft_delete_retention
            LIMIT v_batch_size
        )
        DELETE FROM sessions WHERE patient_id IN (
            SELECT id FROM patients_to_delete
        );

        WITH patients_to_delete AS (
            SELECT id FROM patients
            WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - v_soft_delete_retention
            LIMIT v_batch_size
        )
        DELETE FROM documents WHERE patient_id IN (
            SELECT id FROM patients_to_delete
        );

        WITH patients_to_delete AS (
            SELECT id FROM patients
            WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - v_soft_delete_retention
            LIMIT v_batch_size
        )
        DELETE FROM consent_records WHERE patient_id IN (
            SELECT id FROM patients_to_delete
        );

        DELETE FROM patients
        WHERE id IN (
            SELECT id FROM patients
            WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - v_soft_delete_retention
            LIMIT v_batch_size
        );
        GET DIAGNOSTICS v_deleted_batch = ROW_COUNT;
        v_total_deleted := v_total_deleted + v_deleted_batch;
        EXIT WHEN v_deleted_batch = 0;
    END LOOP;
    v_soft_deleted_patients_count := v_total_deleted;

    table_name := 'patients (hard delete after soft delete)';
    deleted_count := v_soft_deleted_patients_count;
    RETURN NEXT;

    -- 4. Archive old audit logs (don't delete - required for compliance)
    -- This just returns count, actual archiving would be done externally
    SELECT COUNT(*) INTO v_old_audit_logs_count
    FROM audit_logs
    WHERE created_at < NOW() - v_audit_log_retention;

    table_name := 'audit_logs (candidates for archiving)';
    deleted_count := v_old_audit_logs_count;
    RETURN NEXT;

    -- Log the cleanup operation
    PERFORM log_audit_event(
        'retention_cleanup',
        'admin',
        'system',
        NULL,
        'Automated retention cleanup',
        NULL,
        jsonb_build_object(
            'sessions_deleted', v_expired_sessions_count,
            'failed_logins_deleted', v_old_failed_logins_count,
            'patients_hard_deleted', v_soft_deleted_patients_count,
            'audit_logs_to_archive', v_old_audit_logs_count
        ),
        false,
        NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_data IS
'Cleans up expired data according to retention policies.
Uses batch processing to avoid long locks and improve performance.
Should be called by a scheduled job (pg_cron or external scheduler).
Example: SELECT * FROM cleanup_expired_data();';

-- ============================================
-- 6. DOCUMENT LOCK ORDER STANDARDS
-- ============================================

COMMENT ON SCHEMA public IS
'Migration 011: Deep performance and stability fixes.

LOCK ORDER STANDARDS:
To prevent deadlocks, always acquire locks in this order:
1. profiles (highest level - user/clinic data)
2. clinics
3. patients
4. sessions
5. clinical_notes
6. sections (lowest level - note content)

When updating multiple tables in a transaction, follow this order.
Functions that modify multiple tables should respect this order.

PERFORMANCE OPTIMIZATIONS:
- Added missing indexes for FK constraints (8 indexes total)
- Fixed permanently_delete_patient_data to use CASCADE
- Optimized export_patient_data with limits and warnings
- Improved create_default_consent error handling
- Optimized cleanup_expired_data with batch processing
- Improved statistics collection for audit_logs
- Documented RLS consent check optimization strategy';

-- ============================================
-- 7. IMPROVE STATISTICS COLLECTION FOR audit_logs
-- ============================================

-- Set more aggressive autovacuum settings for audit_logs
ALTER TABLE audit_logs SET (
    autovacuum_analyze_scale_factor = 0.1,  -- Analyze after 10% changes
    autovacuum_analyze_threshold = 1000      -- Or after 1000 row changes
);

-- Update statistics immediately
ANALYZE audit_logs;

COMMENT ON TABLE audit_logs IS
'Audit log table for compliance and security monitoring.
Statistics are updated more frequently for better query performance.';

-- ============================================
-- 8. DOCUMENT RLS CONSENT CHECK OPTIMIZATION STRATEGY
-- ============================================

COMMENT ON FUNCTION has_active_consent IS
'Checks if a patient has active consent for a specific type.
OPTIMIZATION STRATEGY:
- Uses idx_consent_records_lookup composite index for fast lookups
- Partial index on status=''active'' reduces index size
- Function is STABLE for query planner optimization
- Consider caching results in application layer for frequently accessed patients';

COMMENT ON FUNCTION has_active_consents IS
'Checks if a patient has active consent for multiple types.
OPTIMIZATION STRATEGY:
- Uses idx_consent_records_lookup composite index
- Single query with array operations is more efficient than multiple function calls
- Consider batching consent checks in application layer';

-- ============================================
-- SUMMARY
-- ============================================

-- Final schema comment update
COMMENT ON SCHEMA public IS
'Migration 011: Deep performance and stability fixes.
Changes:
1. Added missing indexes for FK constraints (8 indexes total)
2. Fixed permanently_delete_patient_data to use CASCADE
3. Optimized export_patient_data with limits and warnings
4. Improved create_default_consent error handling
5. Optimized cleanup_expired_data with batch processing
6. Documented lock order standards
7. Improved statistics collection for audit_logs
8. Documented RLS consent check optimization strategy';

