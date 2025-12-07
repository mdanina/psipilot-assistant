-- PsiPilot Assistant - Fix Patient RLS NULL Check
-- Migration: 019_fix_patient_rls_null_check
-- Description: Fix RLS policy for patient creation when clinic_id comparison fails due to NULL

-- ============================================
-- PROBLEM EXPLANATION
-- ============================================
-- The current policy uses: clinic_id = get_user_clinic_id()
-- If get_user_clinic_id() returns NULL, the comparison NULL = NULL returns NULL (not TRUE)
-- This causes all inserts to fail even when the user has a valid clinic_id in their profile
--
-- Solution: Ensure both values are NOT NULL before comparison

-- ============================================
-- FIX PATIENT INSERT POLICY
-- ============================================

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can create patients" ON patients;

-- Create improved INSERT policy with explicit NULL checks
-- This ensures the comparison only happens when both values are NOT NULL
CREATE POLICY "Users can create patients"
    ON patients FOR INSERT
    WITH CHECK (
        -- User must be authenticated
        auth.uid() IS NOT NULL
        AND
        -- User's clinic_id must not be NULL
        get_user_clinic_id() IS NOT NULL
        AND
        -- Patient's clinic_id must not be NULL
        clinic_id IS NOT NULL
        AND
        -- Clinic IDs must match
        clinic_id = get_user_clinic_id()
    );

COMMENT ON POLICY "Users can create patients" ON patients IS
'Allows authenticated users with a clinic to create patients in their clinic.
Requires that:
1. User is authenticated (auth.uid() IS NOT NULL)
2. User has a clinic assigned (get_user_clinic_id() IS NOT NULL)
3. Patient clinic_id is provided (clinic_id IS NOT NULL)
4. Patient clinic_id matches user clinic_id';

-- ============================================
-- ALSO FIX UPDATE AND DELETE POLICIES
-- ============================================

-- Fix UPDATE policy
DROP POLICY IF EXISTS "Users can update clinic patients" ON patients;
CREATE POLICY "Users can update clinic patients"
    ON patients FOR UPDATE
    USING (
        auth.uid() IS NOT NULL
        AND get_user_clinic_id() IS NOT NULL
        AND clinic_id IS NOT NULL
        AND clinic_id = get_user_clinic_id()
    );

-- Fix DELETE policy
DROP POLICY IF EXISTS "Users can delete clinic patients" ON patients;
CREATE POLICY "Users can delete clinic patients"
    ON patients FOR DELETE
    USING (
        auth.uid() IS NOT NULL
        AND get_user_clinic_id() IS NOT NULL
        AND clinic_id IS NOT NULL
        AND clinic_id = get_user_clinic_id()
    );

-- Fix SELECT policy (also add explicit NULL checks for consistency)
DROP POLICY IF EXISTS "Users can view clinic patients" ON patients;
CREATE POLICY "Users can view clinic patients"
    ON patients FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND get_user_clinic_id() IS NOT NULL
        AND clinic_id IS NOT NULL
        AND clinic_id = get_user_clinic_id()
        AND deleted_at IS NULL
    );
