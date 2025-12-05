-- PsiPilot Assistant - Row Level Security Policies
-- Migration: 002_row_level_security
-- Description: Security policies for multi-tenant clinic data isolation

-- ============================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================

-- Get current user's clinic_id
CREATE OR REPLACE FUNCTION get_user_clinic_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT clinic_id
        FROM profiles
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT role = 'admin'
        FROM profiles
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user belongs to clinic
CREATE OR REPLACE FUNCTION user_belongs_to_clinic(clinic_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT clinic_id = clinic_uuid
        FROM profiles
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CLINICS POLICIES
-- ============================================

-- Users can view their own clinic
CREATE POLICY "Users can view their clinic"
    ON clinics FOR SELECT
    USING (id = get_user_clinic_id());

-- Only admins can update their clinic
CREATE POLICY "Admins can update their clinic"
    ON clinics FOR UPDATE
    USING (id = get_user_clinic_id() AND is_user_admin());

-- ============================================
-- PROFILES POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- Users can view profiles in their clinic
CREATE POLICY "Users can view clinic profiles"
    ON profiles FOR SELECT
    USING (clinic_id = get_user_clinic_id());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

-- Admins can update profiles in their clinic
CREATE POLICY "Admins can update clinic profiles"
    ON profiles FOR UPDATE
    USING (clinic_id = get_user_clinic_id() AND is_user_admin());

-- ============================================
-- PATIENTS POLICIES
-- ============================================

-- Users can view patients in their clinic (excluding soft-deleted)
CREATE POLICY "Users can view clinic patients"
    ON patients FOR SELECT
    USING (
        clinic_id = get_user_clinic_id()
        AND deleted_at IS NULL
    );

-- Users can insert patients in their clinic
CREATE POLICY "Users can create patients"
    ON patients FOR INSERT
    WITH CHECK (clinic_id = get_user_clinic_id());

-- Users can update patients in their clinic
CREATE POLICY "Users can update clinic patients"
    ON patients FOR UPDATE
    USING (clinic_id = get_user_clinic_id());

-- Users can soft-delete patients in their clinic
CREATE POLICY "Users can delete clinic patients"
    ON patients FOR DELETE
    USING (clinic_id = get_user_clinic_id());

-- ============================================
-- SESSIONS POLICIES
-- ============================================

-- Users can view sessions in their clinic
CREATE POLICY "Users can view clinic sessions"
    ON sessions FOR SELECT
    USING (clinic_id = get_user_clinic_id());

-- Users can create sessions in their clinic
CREATE POLICY "Users can create sessions"
    ON sessions FOR INSERT
    WITH CHECK (
        clinic_id = get_user_clinic_id()
        AND user_id = auth.uid()
    );

-- Users can update their own sessions
CREATE POLICY "Users can update own sessions"
    ON sessions FOR UPDATE
    USING (user_id = auth.uid());

-- Admins can update any session in clinic
CREATE POLICY "Admins can update clinic sessions"
    ON sessions FOR UPDATE
    USING (clinic_id = get_user_clinic_id() AND is_user_admin());

-- Users can delete their own sessions
CREATE POLICY "Users can delete own sessions"
    ON sessions FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- CLINICAL NOTES POLICIES
-- ============================================

-- Users can view notes for sessions in their clinic
CREATE POLICY "Users can view clinic notes"
    ON clinical_notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = clinical_notes.session_id
            AND sessions.clinic_id = get_user_clinic_id()
        )
    );

-- Users can create notes for their sessions
CREATE POLICY "Users can create notes"
    ON clinical_notes FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own notes (if not finalized)
CREATE POLICY "Users can update own notes"
    ON clinical_notes FOR UPDATE
    USING (
        user_id = auth.uid()
        AND status NOT IN ('finalized', 'signed')
    );

-- Users can delete their own draft notes
CREATE POLICY "Users can delete own draft notes"
    ON clinical_notes FOR DELETE
    USING (
        user_id = auth.uid()
        AND status = 'draft'
    );

