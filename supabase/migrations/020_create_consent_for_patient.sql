-- PsiPilot Assistant - Create Consent for Patient Function
-- Migration: 020_create_consent_for_patient
-- Description: Create SECURITY DEFINER function to create consent records, bypassing RLS circular dependency

-- ============================================
-- PROBLEM EXPLANATION
-- ============================================
-- When linking a session to a patient, we need to create a consent record.
-- However, RLS policies create a circular dependency:
-- 1. To create consent, user must be able to see the patient (via SELECT policy)
-- 2. To see the patient, patient must have active consent
-- 3. But consent doesn't exist yet!
--
-- Solution: Create a SECURITY DEFINER function that bypasses RLS
-- This function can create consent records even if the patient is not visible
-- through normal SELECT policies (due to missing consent)

-- ============================================
-- FUNCTION: CREATE CONSENT FOR PATIENT
-- ============================================

CREATE OR REPLACE FUNCTION create_consent_for_patient(
    p_patient_id UUID,
    p_consent_type VARCHAR(100) DEFAULT 'data_processing',
    p_consent_purpose TEXT DEFAULT 'Обработка персональных данных для оказания медицинских услуг в соответствии с договором',
    p_legal_basis VARCHAR(100) DEFAULT 'contract',
    p_notes TEXT DEFAULT 'Автоматически создано при привязке сессии к пациенту. Требует подтверждения.'
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
    -- Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;
    
    -- Get user's clinic_id
    SELECT clinic_id INTO v_user_clinic_id
    FROM profiles
    WHERE id = v_user_id;
    
    IF v_user_clinic_id IS NULL THEN
        RAISE EXCEPTION 'User must belong to a clinic';
    END IF;
    
    -- Verify patient exists and belongs to user's clinic
    -- This check bypasses RLS because we're in SECURITY DEFINER context
    SELECT clinic_id INTO v_patient_clinic_id
    FROM patients
    WHERE id = p_patient_id
    AND deleted_at IS NULL;
    
    IF v_patient_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Patient not found or deleted';
    END IF;
    
    IF v_patient_clinic_id != v_user_clinic_id THEN
        RAISE EXCEPTION 'Cannot create consent for patient from different clinic';
    END IF;
    
    -- Check if consent already exists (to avoid duplicates)
    SELECT id INTO v_consent_id
    FROM consent_records
    WHERE patient_id = p_patient_id
    AND consent_type = p_consent_type
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1;
    
    -- If consent already exists, return existing ID
    IF v_consent_id IS NOT NULL THEN
        RETURN v_consent_id;
    END IF;
    
    -- Create the consent record
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
    )
    VALUES (
        p_patient_id,
        p_consent_type,
        p_consent_purpose,
        p_legal_basis,
        'active',
        NOW(),
        'electronic',
        v_user_id,
        ARRAY['personal', 'health']::TEXT[],
        p_notes
    )
    RETURNING id INTO v_consent_id;
    
    RETURN v_consent_id;
END;
$$;

COMMENT ON FUNCTION create_consent_for_patient IS
'Creates a consent record for a patient, bypassing RLS policies.
This function is SECURITY DEFINER, so it can create consent even when
the patient is not visible through normal SELECT policies (due to missing consent).
This solves the circular dependency: consent is needed to see patient,
but consent cannot be created without seeing patient.

Parameters:
- p_patient_id: UUID of the patient
- p_consent_type: Type of consent (default: data_processing)
- p_consent_purpose: Purpose description
- p_legal_basis: Legal basis (default: contract)
- p_notes: Additional notes

Returns: UUID of the created consent record (or existing if already present)';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_consent_for_patient TO authenticated;

-- Revoke public access (security best practice)
REVOKE EXECUTE ON FUNCTION create_consent_for_patient FROM PUBLIC;
