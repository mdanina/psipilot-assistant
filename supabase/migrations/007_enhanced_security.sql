-- PsiPilot Assistant - Enhanced Security Features
-- Migration: 007_enhanced_security
-- Description: PII encryption, auto-consent, backup codes hashing, retention cleanup,
--              enhanced IP blocking, and Break-the-Glass emergency access

-- ============================================
-- 1. PII ENCRYPTION FOR PATIENTS TABLE
-- ============================================

-- Add encrypted columns for PII fields
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'name_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN name_encrypted BYTEA;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'email_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN email_encrypted BYTEA;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'phone_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN phone_encrypted BYTEA;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'address_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN address_encrypted BYTEA;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'notes_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN notes_encrypted BYTEA;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'pii_encryption_version'
    ) THEN
        ALTER TABLE patients ADD COLUMN pii_encryption_version INTEGER DEFAULT 1;
    END IF;
END $$;

-- Index for migration queries (find unencrypted records)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_patients_pii_encrypted'
    ) THEN
        CREATE INDEX idx_patients_pii_encrypted ON patients(pii_encryption_version)
        WHERE name_encrypted IS NOT NULL;
    END IF;
END $$;

COMMENT ON COLUMN patients.name_encrypted IS 'AES-GCM encrypted patient name (application-level encryption)';
COMMENT ON COLUMN patients.email_encrypted IS 'AES-GCM encrypted patient email (application-level encryption)';
COMMENT ON COLUMN patients.phone_encrypted IS 'AES-GCM encrypted patient phone (application-level encryption)';
COMMENT ON COLUMN patients.address_encrypted IS 'AES-GCM encrypted patient address (application-level encryption)';
COMMENT ON COLUMN patients.notes_encrypted IS 'AES-GCM encrypted patient notes (application-level encryption)';

-- ============================================
-- 2. AUTO-CONSENT ON PATIENT CREATION
-- ============================================

-- Function to create default consent records when a patient is added
CREATE OR REPLACE FUNCTION create_default_consent()
RETURNS TRIGGER AS $$
DECLARE
    v_collected_by UUID;
BEGIN
    -- Get the user who created the patient
    v_collected_by := COALESCE(NEW.created_by, auth.uid());

    -- Create default 'data_processing' consent (required for basic functionality)
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-consent
DROP TRIGGER IF EXISTS create_patient_default_consent ON patients;
CREATE TRIGGER create_patient_default_consent
    AFTER INSERT ON patients
    FOR EACH ROW EXECUTE FUNCTION create_default_consent();

COMMENT ON FUNCTION create_default_consent() IS
'Automatically creates a default data_processing consent when a new patient is added.
This ensures RLS policies with consent checks do not block access to newly created patients.';

-- ============================================
-- 3. BACKUP CODES HASHING
-- ============================================

-- Enable pgcrypto extension for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add hashed backup codes column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'backup_codes_hashed'
    ) THEN
        ALTER TABLE profiles ADD COLUMN backup_codes_hashed TEXT[];
    END IF;
END $$;

