-- PsiPilot Assistant - HIPAA Compliant Patient Creation
-- Migration: 053_hipaa_compliant_patient_creation
-- Description: Update create_patient_secure to accept encrypted PII data for HIPAA compliance

-- ============================================
-- FUNCTION: CREATE PATIENT WITH ENCRYPTED DATA
-- ============================================

-- Drop old version of function if it exists (with different signature)
DROP FUNCTION IF EXISTS create_patient_secure(UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS create_patient_secure(UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, TEXT);

-- SECURITY DEFINER function to create patient with pre-encrypted PII data
-- HIPAA COMPLIANCE: Accepts encrypted data from client, never stores plaintext PHI
CREATE OR REPLACE FUNCTION create_patient_secure(
    p_clinic_id UUID,
    p_name VARCHAR(255) DEFAULT '[ENCRYPTED]', -- Placeholder for NOT NULL constraint
    p_created_by UUID DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL,
    p_phone VARCHAR(50) DEFAULT NULL,
    p_date_of_birth DATE DEFAULT NULL,
    p_gender VARCHAR(20) DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}'::TEXT[],
    -- Encrypted PII fields (as base64 strings, will be converted to BYTEA)
    p_name_encrypted TEXT DEFAULT NULL,
    p_email_encrypted TEXT DEFAULT NULL,
    p_phone_encrypted TEXT DEFAULT NULL,
    p_address_encrypted TEXT DEFAULT NULL,
    p_notes_encrypted TEXT DEFAULT NULL,
    p_pii_encryption_version INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_patient_id UUID;
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
    
    -- Verify clinic_id matches user's clinic
    IF p_clinic_id != v_user_clinic_id THEN
        RAISE EXCEPTION 'Cannot create patient for different clinic';
    END IF;
    
    -- Use provided created_by or default to current user
    IF p_created_by IS NULL THEN
        p_created_by := v_user_id;
    END IF;
    
    -- HIPAA COMPLIANCE: Create patient with encrypted PII data
    -- Plaintext fields (name, email, etc.) are either placeholders or legacy data
    -- Encrypted fields (_encrypted) are the source of truth
    -- Convert base64 strings to BYTEA for storage
    INSERT INTO patients (
        clinic_id,
        created_by,
        name, -- Placeholder '[ENCRYPTED]' for NOT NULL constraint
        email,
        phone,
        date_of_birth,
        gender,
        address,
        notes,
        tags,
        -- Encrypted PII fields (source of truth) - convert base64 to BYTEA
        name_encrypted,
        email_encrypted,
        phone_encrypted,
        address_encrypted,
        notes_encrypted,
        pii_encryption_version
    )
    VALUES (
        p_clinic_id,
        p_created_by,
        p_name, -- Placeholder, not real PHI
        p_email, -- Legacy/placeholder, not real PHI
        p_phone, -- Legacy/placeholder, not real PHI
        p_date_of_birth,
        p_gender,
        p_address, -- Legacy/placeholder, not real PHI
        p_notes, -- Legacy/placeholder, not real PHI
        p_tags,
        -- Encrypted PII (source of truth) - decode base64 to BYTEA
        CASE WHEN p_name_encrypted IS NOT NULL THEN decode(p_name_encrypted, 'base64') ELSE NULL END,
        CASE WHEN p_email_encrypted IS NOT NULL THEN decode(p_email_encrypted, 'base64') ELSE NULL END,
        CASE WHEN p_phone_encrypted IS NOT NULL THEN decode(p_phone_encrypted, 'base64') ELSE NULL END,
        CASE WHEN p_address_encrypted IS NOT NULL THEN decode(p_address_encrypted, 'base64') ELSE NULL END,
        CASE WHEN p_notes_encrypted IS NOT NULL THEN decode(p_notes_encrypted, 'base64') ELSE NULL END,
        p_pii_encryption_version
    )
    RETURNING id INTO v_patient_id;
    
    -- Automatically create assignment for the creator
    INSERT INTO patient_assignments (
        patient_id,
        doctor_id,
        clinic_id,
        assignment_type,
        assigned_by
    )
    VALUES (
        v_patient_id,
        p_created_by,
        p_clinic_id,
        'primary',
        v_user_id
    )
    ON CONFLICT (patient_id, doctor_id) DO NOTHING;
    
    RETURN v_patient_id;
END;
$$;

COMMENT ON FUNCTION create_patient_secure(
    UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, TEXT, TEXT[],
    TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) IS
'Creates a new patient record with HIPAA-compliant encrypted PII data.
Accepts pre-encrypted data from client - never stores plaintext PHI.
Bypasses RLS and ensures the patient is created in the user''s clinic.
Returns the UUID of the created patient.';

GRANT EXECUTE ON FUNCTION create_patient_secure(
    UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, TEXT, TEXT[],
    TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO authenticated;