-- ============================================
-- SECTIONS POLICIES
-- ============================================

-- Users can view sections of notes they can access
CREATE POLICY "Users can view sections"
    ON sections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clinical_notes cn
            JOIN sessions s ON cn.session_id = s.id
            WHERE cn.id = sections.clinical_note_id
            AND s.clinic_id = get_user_clinic_id()
        )
    );

-- Users can create sections in their notes
CREATE POLICY "Users can create sections"
    ON sections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clinical_notes
            WHERE clinical_notes.id = sections.clinical_note_id
            AND clinical_notes.user_id = auth.uid()
        )
    );

-- Users can update sections in their notes
CREATE POLICY "Users can update own sections"
    ON sections FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM clinical_notes
            WHERE clinical_notes.id = sections.clinical_note_id
            AND clinical_notes.user_id = auth.uid()
            AND clinical_notes.status NOT IN ('finalized', 'signed')
        )
    );

-- Users can delete sections in their draft notes
CREATE POLICY "Users can delete own sections"
    ON sections FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM clinical_notes
            WHERE clinical_notes.id = sections.clinical_note_id
            AND clinical_notes.user_id = auth.uid()
            AND clinical_notes.status = 'draft'
        )
    );

-- ============================================
-- SECTION TEMPLATES POLICIES
-- ============================================

-- Users can view global templates and their clinic templates
CREATE POLICY "Users can view templates"
    ON section_templates FOR SELECT
    USING (
        clinic_id IS NULL -- Global templates
        OR clinic_id = get_user_clinic_id()
    );

-- Admins can create clinic templates
CREATE POLICY "Admins can create templates"
    ON section_templates FOR INSERT
    WITH CHECK (
        clinic_id = get_user_clinic_id()
        AND is_user_admin()
    );

-- Admins can update clinic templates
CREATE POLICY "Admins can update templates"
    ON section_templates FOR UPDATE
    USING (
        clinic_id = get_user_clinic_id()
        AND is_user_admin()
    );

-- Admins can delete clinic templates
CREATE POLICY "Admins can delete templates"
    ON section_templates FOR DELETE
    USING (
        clinic_id = get_user_clinic_id()
        AND is_user_admin()
    );

-- ============================================
-- RECORDINGS POLICIES
-- ============================================

-- Users can view recordings in their clinic
CREATE POLICY "Users can view clinic recordings"
    ON recordings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = recordings.session_id
            AND sessions.clinic_id = get_user_clinic_id()
        )
    );

-- Users can create recordings for their sessions
CREATE POLICY "Users can create recordings"
    ON recordings FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own recordings
CREATE POLICY "Users can update own recordings"
    ON recordings FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own recordings
CREATE POLICY "Users can delete own recordings"
    ON recordings FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- DOCUMENTS POLICIES
-- ============================================

-- Users can view documents in their clinic
CREATE POLICY "Users can view clinic documents"
    ON documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM patients
            WHERE patients.id = documents.patient_id
            AND patients.clinic_id = get_user_clinic_id()
        )
    );

-- Users can upload documents
CREATE POLICY "Users can create documents"
    ON documents FOR INSERT
    WITH CHECK (uploaded_by = auth.uid());

-- Users can update their own documents
CREATE POLICY "Users can update own documents"
    ON documents FOR UPDATE
    USING (uploaded_by = auth.uid());

-- Users can delete their own documents
CREATE POLICY "Users can delete own documents"
    ON documents FOR DELETE
    USING (uploaded_by = auth.uid());

-- ============================================
-- STORAGE POLICIES (for audio recordings and documents)
-- ============================================

-- Note: These policies should be applied via Supabase Dashboard
-- or through storage policy management

-- Example bucket policies (apply in Supabase Dashboard):
/*
-- Create buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Recordings bucket policy
CREATE POLICY "Users can view own clinic recordings"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'recordings'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can upload recordings"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'recordings'
    AND auth.role() = 'authenticated'
);

-- Documents bucket policy
CREATE POLICY "Users can view own clinic documents"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
);
*/