-- Function to hash a backup code
CREATE OR REPLACE FUNCTION hash_backup_code(code TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Use SHA-256 with a salt derived from the code itself
    -- In production, use a proper salt stored separately
    RETURN encode(digest(code || 'psipilot_backup_salt_v1', 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to verify a backup code
CREATE OR REPLACE FUNCTION verify_backup_code(user_uuid UUID, code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_hashed_code TEXT;
    v_codes TEXT[];
    v_code TEXT;
    v_index INTEGER := 0;
BEGIN
    v_hashed_code := hash_backup_code(code);

    SELECT backup_codes_hashed INTO v_codes
    FROM profiles
    WHERE id = user_uuid;

    IF v_codes IS NULL THEN
        RETURN false;
    END IF;

    -- Check each hashed code
    FOREACH v_code IN ARRAY v_codes LOOP
        v_index := v_index + 1;
        IF v_code = v_hashed_code THEN
            -- Remove used code (one-time use)
            UPDATE profiles
            SET backup_codes_hashed = array_remove(backup_codes_hashed, v_code),
                updated_at = NOW()
            WHERE id = user_uuid;

            -- Log the backup code usage
            PERFORM log_audit_event(
                'backup_code_used',
                'authentication',
                'profile',
                user_uuid,
                NULL,
                NULL,
                jsonb_build_object('code_index', v_index),
                false,
                NULL
            );

            RETURN true;
        END IF;
    END LOOP;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate and hash new backup codes
CREATE OR REPLACE FUNCTION generate_backup_codes(user_uuid UUID, code_count INTEGER DEFAULT 10)
RETURNS TEXT[] AS $$
DECLARE
    v_codes TEXT[] := ARRAY[]::TEXT[];
    v_hashed_codes TEXT[] := ARRAY[]::TEXT[];
    v_code TEXT;
    i INTEGER;
BEGIN
    -- Only allow user to generate their own codes
    IF user_uuid != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: can only generate codes for own account';
    END IF;

    FOR i IN 1..code_count LOOP
        -- Generate random 8-character code
        v_code := upper(encode(gen_random_bytes(4), 'hex'));
        v_codes := array_append(v_codes, v_code);
        v_hashed_codes := array_append(v_hashed_codes, hash_backup_code(v_code));
    END LOOP;

    -- Store hashed codes
    UPDATE profiles
    SET backup_codes_hashed = v_hashed_codes,
        backup_codes = NULL, -- Clear old plaintext codes
        updated_at = NOW()
    WHERE id = user_uuid;

    -- Log the generation
    PERFORM log_audit_event(
        'backup_codes_generated',
        'authentication',
        'profile',
        user_uuid,
        NULL,
        NULL,
        jsonb_build_object('count', code_count),
        false,
        NULL
    );

    -- Return plaintext codes (only time they're visible)
    RETURN v_codes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION hash_backup_code IS 'Hashes a backup code using SHA-256';
COMMENT ON FUNCTION verify_backup_code IS 'Verifies and consumes a backup code (one-time use)';
COMMENT ON FUNCTION generate_backup_codes IS 'Generates new backup codes, returns plaintext (one-time), stores hashed';

-- ============================================
-- 4. RETENTION POLICY CLEANUP FUNCTION
-- ============================================

-- Function to cleanup expired data based on retention policies
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
BEGIN
    -- 1. Cleanup expired user sessions
    DELETE FROM user_sessions
    WHERE expires_at < NOW() - INTERVAL '1 day'
    OR (is_active = false AND terminated_at < NOW() - INTERVAL '7 days');
    GET DIAGNOSTICS v_expired_sessions_count = ROW_COUNT;

    table_name := 'user_sessions';
    deleted_count := v_expired_sessions_count;
    RETURN NEXT;

    -- 2. Cleanup old failed login attempts (keep 90 days for security analysis)
    DELETE FROM failed_login_attempts
    WHERE created_at < NOW() - v_failed_login_retention;
    GET DIAGNOSTICS v_old_failed_logins_count = ROW_COUNT;

    table_name := 'failed_login_attempts';
    deleted_count := v_old_failed_logins_count;
    RETURN NEXT;

    -- 3. Permanently delete soft-deleted patients after retention period
    -- First, delete all related data
    DELETE FROM sections WHERE clinical_note_id IN (
        SELECT cn.id FROM clinical_notes cn
        JOIN patients p ON cn.patient_id = p.id
        WHERE p.deleted_at IS NOT NULL
        AND p.deleted_at < NOW() - v_soft_delete_retention
    );

    DELETE FROM clinical_notes WHERE patient_id IN (
        SELECT id FROM patients
        WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - v_soft_delete_retention
    );

    DELETE FROM recordings WHERE session_id IN (
        SELECT s.id FROM sessions s
        JOIN patients p ON s.patient_id = p.id
        WHERE p.deleted_at IS NOT NULL
        AND p.deleted_at < NOW() - v_soft_delete_retention
    );

    DELETE FROM sessions WHERE patient_id IN (
        SELECT id FROM patients
        WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - v_soft_delete_retention
    );

    DELETE FROM documents WHERE patient_id IN (
        SELECT id FROM patients
        WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - v_soft_delete_retention
    );

    DELETE FROM consent_records WHERE patient_id IN (
        SELECT id FROM patients
        WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - v_soft_delete_retention
    );

    DELETE FROM patients
    WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - v_soft_delete_retention;
    GET DIAGNOSTICS v_soft_deleted_patients_count = ROW_COUNT;

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

-- Function to get retention status report
CREATE OR REPLACE FUNCTION get_retention_status()
RETURNS TABLE (
    category TEXT,
    total_count BIGINT,
    expired_count BIGINT,
    retention_period TEXT
) AS $$
BEGIN
    -- User sessions
    category := 'user_sessions';
    SELECT COUNT(*), COUNT(*) FILTER (WHERE expires_at < NOW())
    INTO total_count, expired_count
    FROM user_sessions;
    retention_period := '24 hours after expiry';
    RETURN NEXT;

    -- Failed login attempts
    category := 'failed_login_attempts';
    SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days')
    INTO total_count, expired_count
    FROM failed_login_attempts;
    retention_period := '90 days';
    RETURN NEXT;

    -- Soft-deleted patients
    category := 'soft_deleted_patients';
    SELECT COUNT(*) FILTER (WHERE deleted_at IS NOT NULL),
           COUNT(*) FILTER (WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days')
    INTO total_count, expired_count
    FROM patients;
    retention_period := '30 days after soft delete';
    RETURN NEXT;

    -- Audit logs
    category := 'audit_logs';
    SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 years')
    INTO total_count, expired_count
    FROM audit_logs;
    retention_period := '7 years (HIPAA)';
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_data IS
'Cleans up expired data according to retention policies.
Should be called by a scheduled job (pg_cron or external scheduler).
Example: SELECT * FROM cleanup_expired_data();';

COMMENT ON FUNCTION get_retention_status IS
'Returns current retention status for all data categories.
Use this to monitor data that needs cleanup.';

-- ============================================
-- 5. ENHANCED IP BLOCKING
-- ============================================

-- Create table for IP blocklist
CREATE TABLE IF NOT EXISTS ip_blocklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address INET NOT NULL,
    ip_range CIDR, -- For blocking IP ranges
    reason VARCHAR(255) NOT NULL,
    blocked_by UUID REFERENCES profiles(id),
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL = permanent
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ip_blocklist_ip ON ip_blocklist(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_range ON ip_blocklist(ip_range);
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_active ON ip_blocklist(is_active) WHERE is_active = true;

-- Enhanced function to check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(check_ip INET)
RETURNS BOOLEAN AS $$
DECLARE
    v_blocked BOOLEAN;
BEGIN
    -- Check exact IP match or CIDR range match
    SELECT EXISTS (
        SELECT 1 FROM ip_blocklist
        WHERE is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (
            ip_address = check_ip
            OR (ip_range IS NOT NULL AND check_ip << ip_range)
        )
    ) INTO v_blocked;

    RETURN v_blocked;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enhanced account lockout with IP blocking
CREATE OR REPLACE FUNCTION check_and_block_suspicious_ip(
    check_email VARCHAR,
    check_ip INET
)
RETURNS JSONB AS $$
DECLARE
    v_attempt_count INTEGER;
    v_distinct_accounts INTEGER;
    v_result JSONB;
    v_should_block BOOLEAN := false;
    v_block_reason TEXT;
BEGIN
    -- Check if IP is already blocked
    IF is_ip_blocked(check_ip) THEN
        RETURN jsonb_build_object(
            'blocked', true,
            'reason', 'IP is on blocklist',
            'action', 'deny'
        );
    END IF;

    -- Count failed attempts in last 15 minutes
    SELECT COUNT(*) INTO v_attempt_count
    FROM failed_login_attempts
    WHERE ip_address = check_ip
    AND created_at > NOW() - INTERVAL '15 minutes';

    -- Count distinct accounts targeted from this IP
    SELECT COUNT(DISTINCT email) INTO v_distinct_accounts
    FROM failed_login_attempts
    WHERE ip_address = check_ip
    AND created_at > NOW() - INTERVAL '1 hour';

    -- Rule 1: More than 5 failed attempts in 15 minutes = temporary block
    IF v_attempt_count >= 5 THEN
        v_should_block := true;
        v_block_reason := 'Too many failed login attempts (brute force protection)';
    END IF;

    -- Rule 2: Targeting more than 3 different accounts = credential stuffing
    IF v_distinct_accounts >= 3 THEN
        v_should_block := true;
        v_block_reason := 'Multiple account targeting detected (credential stuffing protection)';
    END IF;

    IF v_should_block THEN
        -- Add to blocklist with 1-hour expiry
        INSERT INTO ip_blocklist (ip_address, reason, expires_at, attempt_count)
        VALUES (check_ip, v_block_reason, NOW() + INTERVAL '1 hour', v_attempt_count)
        ON CONFLICT DO NOTHING;

        -- Log the blocking
        PERFORM log_audit_event(
            'ip_blocked',
            'authentication',
            'ip_blocklist',
            NULL,
            check_ip::TEXT,
            NULL,
            jsonb_build_object(
                'reason', v_block_reason,
                'attempt_count', v_attempt_count,
                'distinct_accounts', v_distinct_accounts,
                'email_attempted', check_email
            ),
            false,
            NULL
        );

        RETURN jsonb_build_object(
            'blocked', true,
            'reason', v_block_reason,
            'action', 'block',
            'expires_at', NOW() + INTERVAL '1 hour'
        );
    END IF;

    -- Check account-level lockout (5 attempts for same email)
    SELECT COUNT(*) INTO v_attempt_count
    FROM failed_login_attempts
    WHERE email = check_email
    AND created_at > NOW() - INTERVAL '15 minutes';

    IF v_attempt_count >= 5 THEN
        RETURN jsonb_build_object(
            'blocked', true,
            'reason', 'Account temporarily locked due to too many failed attempts',
            'action', 'account_locked',
            'retry_after', NOW() + INTERVAL '15 minutes'
        );
    END IF;

    RETURN jsonb_build_object(
        'blocked', false,
        'attempts_remaining', 5 - v_attempt_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to manually block an IP (admin only)
CREATE OR REPLACE FUNCTION block_ip(
    target_ip INET,
    block_reason TEXT,
    duration INTERVAL DEFAULT NULL -- NULL = permanent
)
RETURNS UUID AS $$
DECLARE
    v_block_id UUID;
BEGIN
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can block IPs';
    END IF;

    INSERT INTO ip_blocklist (ip_address, reason, blocked_by, expires_at)
    VALUES (target_ip, block_reason, auth.uid(),
            CASE WHEN duration IS NOT NULL THEN NOW() + duration ELSE NULL END)
    RETURNING id INTO v_block_id;

    PERFORM log_audit_event(
        'ip_manually_blocked',
        'admin',
        'ip_blocklist',
        v_block_id,
        target_ip::TEXT,
        NULL,
        jsonb_build_object('reason', block_reason, 'duration', duration::TEXT),
        false,
        NULL
    );

    RETURN v_block_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unblock an IP (admin only)
CREATE OR REPLACE FUNCTION unblock_ip(target_ip INET)
RETURNS BOOLEAN AS $$
BEGIN
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can unblock IPs';
    END IF;

    UPDATE ip_blocklist
    SET is_active = false
    WHERE ip_address = target_ip AND is_active = true;

    PERFORM log_audit_event(
        'ip_unblocked',
        'admin',
        'ip_blocklist',
        NULL,
        target_ip::TEXT,
        NULL,
        NULL,
        false,
        NULL
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS for ip_blocklist
ALTER TABLE ip_blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view IP blocklist"
    ON ip_blocklist FOR SELECT
    USING (is_user_admin());

CREATE POLICY "Admins can manage IP blocklist"
    ON ip_blocklist FOR ALL
    USING (is_user_admin());

COMMENT ON TABLE ip_blocklist IS 'Stores blocked IP addresses for security';
COMMENT ON FUNCTION is_ip_blocked IS 'Checks if an IP is currently blocked';
COMMENT ON FUNCTION check_and_block_suspicious_ip IS 'Checks login attempt and auto-blocks suspicious IPs';
COMMENT ON FUNCTION block_ip IS 'Manually block an IP address (admin only)';
COMMENT ON FUNCTION unblock_ip IS 'Unblock an IP address (admin only)';

-- ============================================
-- 6. BREAK-THE-GLASS EMERGENCY ACCESS
-- ============================================

-- Table to track emergency access events
CREATE TABLE IF NOT EXISTS break_the_glass_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who requested access
    user_id UUID NOT NULL REFERENCES profiles(id),
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    clinic_id UUID REFERENCES clinics(id),

    -- What was accessed
    patient_id UUID NOT NULL REFERENCES patients(id),
    patient_name VARCHAR(255),

    -- Why
    reason TEXT NOT NULL,
    emergency_type VARCHAR(100) NOT NULL CHECK (emergency_type IN (
        'life_threatening', -- Life-threatening emergency
        'court_order',      -- Legal requirement
        'patient_request',  -- Patient explicitly requested
        'public_health',    -- Public health emergency
        'other'             -- Other documented reason
    )),

    -- Supporting evidence
    reference_number VARCHAR(100), -- Court order number, incident ID, etc.

    -- Timing
    access_granted_at TIMESTAMPTZ DEFAULT NOW(),
    access_expires_at TIMESTAMPTZ NOT NULL,
    access_revoked_at TIMESTAMPTZ,

    -- Review status
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    is_approved BOOLEAN, -- NULL = pending, true = approved, false = rejected

    -- What was done during access
    actions_taken TEXT[],

    -- Metadata
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_btg_user_id ON break_the_glass_log(user_id);
CREATE INDEX idx_btg_patient_id ON break_the_glass_log(patient_id);
CREATE INDEX idx_btg_pending_review ON break_the_glass_log(is_approved) WHERE is_approved IS NULL;
CREATE INDEX idx_btg_active ON break_the_glass_log(access_expires_at) WHERE access_revoked_at IS NULL;

-- Function to request emergency access
CREATE OR REPLACE FUNCTION request_emergency_access(
    target_patient_id UUID,
    emergency_reason TEXT,
    emergency_type_param VARCHAR(100),
    reference_num VARCHAR(100) DEFAULT NULL,
    access_duration INTERVAL DEFAULT INTERVAL '4 hours'
)
RETURNS UUID AS $$
DECLARE
    v_btg_id UUID;
    v_user_id UUID;
    v_user_email VARCHAR(255);
    v_user_role VARCHAR(50);
    v_clinic_id UUID;
    v_patient_name VARCHAR(255);
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Get user info
    SELECT email, role, clinic_id
    INTO v_user_email, v_user_role, v_clinic_id
    FROM profiles
    WHERE id = v_user_id;

    -- Only doctors and admins can request emergency access
    IF v_user_role NOT IN ('doctor', 'admin') THEN
        RAISE EXCEPTION 'Only doctors and administrators can request emergency access';
    END IF;

    -- Get patient name
    SELECT name INTO v_patient_name
    FROM patients
    WHERE id = target_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'Patient not found';
    END IF;

    -- Validate emergency type
    IF emergency_type_param NOT IN ('life_threatening', 'court_order', 'patient_request', 'public_health', 'other') THEN
        RAISE EXCEPTION 'Invalid emergency type';
    END IF;

    -- Reason must be substantial
    IF length(emergency_reason) < 20 THEN
        RAISE EXCEPTION 'Emergency reason must be detailed (at least 20 characters)';
    END IF;

    -- Create the break-the-glass log entry
    INSERT INTO break_the_glass_log (
        user_id,
        user_email,
        user_role,
        clinic_id,
        patient_id,
        patient_name,
        reason,
        emergency_type,
        reference_number,
        access_expires_at
    ) VALUES (
        v_user_id,
        v_user_email,
        v_user_role,
        v_clinic_id,
        target_patient_id,
        v_patient_name,
        emergency_reason,
        emergency_type_param,
        reference_num,
        NOW() + access_duration
    ) RETURNING id INTO v_btg_id;

    -- Log the emergency access request
    PERFORM log_audit_event(
        'break_the_glass_request',
        'patient_data',
        'break_the_glass_log',
        v_btg_id,
        'Emergency access to patient: ' || v_patient_name,
        NULL,
        jsonb_build_object(
            'patient_id', target_patient_id,
            'reason', emergency_reason,
            'type', emergency_type_param,
            'expires_at', NOW() + access_duration
        ),
        true,
        ARRAY['all patient data']
    );

    RETURN v_btg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has emergency access to a patient
CREATE OR REPLACE FUNCTION has_emergency_access(target_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM break_the_glass_log
        WHERE user_id = auth.uid()
        AND patient_id = target_patient_id
        AND access_expires_at > NOW()
        AND access_revoked_at IS NULL
        -- For life-threatening, access is immediate. Others may require approval.
        AND (emergency_type = 'life_threatening' OR is_approved = true)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to log actions taken during emergency access
CREATE OR REPLACE FUNCTION log_emergency_action(
    btg_id UUID,
    action_description TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE break_the_glass_log
    SET actions_taken = array_append(COALESCE(actions_taken, ARRAY[]::TEXT[]),
                                      NOW()::TEXT || ': ' || action_description)
    WHERE id = btg_id
    AND user_id = auth.uid()
    AND access_expires_at > NOW()
    AND access_revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke emergency access
CREATE OR REPLACE FUNCTION revoke_emergency_access(btg_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_btg_user_id UUID;
BEGIN
    -- Get the BTG entry user
    SELECT user_id INTO v_btg_user_id
    FROM break_the_glass_log
    WHERE id = btg_id;

    -- Only the user themselves or an admin can revoke
    IF v_btg_user_id != auth.uid() AND NOT is_user_admin() THEN
        RAISE EXCEPTION 'Access denied: can only revoke own emergency access or must be admin';
    END IF;

    UPDATE break_the_glass_log
    SET access_revoked_at = NOW()
    WHERE id = btg_id
    AND access_revoked_at IS NULL;

    PERFORM log_audit_event(
        'break_the_glass_revoked',
        'patient_data',
        'break_the_glass_log',
        btg_id,
        'Emergency access revoked',
        NULL,
        NULL,
        false,
        NULL
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to review emergency access (admin only)
CREATE OR REPLACE FUNCTION review_emergency_access(
    btg_id UUID,
    approved BOOLEAN,
    notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can review emergency access';
    END IF;

    UPDATE break_the_glass_log
    SET reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        review_notes = notes,
        is_approved = approved
    WHERE id = btg_id;

    PERFORM log_audit_event(
        CASE WHEN approved THEN 'break_the_glass_approved' ELSE 'break_the_glass_rejected' END,
        'admin',
        'break_the_glass_log',
        btg_id,
        'Emergency access review',
        NULL,
        jsonb_build_object('approved', approved, 'notes', notes),
        false,
        NULL
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update patient access policy to include emergency access
DROP POLICY IF EXISTS "Users can view clinic patients with consent" ON patients;

CREATE POLICY "Users can view patients with consent or emergency access"
    ON patients FOR SELECT
    USING (
        (
            -- Normal access: same clinic + consent
            clinic_id = get_user_clinic_id()
            AND deleted_at IS NULL
            AND has_active_consent(id, 'data_processing')
        )
        OR (
            -- Emergency access: valid break-the-glass
            has_emergency_access(id)
        )
    );

-- RLS for break_the_glass_log
ALTER TABLE break_the_glass_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own BTG requests
CREATE POLICY "Users can view own BTG requests"
    ON break_the_glass_log FOR SELECT
    USING (user_id = auth.uid());

-- Admins can view all BTG requests in their clinic
CREATE POLICY "Admins can view clinic BTG requests"
    ON break_the_glass_log FOR SELECT
    USING (clinic_id = get_user_clinic_id() AND is_user_admin());

-- System can insert (via SECURITY DEFINER function)
CREATE POLICY "System can insert BTG requests"
    ON break_the_glass_log FOR INSERT
    WITH CHECK (true);

-- Only system can update (via SECURITY DEFINER functions)
CREATE POLICY "System can update BTG requests"
    ON break_the_glass_log FOR UPDATE
    USING (true);

COMMENT ON TABLE break_the_glass_log IS
'Tracks all emergency access (break-the-glass) events.
Required for HIPAA compliance to document emergency PHI access.';

COMMENT ON FUNCTION request_emergency_access IS
'Request emergency access to a patient record.
Life-threatening emergencies get immediate access; others require admin approval.';

COMMENT ON FUNCTION has_emergency_access IS
'Check if current user has valid emergency access to a patient.';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION hash_backup_code TO authenticated;
GRANT EXECUTE ON FUNCTION verify_backup_code TO authenticated;
GRANT EXECUTE ON FUNCTION generate_backup_codes TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_data TO authenticated;
GRANT EXECUTE ON FUNCTION get_retention_status TO authenticated;
GRANT EXECUTE ON FUNCTION is_ip_blocked TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_block_suspicious_ip TO authenticated;
GRANT EXECUTE ON FUNCTION block_ip TO authenticated;
GRANT EXECUTE ON FUNCTION unblock_ip TO authenticated;
GRANT EXECUTE ON FUNCTION request_emergency_access TO authenticated;
GRANT EXECUTE ON FUNCTION has_emergency_access TO authenticated;
GRANT EXECUTE ON FUNCTION log_emergency_action TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_emergency_access TO authenticated;
GRANT EXECUTE ON FUNCTION review_emergency_access TO authenticated;

-- ============================================
-- SUMMARY COMMENTS
-- ============================================

COMMENT ON EXTENSION pgcrypto IS 'Cryptographic functions for password hashing and encryption';
