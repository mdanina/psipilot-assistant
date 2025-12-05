-- PsiPilot Assistant - MFA and Enhanced Security
-- Migration: 005_mfa_and_security
-- Description: Multi-factor authentication, field-level encryption support, consent checks, and enhanced security

-- ============================================
-- MFA SUPPORT
-- ============================================

-- Add MFA enabled flag to profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'mfa_enabled'
    ) THEN
        ALTER TABLE profiles ADD COLUMN mfa_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'mfa_enabled_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN mfa_enabled_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'backup_codes'
    ) THEN
        ALTER TABLE profiles ADD COLUMN backup_codes TEXT[];
    END IF;
END $$;

-- MFA factors table (stores TOTP devices)
CREATE TABLE IF NOT EXISTS mfa_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Factor info
    factor_type VARCHAR(50) NOT NULL DEFAULT 'totp' CHECK (factor_type IN ('totp', 'sms', 'email')),
    friendly_name VARCHAR(255) NOT NULL, -- e.g., "iPhone", "Authenticator App"
    
    -- TOTP specific
    secret TEXT, -- Encrypted TOTP secret
    qr_code_url TEXT, -- Temporary, for initial setup
    
    -- Status
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mfa_factors_user_id ON mfa_factors(user_id);
CREATE INDEX idx_mfa_factors_active ON mfa_factors(user_id, is_active) WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER update_mfa_factors_updated_at
    BEFORE UPDATE ON mfa_factors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FIELD-LEVEL ENCRYPTION SUPPORT
-- ============================================

-- Add encrypted columns for PHI data
-- Note: Application-level encryption will handle encryption/decryption
-- These columns store encrypted BYTEA data

-- Clinical notes: encrypted AI summary
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clinical_notes' AND column_name = 'ai_summary_encrypted'
    ) THEN
        ALTER TABLE clinical_notes ADD COLUMN ai_summary_encrypted BYTEA;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clinical_notes' AND column_name = 'encryption_version'
    ) THEN
        ALTER TABLE clinical_notes ADD COLUMN encryption_version INTEGER DEFAULT 1;
    END IF;
END $$;

-- Sections: encrypted AI content
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sections' AND column_name = 'ai_content_encrypted'
    ) THEN
        ALTER TABLE sections ADD COLUMN ai_content_encrypted BYTEA;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sections' AND column_name = 'encryption_version'
    ) THEN
        ALTER TABLE sections ADD COLUMN encryption_version INTEGER DEFAULT 1;
    END IF;
END $$;

-- Sessions: encrypted transcript
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sessions' AND column_name = 'transcript_encrypted'
    ) THEN
        ALTER TABLE sessions ADD COLUMN transcript_encrypted BYTEA;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sessions' AND column_name = 'encryption_version'
    ) THEN
        ALTER TABLE sessions ADD COLUMN encryption_version INTEGER DEFAULT 1;
    END IF;
END $$;

-- Recordings: encrypted transcription text
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recordings' AND column_name = 'transcription_text_encrypted'
    ) THEN
        ALTER TABLE recordings ADD COLUMN transcription_text_encrypted BYTEA;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recordings' AND column_name = 'encryption_version'
    ) THEN
        ALTER TABLE recordings ADD COLUMN encryption_version INTEGER DEFAULT 1;
    END IF;
END $$;

-- Indexes for encrypted columns (for migration queries)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_clinical_notes_encrypted'
    ) THEN
        CREATE INDEX idx_clinical_notes_encrypted ON clinical_notes(encryption_version) WHERE ai_summary_encrypted IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_sections_encrypted'
    ) THEN
        CREATE INDEX idx_sections_encrypted ON sections(encryption_version) WHERE ai_content_encrypted IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- CONSENT CHECK FUNCTIONS
-- ============================================

