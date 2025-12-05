-- PsiPilot Assistant - Audit Logging and Compliance
-- Migration: 004_audit_and_compliance
-- Description: Audit logs, consent tracking, and storage policies for HIPAA/GDPR/152-FZ compliance

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who performed the action
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,

    -- What action was performed
    action VARCHAR(100) NOT NULL, -- 'create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'print'
    action_category VARCHAR(50) NOT NULL, -- 'authentication', 'patient_data', 'clinical_note', 'recording', 'admin'

    -- What resource was affected
    resource_type VARCHAR(100), -- 'patient', 'session', 'clinical_note', 'recording', etc.
    resource_id UUID,
    resource_name VARCHAR(255), -- Human-readable name for logs

    -- Change details (for updates)
    old_values JSONB,
    new_values JSONB,

    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100), -- For correlating multiple log entries

    -- PHI access tracking (HIPAA requirement)
    phi_accessed BOOLEAN DEFAULT false,
    phi_fields TEXT[], -- Which PHI fields were accessed

    -- Result
    success BOOLEAN DEFAULT true,
    error_message TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_clinic_id ON audit_logs(clinic_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_phi ON audit_logs(phi_accessed) WHERE phi_accessed = true;

-- Partition by month for better performance (optional, uncomment if needed)
-- CREATE TABLE audit_logs_y2024m12 PARTITION OF audit_logs
--     FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- ============================================
-- CONSENT RECORDS TABLE (GDPR/152-FZ)
-- ============================================
CREATE TABLE consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who gave consent
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- What consent was given for
    consent_type VARCHAR(100) NOT NULL, -- 'data_processing', 'recording', 'ai_analysis', 'data_sharing', 'marketing'
    consent_purpose TEXT NOT NULL, -- Detailed description of what data will be used for

    -- Legal basis (GDPR Article 6)
    legal_basis VARCHAR(100) NOT NULL, -- 'consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests'

    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'expired')),

    -- Timing
    given_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL = no expiration
    withdrawn_at TIMESTAMPTZ,

    -- How consent was obtained
    consent_method VARCHAR(100) NOT NULL, -- 'written', 'electronic', 'verbal_recorded'
    consent_document_id UUID REFERENCES documents(id), -- Link to signed consent form

    -- Evidence of consent (for audits)
    ip_address INET,
    user_agent TEXT,
    signature_data TEXT, -- Base64 encoded signature if electronic
    witness_name VARCHAR(255),

    -- Who collected consent
    collected_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Data categories covered (GDPR Article 9)
    data_categories TEXT[] DEFAULT '{}', -- 'personal', 'health', 'genetic', 'biometric'

    -- Third party sharing
    third_party_sharing BOOLEAN DEFAULT false,
    third_parties TEXT[], -- Names of third parties if sharing allowed

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_consent_records_patient_id ON consent_records(patient_id);
CREATE INDEX idx_consent_records_type ON consent_records(consent_type);
CREATE INDEX idx_consent_records_status ON consent_records(status);
CREATE INDEX idx_consent_records_expires_at ON consent_records(expires_at) WHERE expires_at IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_consent_records_updated_at
    BEFORE UPDATE ON consent_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DATA PROCESSING REGISTRY (152-FZ requirement)
-- ============================================
CREATE TABLE data_processing_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- What data
    data_category VARCHAR(255) NOT NULL, -- 'ФИО', 'контактные данные', 'медицинские данные'
    data_description TEXT,

    -- Why
    processing_purpose TEXT NOT NULL,
    legal_basis VARCHAR(255) NOT NULL,

    -- Where
    storage_location TEXT NOT NULL, -- 'Supabase Cloud EU', 'Self-hosted Russia', etc.
    storage_country VARCHAR(100),

    -- How long
    retention_period INTERVAL,
    retention_policy TEXT,

    -- Who has access
    access_roles TEXT[] DEFAULT '{}',

    -- Third party transfers
    cross_border_transfer BOOLEAN DEFAULT false,
    transfer_countries TEXT[],
    transfer_safeguards TEXT,

    -- Security measures
    security_measures TEXT[],
    encryption_type VARCHAR(100),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_data_processing_registry_updated_at
    BEFORE UPDATE ON data_processing_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SESSION ACTIVITY TABLE (for session management)
