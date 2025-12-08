-- PsiPilot Assistant - Soft Delete Patient Function
-- Migration: 021_soft_delete_patient
-- Description: Create SECURITY DEFINER function to soft delete patients, bypassing RLS circular dependency

-- ============================================
-- PROBLEM EXPLANATION
-- ============================================
-- When deleting a patient, we need to UPDATE the deleted_at field (soft delete).
-- However, RLS policies create a circular dependency:
-- 1. To UPDATE patient, user must be able to see the patient (SELECT policy)
-- 2. To see the patient, patient must have active consent
-- 3. If consent doesn't exist or was withdrawn, patient becomes invisible
-- 4. But we still need to be able to delete patients!
--
-- Solution: Create a SECURITY DEFINER function that bypasses RLS
-- This function can soft delete patients even if they are not visible
-- through normal SELECT policies (due to missing/withdrawn consent)

-- ============================================
-- FUNCTION: SOFT DELETE PATIENT
-- ============================================

CREATE OR REPLACE FUNCTION soft_delete_patient(
    p_patient_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_patient_clinic_id UUID;
    v_rows_updated INTEGER;
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
    WHERE id = p_patient_id;
    
    IF v_patient_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Patient not found';
    END IF;
    
    IF v_patient_clinic_id != v_user_clinic_id THEN
        RAISE EXCEPTION 'Cannot delete patient from different clinic';
    END IF;
    
    -- Check if already deleted
    IF EXISTS (
        SELECT 1 FROM patients
        WHERE id = p_patient_id
        AND deleted_at IS NOT NULL
    ) THEN
        -- Already deleted, return success
        RETURN true;
    END IF;
    
    -- Perform soft delete (UPDATE deleted_at)
    UPDATE patients
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_patient_id;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    IF v_rows_updated = 0 THEN
        RAISE EXCEPTION 'Failed to delete patient';
    END IF;
    
    RETURN true;
END;
$$;

COMMENT ON FUNCTION soft_delete_patient IS
'Soft deletes a patient by setting deleted_at timestamp, bypassing RLS policies.
This function is SECURITY DEFINER, so it can delete patients even when
they are not visible through normal SELECT policies (due to missing/withdrawn consent).

Parameters:
- p_patient_id: UUID of the patient to delete

Returns: true if successful, raises exception on error';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION soft_delete_patient TO authenticated;

-- Revoke public access (security best practice)
REVOKE EXECUTE ON FUNCTION soft_delete_patient FROM PUBLIC;