-- Function to check if patient has active consent for specific type
CREATE OR REPLACE FUNCTION has_active_consent(
    patient_uuid UUID,
    consent_type_param VARCHAR(100)
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM consent_records
        WHERE patient_id = patient_uuid
        AND consent_type = consent_type_param
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check multiple consent types (for complex operations)
CREATE OR REPLACE FUNCTION has_active_consents(
    patient_uuid UUID,
    consent_types TEXT[]
)
RETURNS BOOLEAN AS $$
DECLARE
    consent_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT consent_type) INTO consent_count
    FROM consent_records
    WHERE patient_id = patient_uuid
    AND consent_type = ANY(consent_types)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW());
    
    RETURN consent_count = array_length(consent_types, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- UPDATED RLS POLICIES WITH CONSENT CHECKS
-- ============================================

-- Drop existing patient SELECT policy
DROP POLICY IF EXISTS "Users can view clinic patients" ON patients;

-- New policy with consent check
CREATE POLICY "Users can view clinic patients with consent"
    ON patients FOR SELECT
    USING (
        clinic_id = get_user_clinic_id()
        AND deleted_at IS NULL
        AND has_active_consent(id, 'data_processing')
    );

-- Drop existing session policies
DROP POLICY IF EXISTS "Users can view clinic sessions" ON sessions;

-- New session policy with consent check
CREATE POLICY "Users can view clinic sessions with consent"
    ON sessions FOR SELECT
    USING (
        clinic_id = get_user_clinic_id()
        AND has_active_consent(patient_id, 'data_processing')
    );

-- Drop existing clinical notes policy
DROP POLICY IF EXISTS "Users can view clinic notes" ON clinical_notes;

-- New clinical notes policy with consent check
CREATE POLICY "Users can view clinic notes with consent"
    ON clinical_notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = clinical_notes.session_id
            AND sessions.clinic_id = get_user_clinic_id()
            AND has_active_consent(sessions.patient_id, 'data_processing')
        )
    );

-- Drop existing recordings policy
DROP POLICY IF EXISTS "Users can view clinic recordings" ON recordings;

-- New recordings policy with consent check (requires recording consent)
CREATE POLICY "Users can view clinic recordings with consent"
    ON recordings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = recordings.session_id
            AND sessions.clinic_id = get_user_clinic_id()
            AND has_active_consent(sessions.patient_id, 'recording')
        )
    );

-- ============================================
-- MFA RLS POLICIES
-- ============================================

ALTER TABLE mfa_factors ENABLE ROW LEVEL SECURITY;

-- Users can only view their own MFA factors
CREATE POLICY "Users can view own MFA factors"
    ON mfa_factors FOR SELECT
    USING (user_id = auth.uid());

-- Users can create their own MFA factors
CREATE POLICY "Users can create own MFA factors"
    ON mfa_factors FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own MFA factors
CREATE POLICY "Users can update own MFA factors"
    ON mfa_factors FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own MFA factors
CREATE POLICY "Users can delete own MFA factors"
    ON mfa_factors FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- ENHANCED AUDIT LOGGING FOR READ OPERATIONS
-- ============================================

-- Update log_audit_event function to support READ operations
-- Note: READ operations will be logged at application level via supabase-audited.ts
-- This function remains for INSERT/UPDATE/DELETE operations