-- ============================================
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Session info
    session_token_hash VARCHAR(255) NOT NULL, -- Hash of the session token

    -- Device/Location info
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50), -- 'desktop', 'mobile', 'tablet'
    browser VARCHAR(100),
    os VARCHAR(100),
    location_country VARCHAR(100),
    location_city VARCHAR(100),

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT true,
    terminated_at TIMESTAMPTZ,
    termination_reason VARCHAR(100) -- 'logout', 'timeout', 'forced', 'password_change'
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- ============================================
-- FAILED LOGIN ATTEMPTS (Security)
-- ============================================
CREATE TABLE failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    failure_reason VARCHAR(100), -- 'invalid_password', 'user_not_found', 'account_locked'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_failed_logins_email ON failed_login_attempts(email);
CREATE INDEX idx_failed_logins_ip ON failed_login_attempts(ip_address);
CREATE INDEX idx_failed_logins_created_at ON failed_login_attempts(created_at DESC);

-- Function to check if account should be locked
CREATE OR REPLACE FUNCTION check_account_lockout(check_email VARCHAR, check_ip INET)
RETURNS BOOLEAN AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO attempt_count
    FROM failed_login_attempts
    WHERE (email = check_email OR ip_address = check_ip)
    AND created_at > NOW() - INTERVAL '15 minutes';

    RETURN attempt_count >= 5; -- Lock after 5 failed attempts
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- AUDIT LOGGING FUNCTIONS
-- ============================================

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
    p_action VARCHAR,
    p_action_category VARCHAR,
    p_resource_type VARCHAR DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_resource_name VARCHAR DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_phi_accessed BOOLEAN DEFAULT false,
    p_phi_fields TEXT[] DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
    v_user_id UUID;
    v_user_email VARCHAR;
    v_user_role VARCHAR;
    v_clinic_id UUID;
BEGIN
    -- Get current user info
    v_user_id := auth.uid();

    IF v_user_id IS NOT NULL THEN
        SELECT email, role, clinic_id
        INTO v_user_email, v_user_role, v_clinic_id
        FROM profiles
        WHERE id = v_user_id;
    END IF;

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
        old_values,
        new_values,
        phi_accessed,
        phi_fields
    ) VALUES (
        v_user_id,
        v_user_email,
        v_user_role,
        v_clinic_id,
        p_action,
        p_action_category,
        p_resource_type,
        p_resource_id,
        p_resource_name,
        p_old_values,
        p_new_values,
        p_phi_accessed,
        p_phi_fields
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-log patient data access
CREATE OR REPLACE FUNCTION log_patient_access()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM log_audit_event(
        'read',
        'patient_data',
        'patient',
        NEW.id,
        NEW.name,
        NULL,
        NULL,
        true,
        ARRAY['name', 'email', 'phone', 'date_of_birth']
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-log patient data changes
CREATE OR REPLACE FUNCTION log_patient_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM log_audit_event(
            'create',
            'patient_data',
            'patient',
            NEW.id,
            NEW.name,
            NULL,
            to_jsonb(NEW),
            true,
            ARRAY['name', 'email', 'phone', 'date_of_birth']
        );
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM log_audit_event(
            'update',
            'patient_data',
            'patient',
            NEW.id,
            NEW.name,
            to_jsonb(OLD),
            to_jsonb(NEW),
            true,
            ARRAY['name', 'email', 'phone', 'date_of_birth']
        );
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM log_audit_event(
            'delete',
            'patient_data',
            'patient',
            OLD.id,
            OLD.name,
            to_jsonb(OLD),
            NULL,
            true,
            ARRAY['name', 'email', 'phone', 'date_of_birth']
        );
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to patients table
CREATE TRIGGER audit_patient_changes
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION log_patient_changes();

-- Auto-log clinical notes access
CREATE OR REPLACE FUNCTION log_clinical_note_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM log_audit_event(
            'create',
            'clinical_note',
            'clinical_note',
            NEW.id,
            NEW.title,
            NULL,
            to_jsonb(NEW),
            true,
            ARRAY['ai_summary']
        );
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM log_audit_event(
            'update',
            'clinical_note',
            'clinical_note',
            NEW.id,
            NEW.title,
            to_jsonb(OLD),
            to_jsonb(NEW),
            true,
            ARRAY['ai_summary']
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_clinical_note_changes
    AFTER INSERT OR UPDATE ON clinical_notes
    FOR EACH ROW EXECUTE FUNCTION log_clinical_note_changes();

-- ============================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================

-- Audit logs: Only admins can view, system can insert
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view clinic audit logs"
    ON audit_logs FOR SELECT
    USING (clinic_id = get_user_clinic_id() AND is_user_admin());

CREATE POLICY "System can insert audit logs"
    ON audit_logs FOR INSERT
    WITH CHECK (true); -- Controlled by SECURITY DEFINER function

-- Consent records
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clinic consent records"
    ON consent_records FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM patients
            WHERE patients.id = consent_records.patient_id
            AND patients.clinic_id = get_user_clinic_id()
        )
    );

CREATE POLICY "Users can create consent records"
    ON consent_records FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM patients
            WHERE patients.id = consent_records.patient_id
            AND patients.clinic_id = get_user_clinic_id()
        )
    );

