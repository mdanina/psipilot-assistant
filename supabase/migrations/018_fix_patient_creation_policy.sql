-- PsiPilot Assistant - Fix Patient Creation Policy
-- Migration: 018_fix_patient_creation_policy
-- Description: Fix RLS policy for patient creation to ensure it works correctly

-- ============================================
-- FUNCTION: CREATE PATIENT WITH SECURITY
-- ============================================

-- SECURITY DEFINER function to create patient atomically
-- This bypasses RLS issues and ensures data consistency
CREATE OR REPLACE FUNCTION create_patient_secure(
    p_clinic_id UUID,
    p_name VARCHAR(255),
    p_created_by UUID DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL,
    p_phone VARCHAR(50) DEFAULT NULL,
    p_date_of_birth DATE DEFAULT NULL,
    p_gender VARCHAR(20) DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}'::TEXT[]
)
RETURNS patients
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_patient patients;
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
    
    -- Create the patient
    INSERT INTO patients (
        clinic_id,
        created_by,
        name,
        email,
        phone,
        date_of_birth,
        gender,
        address,
        notes,
        tags
    )
    VALUES (
        p_clinic_id,
        p_created_by,
        p_name,
        p_email,
        p_phone,
        p_date_of_birth,
        p_gender,
        p_address,
        p_notes,
        p_tags
    )
    RETURNING * INTO v_patient;
    
    RETURN v_patient;
END;
$$;

COMMENT ON FUNCTION create_patient_secure IS
'Creates a new patient record with security checks.
Bypasses RLS and ensures the patient is created in the user''s clinic.
Returns the UUID of the created patient.';

GRANT EXECUTE ON FUNCTION create_patient_secure TO authenticated;

-- ============================================
-- FIX PATIENT INSERT POLICY
-- ============================================

-- Drop ALL existing INSERT policies for patients to start fresh
DROP POLICY IF EXISTS "Users can create patients" ON patients;

-- Create improved INSERT policy for patients
-- This policy ensures users can create patients in their clinic
-- Uses a variable to call get_user_clinic_id() only once
CREATE POLICY "Users can create patients"
    ON patients FOR INSERT
    WITH CHECK (
        -- User must be authenticated
        auth.uid() IS NOT NULL
        AND
        -- Clinic ID must match user's clinic ID
        -- get_user_clinic_id() uses SECURITY DEFINER so it bypasses RLS on profiles
        clinic_id = get_user_clinic_id()
    );

COMMENT ON POLICY "Users can create patients" ON patients IS
'Allows authenticated users to create patients in their clinic.
Requires that the clinic_id of the new patient matches the user''s clinic_id from their profile.
Uses get_user_clinic_id() function which has SECURITY DEFINER to bypass RLS.';