-- Add helper function to log READ access (called from application)
CREATE OR REPLACE FUNCTION log_read_access(
    resource_type_param VARCHAR(100),
    resource_id_param UUID,
    resource_name_param VARCHAR(255),
    phi_fields_param TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_user_email VARCHAR(255);
    v_user_role VARCHAR(50);
    v_clinic_id UUID;
    v_audit_id UUID;
BEGIN
    -- Get current user info
    SELECT id, email, role, clinic_id
    INTO v_user_id, v_user_email, v_user_role, v_clinic_id
    FROM profiles
    WHERE id = auth.uid();
    
    -- Log the read access
    INSERT INTO audit_logs (
        user_id,
        user_email,
        user_role,
        clinic_id,
        action,
        action_category,
        resource_type,
        resource_id,
        resource_name,
        phi_accessed,
        phi_fields,
        success,
        created_at
    ) VALUES (
        v_user_id,
        v_user_email,
        v_user_role,
        v_clinic_id,
        'read',
        CASE 
            WHEN resource_type_param = 'patient' THEN 'patient_data'
            WHEN resource_type_param = 'clinical_note' THEN 'clinical_note'
            WHEN resource_type_param = 'recording' THEN 'recording'
            ELSE 'general'
        END,
        resource_type_param,
        resource_id_param,
        resource_name_param,
        array_length(phi_fields_param, 1) > 0,
        phi_fields_param,
        true,
        NOW()
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION log_read_access TO authenticated;

-- ============================================
-- SESSION MANAGEMENT
-- ============================================

-- Table to track active sessions (for session timeout enforcement)
-- Note: user_sessions table already exists in migration 004
-- Only add missing columns if needed
DO $$
BEGIN
    -- Add last_activity_at if it doesn't exist (migration 004 might have different structure)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_sessions' AND column_name = 'last_activity_at'
    ) THEN
        ALTER TABLE user_sessions ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Indexes already exist in migration 004, skip creation
-- Migration 004 has:
-- - idx_user_sessions_user_id
-- - idx_user_sessions_active (different definition)
-- - idx_user_sessions_expires

-- Function to update last activity
-- Note: This function works with user_sessions table from migration 004
-- Migration 004 uses session_token_hash, not session_token
CREATE OR REPLACE FUNCTION update_session_activity(session_token_hash_param VARCHAR(255))
RETURNS VOID AS $$
BEGIN
    -- Update last_activity_at (column exists in migration 004)
    UPDATE user_sessions
    SET last_activity_at = NOW()
    WHERE session_token_hash = session_token_hash_param
    AND expires_at > NOW()
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- RLS for user_sessions (already enabled in migration 004)
-- Only add policies if they don't exist
DO $$
BEGIN
    -- Enable RLS if not already enabled
    ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN OTHERS THEN
        -- RLS might already be enabled, ignore error
        NULL;
END $$;

-- Create policies only if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_sessions' AND policyname = 'Users can view own sessions'
    ) THEN
        CREATE POLICY "Users can view own sessions"
            ON user_sessions FOR SELECT
            USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_sessions' AND policyname = 'Users can manage own sessions'
    ) THEN
        CREATE POLICY "Users can manage own sessions"
            ON user_sessions FOR ALL
            USING (user_id = auth.uid());
    END IF;
END $$;

-- ============================================
-- HELPER FUNCTIONS FOR ENCRYPTION
-- ============================================

-- Function to check if field should be encrypted (for migration)
CREATE OR REPLACE FUNCTION is_phi_field(table_name TEXT, column_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        (table_name = 'clinical_notes' AND column_name IN ('ai_summary'))
        OR (table_name = 'sections' AND column_name IN ('ai_content'))
        OR (table_name = 'sessions' AND column_name IN ('transcript'))
        OR (table_name = 'recordings' AND column_name IN ('transcription_text'))
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE mfa_factors IS 'Stores MFA devices (TOTP, SMS, Email) for users';
COMMENT ON FUNCTION has_active_consent IS 'Checks if patient has active consent for specific type';
COMMENT ON FUNCTION log_read_access IS 'Logs READ operations to audit_logs (called from application)';
COMMENT ON FUNCTION update_session_activity IS 'Updates last activity timestamp for session timeout tracking';
COMMENT ON COLUMN clinical_notes.ai_summary_encrypted IS 'Encrypted PHI data (encrypted at application level)';
COMMENT ON COLUMN sections.ai_content_encrypted IS 'Encrypted PHI data (encrypted at application level)';
COMMENT ON COLUMN sessions.transcript_encrypted IS 'Encrypted PHI data (encrypted at application level)';