CREATE POLICY "Users can update consent records"
    ON consent_records FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM patients
            WHERE patients.id = consent_records.patient_id
            AND patients.clinic_id = get_user_clinic_id()
        )
    );

-- Data processing registry
ALTER TABLE data_processing_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage data processing registry"
    ON data_processing_registry FOR ALL
    USING (clinic_id = get_user_clinic_id() AND is_user_admin());

-- User sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
    ON user_sessions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view clinic sessions"
    ON user_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = user_sessions.user_id
            AND profiles.clinic_id = get_user_clinic_id()
        )
        AND is_user_admin()
    );

-- Failed login attempts: Not accessible via API (system only)
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies = no direct access

-- ============================================
-- STORAGE BUCKETS AND POLICIES
-- ============================================

-- Create storage buckets (run in Supabase Dashboard or via API)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('recordings', 'recordings', false, 524288000, ARRAY['audio/webm', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg']),
    ('documents', 'documents', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
    ('consent-forms', 'consent-forms', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for recordings bucket
CREATE POLICY "Users can upload recordings to their clinic"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'recordings'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can view recordings from their clinic"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'recordings'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM recordings r
        JOIN sessions s ON r.session_id = s.id
        WHERE r.file_path = storage.objects.name
        AND s.clinic_id = get_user_clinic_id()
    )
);

CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'recordings'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM recordings r
        WHERE r.file_path = storage.objects.name
        AND r.user_id = auth.uid()
    )
);

-- Storage policies for documents bucket
CREATE POLICY "Users can upload documents to their clinic"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can view documents from their clinic"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM documents d
        JOIN patients p ON d.patient_id = p.id
        WHERE d.file_path = storage.objects.name
        AND p.clinic_id = get_user_clinic_id()
    )
);

CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.file_path = storage.objects.name
        AND d.uploaded_by = auth.uid()
    )
);

-- Storage policies for consent-forms bucket
CREATE POLICY "Users can upload consent forms"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'consent-forms'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can view consent forms from their clinic"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'consent-forms'
    AND auth.role() = 'authenticated'
);

-- ============================================
-- GDPR DATA EXPORT FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION export_patient_data(patient_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Check if user has access to this patient
    IF NOT EXISTS (
        SELECT 1 FROM patients
        WHERE id = patient_uuid
        AND clinic_id = get_user_clinic_id()
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Log the export
    PERFORM log_audit_event(
        'export',
        'patient_data',
        'patient',
        patient_uuid,
        NULL,
        NULL,
        NULL,
        true,
        ARRAY['all']
    );

    -- Compile all patient data
    SELECT jsonb_build_object(
        'patient', (SELECT to_jsonb(p.*) FROM patients p WHERE p.id = patient_uuid),
        'sessions', (SELECT jsonb_agg(to_jsonb(s.*)) FROM sessions s WHERE s.patient_id = patient_uuid),
        'clinical_notes', (SELECT jsonb_agg(to_jsonb(cn.*)) FROM clinical_notes cn WHERE cn.patient_id = patient_uuid),
        'documents', (SELECT jsonb_agg(to_jsonb(d.*)) FROM documents d WHERE d.patient_id = patient_uuid),
        'consent_records', (SELECT jsonb_agg(to_jsonb(cr.*)) FROM consent_records cr WHERE cr.patient_id = patient_uuid),
        'exported_at', NOW(),
        'exported_by', auth.uid()
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GDPR RIGHT TO BE FORGOTTEN (Hard Delete)
-- ============================================
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

    -- Delete in order (respecting foreign keys)
    DELETE FROM sections WHERE clinical_note_id IN (
        SELECT id FROM clinical_notes WHERE patient_id = patient_uuid
    );
    DELETE FROM clinical_notes WHERE patient_id = patient_uuid;
    DELETE FROM recordings WHERE session_id IN (
        SELECT id FROM sessions WHERE patient_id = patient_uuid
    );
    DELETE FROM sessions WHERE patient_id = patient_uuid;
    DELETE FROM documents WHERE patient_id = patient_uuid;
    DELETE FROM consent_records WHERE patient_id = patient_uuid;
    DELETE FROM patients WHERE id = patient_uuid;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
