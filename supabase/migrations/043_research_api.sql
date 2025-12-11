-- PsiPilot Assistant - Research API Support
-- Migration: 043_research_api
-- Description: Add researcher role, research access logs, and RLS policies for research API

-- ============================================
-- ADD RESEARCHER ROLE
-- ============================================

-- Update profiles table to include 'researcher' role
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('specialist', 'admin', 'assistant', 'researcher'));

COMMENT ON CONSTRAINT profiles_role_check ON profiles IS 
'Allowed roles: specialist, admin, assistant, researcher. Researchers are not tied to clinics.';

-- ============================================
-- RESEARCH ACCESS LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS research_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Who accessed
    researcher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- What action
    action VARCHAR(100) NOT NULL, -- 'view', 'download', 'export', 'stats'
    
    -- What data
    records_count INTEGER DEFAULT 0, -- Number of records accessed
    dataset_type VARCHAR(100), -- 'transcripts', 'sessions', etc.
    
    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100), -- For correlating multiple log entries
    
    -- Result
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_research_logs_researcher ON research_access_logs(researcher_id);
CREATE INDEX idx_research_logs_created ON research_access_logs(created_at DESC);
CREATE INDEX idx_research_logs_action ON research_access_logs(action);
CREATE INDEX idx_research_logs_researcher_created ON research_access_logs(researcher_id, created_at DESC);

COMMENT ON TABLE research_access_logs IS 
'Logs all research API access for HIPAA/GDPR compliance. Tracks who accessed what data and when.';

-- ============================================
-- FUNCTION: LOG RESEARCH ACCESS
-- ============================================

CREATE OR REPLACE FUNCTION log_research_access(
    p_researcher_id UUID,
    p_action VARCHAR(100),
    p_records_count INTEGER DEFAULT 0,
    p_dataset_type VARCHAR(100) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_id VARCHAR(100) DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    -- Verify researcher exists and has correct role
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = p_researcher_id
        AND role = 'researcher'
    ) THEN
        RAISE EXCEPTION 'Invalid researcher_id: user must have researcher role';
    END IF;

    -- Insert log entry
    INSERT INTO research_access_logs (
        researcher_id,
        action,
        records_count,
        dataset_type,
        ip_address,
        user_agent,
        request_id,
        success,
        error_message
    ) VALUES (
        p_researcher_id,
        p_action,
        p_records_count,
        p_dataset_type,
        p_ip_address,
        p_user_agent,
        p_request_id,
        p_success,
        p_error_message
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION log_research_access IS 
'Logs research API access for audit purposes. Required for HIPAA/GDPR compliance.';

GRANT EXECUTE ON FUNCTION log_research_access TO authenticated;
REVOKE EXECUTE ON FUNCTION log_research_access FROM PUBLIC;

-- ============================================
-- RLS POLICIES FOR RESEARCH ACCESS LOGS
-- ============================================

ALTER TABLE research_access_logs ENABLE ROW LEVEL SECURITY;

-- Researchers can view their own logs
CREATE POLICY "Researchers can view own logs"
    ON research_access_logs FOR SELECT
    USING (
        researcher_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'researcher'
        )
    );

-- Admins can view all research logs
CREATE POLICY "Admins can view all research logs"
    ON research_access_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- System can insert logs (via SECURITY DEFINER function)
CREATE POLICY "System can insert research logs"
    ON research_access_logs FOR INSERT
    WITH CHECK (true); -- Controlled by SECURITY DEFINER function

-- ============================================
-- RLS POLICY FOR RESEARCHERS TO ACCESS SESSIONS
-- ============================================

-- Researchers can view sessions with research consent
CREATE POLICY "Researchers can view anonymized sessions"
    ON sessions FOR SELECT
    USING (
        -- User must be a researcher
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'researcher'
            AND clinic_id IS NULL -- Researchers are not tied to clinics
        )
        -- Patient must have active research consent
        AND EXISTS (
            SELECT 1 FROM consent_records cr
            JOIN patients p ON cr.patient_id = p.id
            WHERE p.id = sessions.patient_id
            AND cr.consent_type = 'research'
            AND cr.status = 'active'
            AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
        )
        -- Session must have completed transcript
        AND sessions.transcript_status = 'completed'
        AND sessions.transcript IS NOT NULL
    );

COMMENT ON POLICY "Researchers can view anonymized sessions" ON sessions IS 
'Allows researchers to access sessions for patients with active research consent. 
Data must be fully deidentified before being returned to researchers.';

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

CREATE TRIGGER update_research_access_logs_updated_at
    BEFORE UPDATE ON research_access_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

