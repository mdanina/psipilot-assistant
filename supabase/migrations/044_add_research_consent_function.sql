-- PsiPilot Assistant - Research Consent Function
-- Migration: 044_add_research_consent_function
-- Description: Add function to create research consent for patients

-- ============================================
-- FUNCTION: CREATE RESEARCH CONSENT
-- ============================================

CREATE OR REPLACE FUNCTION create_research_consent(
    p_patient_id UUID,
    p_consent_purpose TEXT DEFAULT 'Использование полностью деидентифицированных медицинских данных для научных исследований и разработки методов лечения. Данные будут использованы только в анонимном виде, без возможности идентификации пациента.',
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_consent_method VARCHAR(100) DEFAULT 'electronic',
    p_collected_by UUID DEFAULT NULL,
    p_notes TEXT DEFAULT 'Создано через функцию create_research_consent. Данные будут полностью деидентифицированы перед предоставлением исследователям.'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_patient_clinic_id UUID;
    v_consent_id UUID;
BEGIN
    -- Get current user ID (if authenticated)
    v_user_id := COALESCE(p_collected_by, auth.uid());
    
    -- Get user's clinic_id (if authenticated)
    IF v_user_id IS NOT NULL THEN
        SELECT clinic_id INTO v_user_clinic_id
        FROM profiles
        WHERE id = v_user_id;
    END IF;
    
    -- Verify patient exists
    SELECT clinic_id INTO v_patient_clinic_id
    FROM patients
    WHERE id = p_patient_id
    AND deleted_at IS NULL;
    
    IF v_patient_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Patient not found or deleted';
    END IF;
    
    -- If user is authenticated and belongs to clinic, verify patient belongs to same clinic
    IF v_user_clinic_id IS NOT NULL AND v_patient_clinic_id != v_user_clinic_id THEN
        RAISE EXCEPTION 'Cannot create consent for patient from different clinic';
    END IF;
    
    -- Check if active research consent already exists
    SELECT id INTO v_consent_id
    FROM consent_records
    WHERE patient_id = p_patient_id
    AND consent_type = 'research'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1;
    
    -- If consent already exists, return existing ID
    IF v_consent_id IS NOT NULL THEN
        RETURN v_consent_id;
    END IF;
    
    -- Create the research consent record
    INSERT INTO consent_records (
        patient_id,
        consent_type,
        consent_purpose,
        legal_basis,
        status,
        given_at,
        expires_at,
        consent_method,
        collected_by,
        data_categories,
        third_party_sharing,
        third_parties,
        notes
    )
    VALUES (
        p_patient_id,
        'research',
        p_consent_purpose,
        'consent', -- Для исследований требуется явное согласие (не contract)
        'active',
        NOW(),
        p_expires_at,
        p_consent_method,
        v_user_id,
        ARRAY['personal', 'health']::TEXT[],
        true, -- Исследователи - третьи лица
        ARRAY['Исследователи (анонимные данные)']::TEXT[],
        p_notes
    )
    RETURNING id INTO v_consent_id;
    
    RETURN v_consent_id;
END;
$$;

COMMENT ON FUNCTION create_research_consent IS 
'Creates a research consent record for a patient.
This function is SECURITY DEFINER, so it can create consent even when
the patient is not visible through normal SELECT policies.

Parameters:
- p_patient_id: UUID of the patient
- p_consent_purpose: Purpose description (default: standard research purpose)
- p_expires_at: Expiration date (NULL = no expiration)
- p_consent_method: Method of consent collection (default: electronic)
- p_collected_by: UUID of user who collected consent (default: current user)
- p_notes: Additional notes

Returns: UUID of the created consent record (or existing if already present)

Example:
SELECT create_research_consent(
    ''patient-uuid-here'',
    ''Исследование эффективности терапии'',
    NULL, -- no expiration
    ''written'',
    NULL, -- current user
    ''Согласие получено при подписании договора''
);';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_research_consent TO authenticated;

-- Revoke public access (security best practice)
REVOKE EXECUTE ON FUNCTION create_research_consent FROM PUBLIC;

